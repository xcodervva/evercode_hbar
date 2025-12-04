import axios, { AxiosRequestConfig } from "axios";
import {
    AdapterType,
    BalanceByAddressResult,
    BaseNodeAdapter,
    FromParams,
    GetBlockResult,
    GetHeightResult,
    ToParams,
    TxByHashResult,
    TxStatus,
    Transaction, RpcResponse,
} from './common';
import {
    HBARTransactionBroadcastParams,
    HBARTransactionBroadcastResults
} from './types';
import {safeLog} from "./utils/safeLogger";
import dotenv from "dotenv";
import {
    AccountId,
    Client,
    PrivateKey,
    Transaction as HTransaction,
} from "@hashgraph/sdk";

import { sanitizeUrl } from "./utils/sanitizeUrl";

dotenv.config({ path: './docker/.env', debug: false, quiet: true });

/**
 * Класс, который инициализируется в HBARCoinService для выполнения сетевых запросов.
 *
 * Вместо ХХХ указываем тикер.
 * BaseNodeAdapter - это базовый класс который определяет все методы и их типы.
 * @param network - короткое название сети.
 * @param name - Название провайдера, под которого пишется адаптер (NowNodes, GetBlock, Ankr  и тд).
 * @param confirmationLimit - Количество конфирмаций, число блоков которое отсчитывается после транзакции, чтобы считать ее завершенной.
 * @param utxoConfirmationLimit - Опциональное значение, используется только для сетей с utxo. Количество конфирмаций для utxo, число блоков которое отсчитывается после транзакции, чтобы считать ее завершенной.
 */
export class HBARNodeAdapter extends BaseNodeAdapter {
    constructor(
        readonly network: string,
        readonly name: string = 'QuickNode',
        readonly rpcUrl: string,
        readonly mirrorUrl: string,
        readonly confirmationLimit: number,
        readonly utxoConfirmationLimit?: number,
        readonly type = AdapterType.Node,
    ) {
        super();
    }

    /**
     * Функция, которая возвращается отформатированные данных по hash'у транзакции и тикеру.
     *
     * Стандартная реализация подразумевает сетевой запрос в сеть по hash'у и получение сырых данных из сети. Которые потом форматируются под ответ.
     * 1. Валидация по методу. В данной реализации поддерживаем только дефолтный метод трансфера. От сети к сети этот метод может отличаться, он может быть как дефолтный и заложен сетью, так и выполняться через специализированный контракт.
     * 2. Валидация по тикеру. Транзакции могут быть как токеновые, так и с нативной монетой. В данное реализации интересуют только транзакции нативной монеты.
     * 3. Валидация по статусу.
     *
     * Рекомендуется сделать дополнительный метод "processTransaction" который будет форматировать сырую транзакцию (не приведенную к общему типу) к формату который требуется на выходе TxByHashResult.
     * Если транзакция является batch-транзакцией (одна транзакция, где средства поступают на несколько адресов), то их необходимо разделить на разные транзакции с одним hash'ом.
     *
     * В случая если сеть не btc-like (нет utxo) и processTransaction вернул массив транзакций, то необходимо взять только первую транзакцию. Так как этот метод, в основном, важен только для получения статуса транзакции.
     */
    async txByHash(
        ticker: string,
        hash: string,
    ): Promise<TxByHashResult> {
        try {
            await safeLog("info", "Fetching Hedera tx from API", {ticker, hash});

            // Mirror Node API возвращает список транзакций по id
            const response = await this.request<{  transactions: any[] }, void>( 'GET',`${this.mirrorUrl}/api/v1/transactions/${hash}`);

            if (!response.transactions?.length) {
                const reason = "Transaction not found";
                await safeLog("error", "txByHash failed", {ticker, hash, reason});
                throw new Error(reason);
            }

            const rawTx = response.transactions[0];
            const transfers = rawTx?.transfers || [];

            const from: FromParams[] = transfers
                .filter((t: any) => t.amount < 0)
                .map((t: any) => ({
                    address: t.account,
                    value: Math.abs(t.amount).toString(),
                }));

            const to: ToParams[] = transfers
                .filter((t: any) => t.amount > 0)
                .map((t: any) => ({
                    address: t.account,
                    value: t.amount.toString(),
                }));

            const status: TxStatus =
                rawTx.result === "SUCCESS" ? TxStatus.finished :
                    rawTx.result === "PENDING" ? TxStatus.unknown : TxStatus.failed;

            const transaction: Transaction = {
                hash,
                ticker,
                from,
                to,
                status,
                height: rawTx.consensus_timestamp
                    ? Number(rawTx.consensus_timestamp.split(".")[0])
                    : undefined,
            };

            await safeLog("info", "Transaction parsed successfully", {ticker, hash, status});

            return transaction;
        } catch (error) {
            await safeLog("error", "txByHash failed", {
                ticker,
                hash,
                reason: (error as Error).message,
            });
            throw error;
        }
    }

