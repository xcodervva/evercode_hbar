import * as hbarSDK from "@hashgraph/sdk";
const { AccountCreateTransaction, Client, PrivateKey, TransferTransaction } = hbarSDK;
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

    // Базовый Client.forTestnet
    (Client.forTestnet as jest.Mock).mockReturnValue({
      setOperator: jest.fn().mockReturnThis(),
    });

    // Базовый PrivateKey.generateED25519
    (PrivateKey.generateED25519 as jest.Mock).mockReturnValue({
      publicKey: { toStringRaw: () => "pub_default" },
      toStringRaw: () => "priv_default",
    });

    // Базовый AccountCreateTransaction
    (AccountCreateTransaction as any).mockImplementation(() => ({
      setKey: jest.fn().mockReturnThis(),
      setInitialBalance: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        getReceipt: () => Promise.resolve({ accountId: "0.0.1000" }),
      }),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates unpredictable address", async () => {
    const ticker = service.network;

    jest.spyOn(Client, "forTestnet").mockReturnValue({
      setOperator: jest.fn().mockReturnThis(),
    } as any);

    const priv1 = {
      publicKey: { toStringRaw: () => "pub1" },
      toStringRaw: () => "priv1",
    };
    const priv2 = {
      publicKey: { toStringRaw: () => "pub2" },
      toStringRaw: () => "priv2",
    };

    jest
        .spyOn(PrivateKey, "generateED25519")
        .mockReturnValueOnce(priv1 as any)
        .mockReturnValueOnce(priv2 as any);

    const mockTx = {
      setKey: jest.fn().mockReturnThis(),
      setInitialBalance: jest.fn().mockReturnThis(),
      execute: jest
          .fn()
          .mockResolvedValueOnce({
            getReceipt: () => Promise.resolve({ accountId: "0.0.1111111" }),
          })
          .mockResolvedValueOnce({
            getReceipt: () => Promise.resolve({ accountId: "0.0.2222222" }),
          }),
    };

    (AccountCreateTransaction as any).mockImplementation(() => mockTx);

    const r1 = await service.addressCreate(ticker);
    const r2 = await service.addressCreate(ticker);

    expect(r1.address).not.toBe(r2.address);
    expect(r1.privateKey).not.toBe(r2.privateKey);
    expect(r1.publicKey).not.toBe(r2.publicKey);

    expect(mockTx.setKey).toHaveBeenCalled();
    expect(safeLogger.safeLog).toHaveBeenCalled();
  });

  it("creates known address", async () => {
    const ticker = service.network;

    jest.spyOn(PrivateKey, "generateED25519").mockReturnValue({
      publicKey: { toStringRaw: () => "known_pub" },
      toStringRaw: () => "known_priv",
    } as any);

    (AccountCreateTransaction as unknown as jest.Mock).mockImplementation(() => ({
      setKey: jest.fn().mockReturnThis(),
      setInitialBalance: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        getReceipt: () => Promise.resolve({ accountId: "0.0.9999999" }),
      }),
    }));

    const result = await service.addressCreate(ticker);

    expect(result.address).toBe("0.0.9999999");
    expect(result.privateKey).toBe("known_priv");
    expect(result.publicKey).toBe("known_pub");

    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        "Created Hedera Testnet account",
        expect.objectContaining({
          ticker,
          accountId: "0.0.9999999",
          publicKey: "known_pub",
        })
    );
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

  it("Error: missing private key", async () => {
    await expect(
        service.txSign(service.network, {}, params)
    ).rejects.toThrow(`Отсутствует приватный ключ для отправителя ${params.from[0].address}`);
  });

  it("Error: incorrect write-off amount", async () => {
    const badParams = {
      ...params,
      from: [{ address: "0.0.111", value: "0" }],
      to: [{ address: "0.0.222", value: "1000" }]
    };

    await expect(
        service.txSign(service.network, privateKeys, badParams)
    ).rejects.toThrow("Некорректная сумма списания");
  });

  it("Error: incorrect accrual amount", async () => {
    const badParams = {
      ...params,
      to: [
        { address: "0.0.222", value: "0" } // некорректное начисление
      ],
      from: [
        { address: "0.0.111", value: "1000" } // корректный отправитель
      ]
    };

    await expect(
        service.txSign(service.network, privateKeys, badParams)
    ).rejects.toThrow("Некорректная сумма начисления");
  });

  it("checks safeLog calls", async () => {
    await service.txSign(service.network, privateKeys, params);

    expect(safeLogger.safeLog).toHaveBeenCalled();
    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        expect.any(String),
        expect.any(Object),
    );
  });
});
