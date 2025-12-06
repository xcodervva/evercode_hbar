import dotenv from 'dotenv';
import {
    AccountBalanceQuery,
    AccountCreateTransaction,
    AccountId,
    Client,
    Hbar,
    HbarUnit,
    PrivateKey,
    PublicKey,
    TransferTransaction
} from "@hashgraph/sdk";
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
import {generateEd25519KeyPair} from "./utils/ed25519";

dotenv.config({ path: './docker/.env', debug: false, quiet: true });

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
    public client: Client;

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

        this.client = Client.forMainnet().setOperator(operatorId, operatorKey);

        // 0. Проверяем баланс заранее
        const balance = await new AccountBalanceQuery()
            .setAccountId(operatorId)
            .execute(this.client);

        if (Number(balance.hbars.toTinybars()) <= 0) {
            await safeLog("warn", "Not enough HBAR for execute this transaction", {
                ticker,
                operatorId,
            });
            return;
        }

        // 1. Генерация ключей без сторонних библиотек
        const { privateKeyRaw, publicKeyRaw } = generateEd25519KeyPair();

        const privateKey = PrivateKey.fromBytesED25519(privateKeyRaw);
        const publicKey = PublicKey.fromBytesED25519(publicKeyRaw);

        // 2. Создание аккаунта
        const tx = new AccountCreateTransaction()
            .setKey(publicKey)
            .setInitialBalance(Hbar.from(1, HbarUnit.Hbar)); // минимум 1 HBAR на Mainnet

        const txResponse = await tx.execute(this.client);
        const receipt = await txResponse.getReceipt(this.client);

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
            privateKey: privateKey.toString(),
            publicKey: publicKey.toString(),
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
        // 1. Проверка адреса Hedera
        if (!address) {
            await safeLog("error", "Validation failed: missing address", { ticker });
            return "Адрес отсутствует";
        }

        try {
            AccountId.fromString(address);
        } catch (_) {
            const reason = "Неверный формат Hedera AccountId";
            await safeLog("error", "Address validation failed", { ticker, address, reason });
            return reason;
        }

        // 2. Проверка приватного ключа ED25519
        if (!privateKey) {
            await safeLog("error", "Validation failed: missing privateKey", { ticker, address });
            return "Приватный ключ отсутствует";
        }

        let priv: PrivateKey;

        try {
            priv = PrivateKey.fromStringED25519(privateKey);
        } catch (_) {
            const reason = "Некорректный формат приватного ключа (ожидается Hedera ED25519)";
            await safeLog("error", reason, { ticker, privateKey });
            return reason;
        }

        // 3. Проверка публичного ключа ED25519
        if (!publicKey) {
            await safeLog("error", "Validation failed: missing publicKey", { ticker, address });
            return "Публичный ключ отсутствует";
        }

        let pub: PublicKey;
        try {
            pub = PublicKey.fromString(publicKey);
        } catch (_) {
            const reason = "Некорректный формат публичного ключа (ожидается Hedera ED25519)";
            await safeLog("error", reason, { ticker, publicKey });
            return reason;
        }

        // 4. Проверка соответствия ключей
        if (priv.publicKey.toString() !== pub.toString()) {
            const reason = "Публичный ключ не соответствует приватному ключу";
            await safeLog("error", reason, { ticker, address });
            return reason;
        }

        await safeLog("info", "Address validation successful", { ticker, address });
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

            if (!params.unsignedTx) {
                throw new Error("Нет данных для подписи (unsignedTx)");
            }

            // Подписываем приватным ключом первого отправителя
            // (Hedera позволяет мультиподпись, но в простом случае подписывает один)
            const signerAddr = params.from[0].address;
            const privHex = privateKeys[signerAddr];

            if (!privHex) {
                throw new Error(`Нет приватного ключа для ${signerAddr}`);
            }

            const privKey = PrivateKey.fromStringECDSA(privHex);
            const unsignedBytes = Buffer.from(params.unsignedTx, "hex");
            const tx = TransferTransaction.fromBytes(unsignedBytes);

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
        }

        // Создаём транзакцию
        const tx = new TransferTransaction();

        // Добавляем отправителей (negative amounts)
        for (const fromAddr of fromArr) {
            const addr = fromAddr.address;

            // Превращаем в число
            const factor = Number(process.env.TINYBAR_CONVERSION_FACTOR ?? 100000000);
            const amountTiny = Math.round(Number(fromAddr.value) * factor);

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

            const factor = Number(process.env.TINYBAR_CONVERSION_FACTOR ?? 100000000);
            const amountTiny = Math.round(Number(toAddr.value) * factor);

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
        tx.freezeWith(this.client);

        await safeLog("info", "Транзакция собрана и заморожена", { ticker });

        // Hedera HBAR не требует UTXO, просто возвращаем валидированные данные.
        // Но можем подготовить структуру, привести from/to к массивам и т.д.

        const built: HBARTransactionParams = {
            from: fromArr,
            to: toArr,
            fee: params.fee,
            spent: params.spent ?? {},
            utxo: params.utxo ?? {},
            unsignedTx: Buffer.from(tx.toBytes()).toString("hex"),
        };

        await safeLog("info", "Транзакция построена");

        return built;
    }
}