    /**
     * Функция запроса высоты блокчейна.
     */
    async getHeight(): Promise<GetHeightResult> {
        try {
            const response = await this.rpcRequest<string>(
                'POST',
                'eth_blockNumber'
            );

            // 🔍 Проверяем, что result — действительно строка
            if (typeof response.result !== "string") {
                throw new Error(
                    `Invalid RPC response type: expected string, got ${typeof response.result}`
                );
            }

            // Преобразуем результат в число (hex → int)
            const height = parseInt(response.result, 16); // RPC возвращает hex значение

            await safeLog("info", "Fetched blockchain height (QuickNode RPC)", {
                height,
                url: sanitizeUrl(this.rpcUrl),
            });

            // Проверяем, корректен ли результат
            if (Number.isNaN(height)) {
                throw new Error(`Invalid block height received: ${response.result}`);
            }

            return height;
        } catch (error: any) {
            await safeLog("error", "Failed to fetch blockchain height", {
                network: this.network,
                reason: error.message,
                url: sanitizeUrl(this.rpcUrl),
            });

            throw new Error(`Ошибка при получении высоты сети: ${error.message}`);
        }
    }

    /**
     * Функция запроса блока и транзакций которые в этом блоке находятся по его высоте.
     */
    async getBlock(
        height: number,
    ): Promise<GetBlockResult> {
        await safeLog("info", `Запрашивается блок №${height}`);

        // Проверка существования блока
        const currentHeight = await this.getHeight();

        if (height > currentHeight) {
            await safeLog(
                "warn",
                `Запрошенный блок ${height} пока недоступен`,
                { height, currentHeight }
            );

            throw new Error(`Запрошенный блок ${height} пока недоступен. Текущая высота: ${currentHeight}`);
        }

        // Запрос к Mirror Node
        const data = await this.request<{ blocks: any[] }, void>(
            'GET',
            `${this.mirrorUrl}/api/v1/blocks/${height}`,
        );

        const block = data.blocks?.[0];

        if (!block) {
            await safeLog("error", `Блок №${height} не найден`);
            throw new Error(`Блок №${height} не найден`);
        }

        // Формируем список транзакций
        const transactions: Transaction[] = (block.transactions || []).map((tx: any) => ({
            hash: tx.transaction_id,
            ticker: "HBAR", // для тестнета Hedera по умолчанию
            from: [],       // Mirror Node не всегда возвращает участников напрямую
            to: [],
            status: tx.result === "SUCCESS" ? "success" : "failed",
            height: block.number,
            raw: tx,
        }));

        await safeLog("info", `Блок №${height} успешно получен`, {
            txCount: transactions.length,
        });

        return {
            height: block.number,
            timestamp: new Date(Number(block.timestamp.from.split(".")[0]) * 1000),
            transactions,
            data: block, // сохраняем исходный ответ блока
        };
    }

