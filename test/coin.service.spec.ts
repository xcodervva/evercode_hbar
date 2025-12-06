import * as hbarSDK from "@hashgraph/sdk";
const {
  AccountBalanceQuery,
  AccountCreateTransaction,
  Client,
  PublicKey,
  PrivateKey,
  TransferTransaction } = hbarSDK;
import { HBARCoinService } from '../src/coin.service';
import { HBARNodeAdapter } from '../src/node-adapter';
import * as safeLogger from "../src/utils/safeLogger";
import { FromParams, ToParams } from "../src/common";
import { generateEd25519KeyPair } from "../src/utils/ed25519";

jest.mock("../src/utils/ed25519", () => ({
  generateEd25519KeyPair: jest.fn(),
}));398

// Мокаем safeLog, чтобы не происходило реальное логирование
jest.mock("../src/utils/safeLogger", () => ({
  safeLog: jest.fn(),
}));
jest.mock("@hashgraph/sdk");
jest.mock("dotenv", () => ({
  config: jest.fn(() => ({ parsed: {} })),
}));

describe('address creation', () => {
  let service: HBARCoinService;

  beforeEach(() => {
    jest.resetAllMocks();  // важнее чем clearAllMocks()

    service = new HBARCoinService();
    process.env.FAST_TEST_FROM_ID = "0.0.1234";
    process.env.FAST_TEST_FROM_PRIVATE_KEY = "302e020100300506032b6570042204201234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    // Базовый Client.forMainnet
    jest.spyOn(Client, "forMainnet").mockReturnValue({
      setOperator: jest.fn().mockReturnThis(),
    } as any);

    // Баланс по умолчанию = 1 HBAR
    (AccountBalanceQuery as any).mockImplementation(() => ({
      setAccountId: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        hbars: { toTinybars: () => 100000000 },
      }),
    }));

    // Базовый AccountCreateTransaction
    (AccountCreateTransaction as any).mockImplementation(() => ({
      setKey: jest.fn().mockReturnThis(),
      setInitialBalance: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        getReceipt: () => Promise.resolve({ accountId: "0.0.1000" }),
      }),
    }));

    // PrivateKey.fromBytesED25519
    (PrivateKey.fromBytesED25519 as jest.Mock).mockImplementation((raw) => ({
      toString: () => Buffer.from(raw).toString("hex"),
    }));

    // PublicKey.fromBytesED25519
    (PublicKey.fromBytesED25519 as jest.Mock).mockImplementation((raw) => ({
      toString: () => Buffer.from(raw).toString("hex"),
      toStringRaw: () => Buffer.from(raw).toString("hex"),
    }));
  });

  it("creates unpredictable address", async () => {
    const ticker = service.network;

    // Два разных результата keypair
    (generateEd25519KeyPair as jest.Mock)
        .mockReturnValueOnce({
          privateKeyRaw: Buffer.from("11".repeat(32), "hex"),
          publicKeyRaw: Buffer.from("22".repeat(32), "hex"),
        })
        .mockReturnValueOnce({
          privateKeyRaw: Buffer.from("33".repeat(32), "hex"),
          publicKeyRaw: Buffer.from("44".repeat(32), "hex"),
        });

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

    (generateEd25519KeyPair as jest.Mock).mockReturnValue({
      privateKeyRaw: Buffer.from("aa".repeat(32), "hex"),
      publicKeyRaw: Buffer.from("bb".repeat(32), "hex"),
    });

    (AccountCreateTransaction as any).mockImplementation(() => ({
      setKey: jest.fn().mockReturnThis(),
      setInitialBalance: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        getReceipt: () => Promise.resolve({ accountId: "0.0.9999999" }),
      }),
    }));

    const res = await service.addressCreate(ticker);

    expect(res.address).toBe("0.0.9999999");
    expect(res.privateKey).toBe("aa".repeat(32));
    expect(res.publicKey).toBe("bb".repeat(32));

    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        "Created Hedera Testnet account",
        expect.objectContaining({
          accountId: "0.0.9999999",
          publicKey: "bb".repeat(32),
        })
    );
  });

  it("does not execute when operator has no HBAR", async () => {
    const ticker = service.network;

    (AccountBalanceQuery as any).mockImplementationOnce(() => ({
      setAccountId: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        hbars: { toTinybars: () => 0 },
      }),
    }));

    const res = await service.addressCreate(ticker);

    expect(res).toBeUndefined();
    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "warn",
        "Not enough HBAR for execute this transaction",
        expect.objectContaining({ ticker })
    );
  });
});

