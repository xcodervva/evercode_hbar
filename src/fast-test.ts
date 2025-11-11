import dotenv from 'dotenv';
import {AddressCreateResult, NodesOptions, TransactionParams} from "./common";
import { HBARCoinService } from "./coin.service";

dotenv.config({ path: './docker/.env', debug: false, });

void (async function (): Promise<void> {
    // Пример как вызывать создание адреса
    const address = async (ticker: string): Promise<void> => {
        const address: AddressCreateResult = await service.addressCreate(ticker);
        console.log('Result address:', address);
    };

    // Высота
    const height = async (): Promise<void> => {
        const heightChain: number = await service.nodes[0].getHeight();
        console.log('Height:', heightChain);
    };

    // создание сервиса
    const service: HBARCoinService = new HBARCoinService();

    const params: TransactionParams = {
        from: [
            {
                address: '<address_from>',
                value: '0.00005',
            },
        ],
        to: [
            {
                address: '<address_to>',
                value: '0.00005',
            },
        ],
        fee: {
            networkFee: 0.01,
            properties: {},
        },
    };

    const keyPair = {
        '<address>': '<private_key>',
    };

    // конфиг провайдера
    const config: NodesOptions =
        {
            node: {
                url: process.env.HEDERA_RPC_URL!,
                rpcUrl: process.env.HEDERA_RPC_URL!,
                mirrorUrl: process.env.MIRROR_URL_HBAR,
                confirmationLimit: 10,
            },
        };

    // инициализация провайдера
    service.initNodes(config);

    try {
        // вызов функции создания адреса
        await address(service.network);

        // вызов функции получения высоты
        await height();
    } catch (e) {
        console.error(e);
    }

    // для дебагера
    await new Promise(r => setTimeout(r, 60 * 1000));
}());