    /**
     * Функция запроса баланса по адресу и тикеру.
     */
    async balanceByAddress(
        ticker: string,
        address: string,
    ): Promise<BalanceByAddressResult> {
        await safeLog("info", `Запрашиваем баланс для адреса ${address}`, { ticker, address });

        const url = `${this.mirrorUrl}/api/v1/accounts/${address}`;

        try {
            // Выполняем запрос к Mirror Node
            const data = await this.request<{ balance: { balance: number; tokens: any[] } }, void>(
                'GET',
                url
            );

            if (!data.balance) {
                await safeLog("error", `Баланс для адреса ${address} не найден`, { address });
                throw new Error(`Баланс для адреса ${address} не найден`);
            }

            let balance = 0;
            let totalBalance = data.balance.balance;

            // Если тикер HBAR
            if (ticker === "HBAR") {
                balance = data.balance.balance;
            } else {
                // Ищем токен в списке
                const tokenBalance = data.balance.tokens.find((token) => token.token_id === ticker);

                if (tokenBalance) {
                    balance = tokenBalance.balance;
                } else {
                    // Если токен не найден, возвращаем 0
                    balance = 0;
                }
            }

            await safeLog("info", `Баланс успешно получен для адреса ${address}`, {
                ticker,
                balance,
                totalBalance,
            });

            // Возвращаем результат, преобразуя баланс в строки
            return {
                balance: balance.toString(),
                totalBalance: totalBalance.toString(),
            };
        } catch (error) {
            // Логируем ошибку запроса
            await safeLog("error", `Ошибка при запросе баланса для адреса ${address}`, {
                ticker,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Функция отправки в сеть подписанной транзакции.
     */
    async txBroadcast(
        ticker: string,
        params: HBARTransactionBroadcastParams,
    ): Promise<HBARTransactionBroadcastResults | { error: string }> {
        try {
            // Проверяем, что входные данные корректные
            if (!params.signedData) {
                throw new Error("Отсутствует signedData");
            }

            await safeLog("info", "Отправка транзакции", {
                ticker,
                size: params.signedData.length,
            });

            const operatorIdStr = process.env.FAST_TEST_FROM_ID;
            const operatorKeyStr = process.env.FAST_TEST_FROM_PRIVATE_KEY;

            if (!operatorIdStr || !operatorKeyStr) {
                throw new Error("Не заданы FAST_TEST_FROM_ID или FAST_TEST_FROM_PRIVATE_KEY");
            }

            const operatorId = AccountId.fromString(operatorIdStr);
            const operatorKey = PrivateKey.fromString(operatorKeyStr);
            const client = Client.forMainnet().setOperator(operatorId, operatorKey);

            // Проверяем, что входные данные корректные
            if (!params.signedData) {
                throw new Error("Отсутствует signedData");
            }

            // Распаковываем транзакцию (hex или base64)
            let txBytes: Buffer;

            if (/^[0-9a-fA-F]+$/.test(params.signedData)) {
                txBytes = Buffer.from(params.signedData, "hex");
            } else {
                txBytes = Buffer.from(params.signedData, "base64");
            }

            const tx = HTransaction.fromBytes(txBytes);

            // Выполняем транзакцию
            const response = await tx.execute(client);
            const receipt = await response.getReceipt(client);

            const hash = response.transactionId.toString();

            await safeLog("info", "Транзакция успешно отправлена", {
                ticker,
                hash,
                status: receipt.status.toString(),
            });

            return { hash };

        } catch (err: any) {
            await safeLog("error", "Ошибка отправки транзакции", {
                ticker,
                reason: err.message,
                stack: err.stack,
            });

            return { error: err.message ?? "Broadcast failed" };
        }
    }

    /**
     * Функция-обертка для выполнения сетевого запроса.
     */
    protected async request<T, U>(method: 'POST' | 'GET' | 'PUT' | 'DELETE', url: string, data?: U, headers?: Record<string, string | number>): Promise<T> {
        const config: AxiosRequestConfig = {
            method,
            url,
            headers: {
                "Content-Type": "application/json",
                ...(headers || {}),
            },
        };

        if (data && method !== "GET") {
            config.data = data;
        }

        try {
            const response = await axios.request<T>(config);

            if (!response || typeof response.data === "undefined") {
                await safeLog("warn", "HTTP request returned no data", {
                    method,
                    url,
                    status: response?.status || "unknown",
                });
                throw new Error(`Empty response received [${method} ${url}]`);
            }

            await safeLog("info", "HTTP request successful", {
                method,
                url,
                status: (response.status || "unknown"),
            });

            return response.data;
        } catch (error: any) {
            const reason = error?.response?.data?.error?.message || error.message;

            await safeLog("error", "HTTP request failed", {
                method,
                url,
                reason,
                status: error?.response?.status || "unknown",
            });

            throw new Error(`Request failed [${method} ${url}]: ${reason}`);
        }
    }

    protected async rpcRequest<T>(
        httpMethod: 'POST' | 'GET' | 'PUT' | 'DELETE',
        rpcMethod: string,
        params: unknown[] = []
    ): Promise<RpcResponse<T>> {
        const payload = {
            jsonrpc: "2.0",
            method: rpcMethod,
            params,
            id: 1,
        };

        const response = await this.request<RpcResponse<T>, typeof payload>(
            httpMethod,
            this.rpcUrl,
            payload
        );

        if (response.error) {
            await safeLog("error", "RPC request failed", {
                method: rpcMethod,
                url: this.rpcUrl,
                reason: response.error.message,
            });

            throw new Error(`RPC Error [${rpcMethod}]: ${response.error.message}`);
        }

        if (typeof response.result === "undefined") {
            throw new Error(`RPC response missing result for method: ${rpcMethod}`);
        }

        // Успешный результат
        await safeLog("info", "RPC request successful", {
            method: rpcMethod,
            url: this.rpcUrl,
        });

        return response;
    }
}
