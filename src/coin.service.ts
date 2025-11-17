import dotenv from 'dotenv';
import {Wallet, isAddress} from "ethers";
import {AccountCreateTransaction, Client, Hbar, PrivateKey, TransferTransaction} from "@hashgraph/sdk";
import {
    AddressCreateResult,
    AddressKeyPair,
    AddressValidateResult,
    BaseCoinService,
    BaseNodeAdapter,
    NodesOptions,
    TxSignResult,
} from './common';
import {HBARNodeAdapter} from './node-adapter';
import {HBARTransactionParams} from './types';
import {safeLog} from "./utils/safeLogger";
dotenv.config({ path: './docker/.env', debug: false, });

/**
 * Основной класс для все монеты.
 * Вместо ХХХ указываем тикер.
 * BaseCoinService - это базовый класс который определяет все методы и их типы.
 */
export class HBARCoinService extends BaseCoinService {
    public nodes: BaseNodeAdapter[] = [];
    public blockBooks: BaseNodeAdapter[] = [];
    public readonly network = 'HBAR';
    protected mainNodeAdapter = HBARNodeAdapter;

    /**
     * Инициализация провайдера(ов).
     */
    initNodes(
        nodes: NodesOptions,
    ): void {
        this.nodes = Object.entries(nodes).map(([name, opts]) => {
            const rpcUrl: string = opts.rpcUrl;
            const mirrorUrl: string = opts.mirrorUrl;
            let headers: Array<{ name: string; value: string }>;

            if (opts.headers) {
                if (!headers?.length) {
                    headers = [];
                }

                Object.entries(opts.headers).forEach(([name, value]) => {
                    headers.push({name, value});
                });
            }

            return new this.mainNodeAdapter(
                this.network,
                name,
                rpcUrl,
                mirrorUrl,
                opts.confirmationLimit,
            );
        });
    }

    /**
     * Функция создания адреса.
     *
     * Генерация обычно состоит из нескольких пунктов
     * 1. Генерация случайного значения. Чаще всего используется `Buffer.from(crypto.randomBytes(32)`.
     * 2. Из случайного значения генерируется приватный ключ (privateKey).
     * 3. Из приватного ключа генерируется публичный ключ (publicKey).
     * 4. Из публичного ключа генерируется адрес.
     */
    async addressCreate(
        ticker: string,
    ): Promise<AddressCreateResult> {
        // Загружаем оператора, который оплатит создание аккаунта
        const operatorId = process.env.FAST_TEST_FROM_ID!;
        const operatorKey = process.env.FAST_TEST_FROM_PRIVATE_KEY!;

        if (!operatorId || !operatorKey) {
            throw new Error("Не установлены FAST_TEST_FROM_ID или FAST_TEST_FROM_PRIVATE_KEY в .env");
        }

        const client = Client.forTestnet().setOperator(operatorId, operatorKey);

        // 1. Генерация приватного ключа (ED25519)
        const privateKey = PrivateKey.generateED25519();
        const publicKey = privateKey.publicKey;

        // 2. Создание аккаунта
        const tx = new AccountCreateTransaction()
            .setKey(publicKey)
            .setInitialBalance(new Hbar(1)); // минимум 1 HBAR на Testnet

        const txResponse = await tx.execute(client);
        const receipt = await txResponse.getReceipt(client);

        const accountId = receipt.accountId?.toString();

        if (!accountId) {
            throw new Error("Ошибка: Hedera не вернула AccountId");
        }

        await safeLog("info", "Created Hedera Testnet account", {
            ticker,
            accountId,
            publicKey: publicKey.toStringRaw(),
        });

        return {
            address: accountId,
            privateKey: privateKey.toStringRaw(),
            publicKey: publicKey.toStringRaw(),
        };
    }

    /**
     * Функция валидации адреса.
     *
     * Проверяем адрес по разным шаблонам (длинна, символы, чек-сумма и тд.) Для разных сетей условия будут разные в зависимости от формата адресов.
     * В случае если адрес не прошел проверку не нужно генерировать ошибку, а нужно вернуть строку с описание какую проверку он не прошел.
     * В случае если пройдены все проверки возвращаем `true`.
     */
    async addressValidate(
        ticker: string,
        address: string,
        privateKey: string,
        publicKey: string,
    ): Promise<AddressValidateResult> {
        if (!address) {
            await safeLog("error", "Validation failed: missing address", { ticker });
            return "Адрес отсутствует";
        }

        if (!privateKey) {
            await safeLog("error", "Validation failed: missing privateKey", { ticker, address });
            return "Приватный ключ отсутствует";
        }

        if (!publicKey) {
            await safeLog("error", "Validation failed: missing publicKey", { ticker, address });
            return "Публичный ключ отсутствует"
        };

        if (!isAddress(address)) {
            const reason = "Неверный формат адреса";
            await safeLog("error", "Address validation failed", { ticker, address, reason });
            return reason;
        }

        if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
            await safeLog("error", "Validation failed: invalid privateKey format", {
                ticker,
                privateKey,
            });
            return "Некорректный формат приватного ключа (ожидается 32 байта в hex)";
        }

        // Упрощённая и корректная проверка для Ethers v6
        if (!publicKey.startsWith("0x") || !/^[0-9a-fA-F]+$/.test(publicKey.slice(2))) {
            await safeLog("error", "Validation failed: invalid publicKey format", {
                ticker,
                publicKey,
            });
            return "Некорректный формат публичного ключа (должен быть hex)";
        }