describe('address validation', () => {
  let service: HBARCoinService;

  beforeAll(() => {
    process.env.NODE_ENV = "development"; // разрешаем логирование

    // Client
    jest.spyOn(Client, "forMainnet").mockReturnValue({
      setOperator: jest.fn().mockReturnThis(),
    } as any);

    // Баланс оператора — достаточно HBAR
    (AccountBalanceQuery as any).mockImplementation(() => ({
      setAccountId: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        hbars: { toTinybars: () => 100000000 }, // 1 HBAR
      }),
    }));

    // Транзакция создания аккаунта — вернёт фиксированный accountId
    (AccountCreateTransaction as any).mockImplementation(() => ({
      setKey: jest.fn().mockReturnThis(),
      setInitialBalance: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        getReceipt: () => Promise.resolve({ accountId: "0.0.424242" }),
      }),
    }));

    // 1) Мокаем генератор нашей утилиты (raw bytes)
    (generateEd25519KeyPair as jest.Mock).mockReturnValue({
      // согласованные raw: private -> aa.., public -> bb..
      privateKeyRaw: Buffer.from("aa".repeat(32), "hex"),
      publicKeyRaw: Buffer.from("bb".repeat(32), "hex"),
    });

    // 2) Мокаем импорт ключей из raw (используется в addressCreate)
    (PrivateKey.fromBytesED25519 as jest.Mock).mockImplementation((raw: Buffer) => ({
      toString: () => "priv",
      toStringRaw: () => "priv",
      publicKey: {
        toString: () => "priv_pub",
        toStringRaw: () => "priv_pub",
      }
    }));

    (PublicKey.fromBytesED25519 as jest.Mock).mockImplementation((raw: Buffer) => ({
      toString: () => "priv_pub",
      toStringRaw: () => "priv_pub",
    }));

    // addressValidate → использует fromString
    (PrivateKey.fromStringED25519 as jest.Mock).mockImplementation((pk: string) => ({
      toStringRaw: () => pk, // "priv"
      publicKey: {
        toString: () => pk + "_pub",  // → "priv_pub"
        toStringRaw: () => pk + "_pub",
      }
    }));

    (PublicKey.fromString as jest.Mock).mockImplementation((pub: string) => ({
      toString: () => pub,
      toStringRaw: () => pub,
    }));

    // Создаём сервис только после всех моков
    service = new HBARCoinService();
  });

  afterEach(() => {
    // не убираем beforeAll-моки; чистим счётчики вызовов
    jest.clearAllMocks();
  });

  it('validate correct Hedera address and keys', async () => {
    // 1) Создаём адрес (внутри будет вызван generateEd25519KeyPair и tx execute)
    const { address, privateKey, publicKey } = await service.addressCreate(service.network);

    // IMPORTANT: НЕ чистим моки здесь — мы хотим, чтобы fromString* всё ещё были замоканы
    // jest.clearAllMocks();   // <--- НЕ ВЫЗЫВАЙ ЭТО ЗДЕСЬ

    // 2) Сейчас privateKey и publicKey — строки, которые вернули моки fromBytes...:
    //    ожидаем, что они равны hex-строкам из mock-реализации выше.
    //    Вызов addressValidate должен использовать fromString* (мы их замокали в beforeAll).
    const result = await service.addressValidate(
        service.network,
        address,
        privateKey,
        publicKey
    );

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
});

