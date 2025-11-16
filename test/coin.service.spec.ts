import { isAddress, Wallet, HDNodeWallet, Mnemonic } from "ethers";
import { TransferTransaction, Hbar, PrivateKey } from "@hashgraph/sdk";
import { HBARCoinService } from '../src/coin.service';
import { HBARNodeAdapter } from '../src/node-adapter';
import * as safeLogger from "../src/utils/safeLogger";
import {FromParams, ToParams} from "../src/common";

// Мокаем safeLog, чтобы не происходило реальное логирование
jest.mock("../src/utils/safeLogger", () => ({
  safeLog: jest.fn(),
}));
jest.mock("@hashgraph/sdk");

describe('address creation', () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
  });

  it('creates unpredictable address', async () => {
    const ticker = service.network;

    const result1 = await service.addressCreate(ticker);
    const result2 = await service.addressCreate(ticker);

    // 1. Проверяем, что структура данных корректна
    expect(result1).toHaveProperty("address");
    expect(result1).toHaveProperty("privateKey");
    expect(result1).toHaveProperty("publicKey");

    // 2. Проверяем, что адрес корректен по формату
    expect(isAddress(result1.address)).toBe(true);
    expect(isAddress(result2.address)).toBe(true);

    // 3. Проверяем, что адреса и ключи разные (непредсказуемость)
    expect(result1.address).not.toEqual(result2.address);
    expect(result1.privateKey).not.toEqual(result2.privateKey);
    expect(result1.publicKey).not.toEqual(result2.publicKey);

    // 4. Проверяем, что приватный ключ начинается с '0x'
    expect(result1.privateKey.startsWith("0x")).toBe(true);

    // 5. Проверяем, что safeLog вызван
    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        "Created new wallet address",
        expect.objectContaining({
          ticker,
          address: expect.any(String),
          privateKey: expect.any(String),
        }),
    );
  });

  it('creates known address', async () => {
    const ticker = service.network;
    // Детерминированные данные
    const mnemonic = Mnemonic.fromPhrase(
        "test test test test test test test test test test test junk"
    );
    const knownWallet = HDNodeWallet.fromMnemonic(mnemonic);
    const expectedAddress = knownWallet.address;

    // Мокаем createRandom, возвращая HDNodeWallet
    const spy = jest
        .spyOn(Wallet, "createRandom")
        .mockReturnValue(knownWallet as any);

    const result = await service.addressCreate(service.network);

    expect(result.address).toBe(expectedAddress);
    expect(result.privateKey).toBe(knownWallet.privateKey);

    // Проверяем, что safeLog вызван корректно
    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        "Created new wallet address",
        expect.objectContaining({
          ticker,
          address: knownWallet.address,
          privateKey: knownWallet.privateKey,
        })
    );

    spy.mockRestore();
  });
});

describe('address validation', () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
    process.env.NODE_ENV = "development"; // разрешаем логирование
  });

  it('validate correct addresses', async () => {
    const { address, privateKey, publicKey } = await service.addressCreate(service.network);
    // очищаем вызовы логгера от addressCreate
    jest.clearAllMocks();
    const result = await service.addressValidate(service.network, address, privateKey, publicKey);
    expect(result).toBe(true);

    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        "Address validation successful",
        expect.objectContaining({
          ticker: service.network,
          address: expect.any(String),
        }),
    );
  });

  it('return error messages on corresponding errors', async () => {
    const res = await service.addressValidate(service.network, "0x12345", "0xabc", "0xdef");
    expect(typeof res).toBe("string");
    expect(res).toContain("Неверный формат адреса");

    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "error",
        "Address validation failed",
        expect.objectContaining({
          ticker: service.network,
          address: "0x12345",
          reason: expect.stringContaining("Неверный формат адреса"),
        }),
    );
  });
});

describe('transaction build', () => {
  let adapter: HBARNodeAdapter;
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
    adapter = new HBARNodeAdapter(
        'testnet',
        'QuickNode',
        "https://rpc.example.com",
        "https://mirror.example.com",
        10
    );
  });

  it("should normalize single from/to into arrays", async () => {
    const params = {
      from: { address: "0.0.1", value: "100" },
      to: { address: "0.0.2", value: "100" },
      unsignedTx: ""
    };

    const result = await service.txBuild(service.network, params);

    expect(result).toEqual(expect.objectContaining({
      from: [{ address: "0.0.1", value: "100" }],
      to: [{ address: "0.0.2", value: "100" }],
      spent: {},
      utxo: {},
      unsignedTx: ""
    }));

    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        "Строим транзакцию",
        expect.objectContaining({ ticker: service.network })
    );

    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        "Транзакция построена"
    );
  });

  it("should keep arrays if provided", async () => {
    const params = {
      from: [
        { address: "0.0.1", value: "50" },
        { address: "0.0.3", value: "150" }
      ],
      to: [
        { address: "0.0.2", value: "200" }
      ],
      unsignedTx: ""
    };

    const result = await service.txBuild(service.network, params);

    expect((result.from as FromParams[]).length).toBe(2);
    expect((result.to as ToParams[]).length).toBe(1);
  });

  it("should preserve provided fee", async () => {
    const params = {
      from: { address: "0.0.1", value: "100" },
      to: { address: "0.0.2", value: "100" },
      fee: {
        networkFee: 5,
        properties: { speed: "fast" }
      },
      unsignedTx: ""
    };

    const result = await service.txBuild(service.network, params);

    expect(result.fee).toEqual({
      networkFee: 5,
      properties: { speed: "fast" }
    });
  });

  it("should use provided spent and utxo fields", async () => {
    const params = {
      from: { address: "0.0.1", value: "10" },
      to: { address: "0.0.2", value: "10" },
      spent: { "0.0.1": ["hash|0"] },
      utxo: { "0.0.1": ["hash|0"] },
      unsignedTx: ""
    };

    const result = await service.txBuild(service.network, params);

    expect(result.spent).toEqual({ "0.0.1": ["hash|0"] });
    expect(result.utxo).toEqual({ "0.0.1": ["hash|0"] });
  });
});

describe('transaction sign', () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
    jest.clearAllMocks();

    // Моки SDK
    (TransferTransaction as any).mockImplementation(() => ({
      addHbarTransfer: jest.fn(),
      freeze: jest.fn(),
      sign: jest.fn().mockResolvedValue({
        toBytes: () => Buffer.from("signed_tx_mock"),
        transactionId: { toString: () => "txHashMock" },
      }),
    }));
  });

  const params = {
    from: [{ address: "0.0.111", value: "1000" }],
    to: [{ address: "0.0.222", value: "1000" }],
    unsignedTx: "mock_unsigned_tx"
  };

  const privateKeys = {
    "0.0.111": "302e0201010420abcdef",
  };

  it("successfully sign the transaction", async () => {
    const result = await service.txSign(service.network, privateKeys, params);

    expect(result).toEqual({
      signedData: expect.any(String),
      txHash: "txHashMock",
    });
  });

  it("Error: missing from[]", async () => {
    await expect(
        service.txSign(service.network, privateKeys, { ...params, from: [] })
    ).rejects.toThrow("Отсутствует список отправителей");
  });

  it("Error: missing to[]", async () => {
    await expect(
        service.txSign(service.network, privateKeys, { ...params, to: [] })
    ).rejects.toThrow("Отсутствует список получателей");
  });
});