        try {
            const walletFromPriv = new Wallet(privateKey);

            if (walletFromPriv.address.toLowerCase() !== address.toLowerCase()) {
                await safeLog("error", "Validation failed: privateKey does not match address", {
                    ticker,
                    address,
                });
                return "Приватный ключ не соответствует указанному адресу";
            }

            // Всё успешно
            await safeLog("info", "Address validation successful", { ticker, address });
        } catch(err: any) {
            await safeLog("error", "Unexpected error during address validation", {
                ticker,
                address,
                error: err.message,
            });
            return "Ошибка при проверке приватного ключа";
        }

        return true;
    }

    /**
     * Функция подписи транзакции.
     *
     * Подпись транзакции необходима для того чтобы подтвердить что действительно владелец счета хочет перевести средства с этого адреса. Для подписи используется приватник.
     * Объект на подпись приходит такой который вы вернули в функции txBuild.
     */
    async txSign(
        ticker: string,
        privateKeys: AddressKeyPair,
        params: HBARTransactionParams,
    ): Promise<TxSignResult> {
        try {
            await safeLog("info", "Начинаем подпись транзакции", { ticker, params });

            // Приводим к массиву
            const fromArr = Array.isArray(params.from) ? params.from : [params.from];
            const toArr = Array.isArray(params.to) ? params.to : [params.to];

            if (!fromArr.length) {
                await safeLog("error", "Проверка не пройдена: отсутствует from[]", { ticker });
                throw new Error("Отсутствует список отправителей");
            }

            if (!toArr.length) {
                await safeLog("error", "Проверка не пройдена: отсутствует to[]", { ticker });
                throw new Error("Отсутствует список получателей");
            }

            // Проверяем что приватный ключ для всех from есть
            for (const fromAddr of fromArr) {
                const addr = fromAddr.address;

                if (!privateKeys[addr]) {
                    await safeLog("error", "Отсутствует приватный ключ для отправителя", {
                        ticker,
                        addr,
                    });
                    throw new Error(`Отсутствует приватный ключ для отправителя ${addr}`);
                }
            }

            // Создаём транзакцию
            const tx = new TransferTransaction();

            // Добавляем отправителей (negative amounts)
            for (const fromAddr of fromArr) {
                const addr = fromAddr.address;

                // Превращаем в число
                const amountTiny = Number(fromAddr.value);

                if (!amountTiny || amountTiny <= 0) {
                    await safeLog("error", "Некорректная сумма списания для отправителя", {
                        ticker,
                        addr,
                        amountTiny,
                    });
                    throw new Error(
                        `Некорректная сумма списания для ${addr}: ${amountTiny}`
                    );
                }

                tx.addHbarTransfer(addr, Hbar.fromTinybars(-amountTiny));
            }

            // Добавляем получателей (positive amounts)
            for (const toAddr of toArr) {
                const addr = toAddr.address;
                const amountTiny = Number(toAddr.value);

                if (!amountTiny || amountTiny <= 0) {
                    await safeLog("error", "Некорректная сумма начисления для получателя", {
                        ticker,
                        addr,
                        amountTiny,
                    });
                    throw new Error(
                        `Некорректная сумма начисления для ${addr}: ${amountTiny}`
                    );
                }

                tx.addHbarTransfer(addr, Hbar.fromTinybars(amountTiny));
            }

            // Freeze
            tx.freeze();

            await safeLog("info", "Транзакция собрана и заморожена", { ticker });

            // Подписываем приватным ключом первого отправителя
            // (Hedera позволяет мультиподпись, но в простом случае подписывает один)
            const signerAddr = params.from[0];
            const privHex = privateKeys[signerAddr];

            const privKey = PrivateKey.fromStringECDSA(privHex);

            await safeLog("info", "Подписываем транзакцию приватным ключом", {
                ticker,
                signerAddr,
            });

            const signedTx = await tx.sign(privKey);

            // Сериализация
            const signedBytes = Buffer.from(signedTx.toBytes()).toString("hex");

            await safeLog("info", "Транзакция успешно подписана", {
                ticker,
                signedBytesLength: signedBytes.length,
            });

            return {
                signedData: signedBytes,
                txHash: signedTx.transactionId?.toString() ?? "",
            };
        } catch (err: any) {
            await safeLog("error", "Ошибка во время подписи транзакции", {
                ticker,
                error: err.message,
                stack: err.stack,
            });
            throw err;
        }
    }

    /**
     * Функция сборки транзакции.
     *
     * Билд транзакции — это сборки из исходного запроса `params` объекта адаптированного под сеть, которую остается только подписать.
     * Обычно флоу это функции следующее:
     * - проверка входящий данных (валидация);
     * - запрос необходимых сетевых данных (utxo/customNonce/height);
     * - приведение объекта к формату сети.
     */
    async txBuild(
        ticker: string,
        params: HBARTransactionParams,
    ): Promise<HBARTransactionParams> {
        await safeLog("info", "Строим транзакцию", { ticker, params });

        // Hedera HBAR не требует UTXO, просто возвращаем валидированные данные.
        // Но можем подготовить структуру, привести from/to к массивам и т.д.

        const fromArr = Array.isArray(params.from) ? params.from : [params.from];
        const toArr = Array.isArray(params.to) ? params.to : [params.to];

        const built: HBARTransactionParams = {
            from: fromArr,
            to: toArr,
            fee: params.fee,
            spent: params.spent ?? {},
            utxo: params.utxo ?? {},
            unsignedTx: params.unsignedTx ?? ""
        };

        await safeLog("info", "Транзакция построена");

        return built;
    }
}