describe("transaction build", () => {
  let adapter: HBARNodeAdapter;
  let service: HBARCoinService;

  jest.mock("@hashgraph/sdk", () => {
    const original = jest.requireActual("@hashgraph/sdk");
    return {
      ...original,
      TransferTransaction: jest.fn().mockImplementation(() => ({
        addHbarTransfer: jest.fn(),
        freezeWith: jest.fn().mockReturnThis(),
        toBytes: jest.fn().mockReturnValue(Buffer.from("unsigned_tx_mock")),
      })),
      Hbar: {
        fromTinybars: jest.fn().mockReturnValue("mocked-hbar"),
      },
    };
  });

  beforeEach(() => {
    (TransferTransaction as any).mockImplementation(() => ({
      addHbarTransfer: jest.fn(),
      freezeWith: jest.fn().mockReturnThis(),
      toBytes: jest.fn().mockReturnValue(Buffer.from("unsigned_tx_mock")),
    }));
  });

  beforeAll(() => {
    service = new HBARCoinService();
    adapter = new HBARNodeAdapter(
        "testnet",
        "QuickNode",
        "https://rpc.example.com",
        "https://mirror.example.com",
        10
    );

    (safeLogger.safeLog as jest.Mock).mockResolvedValue(undefined);
  });

  it("should normalize single from/to and return unsignedTx", async () => {
    const params = {
      from: { address: "0.0.1", value: "100" },
      to: { address: "0.0.2", value: "100" },
      unsignedTx: ""
    };

    const result = await service.txBuild(service.network, params);

    expect(result.from).toEqual([{ address: "0.0.1", value: "100" }]);
    expect(result.to).toEqual([{ address: "0.0.2", value: "100" }]);
    expect(typeof result.unsignedTx).toBe("string");
    expect(result.unsignedTx.length).toBeGreaterThan(0);
  });

  it("should throw if incorrect from amount", async () => {
    const params = {
      from: { address: "0.0.1", value: "0" },
      to: { address: "0.0.2", value: "100" },
      unsignedTx: ""
    };

    await expect(service.txBuild(service.network, params)).rejects.toThrow(
        /Некорректная сумма списания/
    );
  });

  it("should throw if incorrect to amount", async () => {
    const params = {
      from: { address: "0.0.1", value: "100" },
      to: { address: "0.0.2", value: "0" },
      unsignedTx: ""
    };

    await expect(service.txBuild(service.network, params)).rejects.toThrow(
        /Некорректная сумма начисления/
    );
  });

  it("should preserve fee, spent, utxo", async () => {
    const params = {
      from: { address: "0.0.1", value: "10" },
      to: { address: "0.0.2", value: "10" },
      fee: { networkFee: 5, properties: { speed: "fast" } },
      spent: { "0.0.1": ["hash|0"] },
      utxo: { "0.0.1": ["hash|0"] },
      unsignedTx: ""
    };

    const result = await service.txBuild(service.network, params);

    expect(result.fee).toEqual({
      networkFee: 5,
      properties: { speed: "fast" },
    });
    expect(result.spent).toEqual({ "0.0.1": ["hash|0"] });
    expect(result.utxo).toEqual({ "0.0.1": ["hash|0"] });
  });
});

describe("transaction sign", () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
    jest.clearAllMocks();

    (safeLogger.safeLog as jest.Mock).mockResolvedValue(undefined);

    (TransferTransaction as any).mockImplementation(() => ({
      sign: jest.fn().mockResolvedValue({
        toBytes: () => Buffer.from("signed_tx_mock"),
        transactionId: { toString: () => "txHashMock" },
      }),
    }));

    (TransferTransaction.fromBytes as any) = jest
        .fn()
        .mockReturnValue(new TransferTransaction());
  });

  const params = {
    from: [{ address: "0.0.111", value: "1000" }],
    to: [{ address: "0.0.222", value: "1000" }],
    unsignedTx: Buffer.from("unsigned_tx_mock").toString("hex"),
  };

  const privateKeys = {
    "0.0.111": "302e0201010420abcdef",
  };

  it("successfully signs prepared transaction", async () => {
    const result = await service.txSign(service.network, privateKeys, params);

    expect(result).toEqual({
      signedData: expect.any(String),
      txHash: "txHashMock",
    });

    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        expect.stringContaining("Транзакция успешно подписана"),
        expect.any(Object)
    );
  });

  it("throws if unsignedTx is missing", async () => {
    const badParams = { ...params, unsignedTx: "" };
    await expect(
        service.txSign(service.network, privateKeys, badParams)
    ).rejects.toThrow(/Нет данных для подписи/);
  });

  it("throws if private key is missing", async () => {
    await expect(
        service.txSign(service.network, {}, params)
    ).rejects.toThrow(/Нет приватного ключа/);
  });

  it("calls safeLog at least once", async () => {
    await service.txSign(service.network, privateKeys, params);
    expect(safeLogger.safeLog).toHaveBeenCalled();
  });
});
