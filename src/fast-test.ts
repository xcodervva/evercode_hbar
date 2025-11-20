import dotenv from 'dotenv';
import {
    AddressCreateResult,
    AddressKeyPair,
    NodesOptions,
    TransactionBroadcastResults,
    TransactionParams,
    TxSignResult
} from "./common";
import { HBARCoinService } from "./coin.service";

dotenv.config({ path: './docker/.env', debug: false, });

void (async function (): Promise<void> {
    let newAddress: AddressCreateResult | null = null;

    // Пример как вызывать создание адреса
    const address = async (ticker: string): Promise<void> => {
        newAddress = await service.addressCreate(ticker);
        console.log('Result address:', newAddress);
    };

    // Высота
    const height = async (): Promise<void> => {
        const heightChain: number = await service.nodes[0].getHeight();
        console.log('Height:', heightChain);
    };

    // Транзакция
    const transaction = async (ticker: string, keyPair: AddressKeyPair, params: TransactionParams): Promise<void> => {
        const build: TransactionParams = await service.txBuild(ticker, params);
        const sign: TxSignResult = await service.txSign(ticker, keyPair, build);
        const broadcast: TransactionBroadcastResults | { error: string } = await service.nodes[0].txBroadcast(ticker, sign);
        console.log('Transaction:', broadcast);
    };

    // создание сервиса
    const service: HBARCoinService = new HBARCoinService();

    const params: TransactionParams = {
        from: [
            {
                address: process.env.FAST_TEST_FROM_ID!,
                value: '0.00005',
            },
        ],
        to: [
            {
                address: newAddress.address,
                value: '0.00005',
            },
        ],
        fee: {
            networkFee: 0.001,
            properties: {},
        },
        unsignedTx: "",
    };

    const keyPair = {
        [process.env.FAST_TEST_FROM_ID!]: process.env.FAST_TEST_FROM_PRIVATE_KEY!,
    };

    // конфиг провайдера
    const config: NodesOptions =
        {
            node: {
                rpcUrl: process.env.HEDERA_RPC_URL!,
                mirrorUrl: process.env.MIRROR_URL_HBAR!,
                confirmationLimit: 10,
            },
        };

    // инициализация провайдера
    service.initNodes(config);

    try {
        // вызов функции создания адреса
        await address(service.network);

        // вызов функции получения высоты
        //await height();

        // вызов функции отправки транзакции
        //await transaction(service.network, keyPair, params);
    } catch (e) {
        console.error(e);
    }

    // для дебагера
    await new Promise(r => setTimeout(r, 60 * 1000));
}());