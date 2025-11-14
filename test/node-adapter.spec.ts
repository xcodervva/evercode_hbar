import axios from "axios";
import { HBARNodeAdapter } from '../src/node-adapter';
import { HBARCoinService } from '../src/coin.service';
import { safeLog } from "../src/utils/safeLogger";
import {BalanceByAddressResult, GetBlockResult} from "../src/common";

jest.mock('axios', () => ({
  request: jest.fn(),
}));
jest.mock("../src/utils/safeLogger", () => ({
  safeLog: jest.fn(),
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("HBARNodeAdapter.txByHash", () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
    beforeEach(() => {
      jest.clearAllMocks();
    });
  });

  it("formats transaction from API response", async () => {
    mockedAxios.request.mockResolvedValue({
      data: {
        transactions: [
          {
            result: "SUCCESS",
            consensus_timestamp: "1731022000.000000001",
            transfers: [
              { account: "0.0.1001", amount: -50000000 },
              { account: "0.0.2002", amount: 50000000 },
            ],
          },
        ],
      },
    });

    const adapter = new HBARNodeAdapter(
        "testnet",
        "QuickNode",
        "https://rpc.example.com",
        "https://mirror.example.com",
        1);
    const tx = await adapter.txByHash(service.network, "0.0.1001@1731022000.000000001");

    expect(tx.status).toBe("finished");
    expect(tx.from[0].address).toBe("0.0.1001");
    expect(tx.to[0].address).toBe("0.0.2002");
  });
});

describe("HBARNodeAdapter.getHeight", () => {
  const adapter = new HBARNodeAdapter(
      "testnet",
      "QuickNode",
      "https://rpc.example.com",
      "https://mirror.example.com",
      10);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return height parsed from hex result", async () => {
    mockedAxios.request.mockResolvedValue({
      data: { result: "0x10" },
    });

    const height = await adapter.getHeight();
    expect(height).toBe(16);
  });

  it("should throw error on RPC error", async () => {
    mockedAxios.request.mockResolvedValue({
      data: { error: { message: "RPC failure" } },
    });

    await expect(adapter.getHeight()).rejects.toThrow("RPC error: RPC failure");
  });
});

describe("HBARNodeAdapter - request()", () => {
  const adapter = new HBARNodeAdapter(
      "testnet",
      "QuickNode",
      "https://rpc.example.com",
      "https://mirror.example.com",
      10
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should perform GET request successfully", async () => {
    mockedAxios.request.mockResolvedValue({
      status: 200,
      data: {ok: true},
    });

    const result = await adapter["request"]<{ ok: boolean }, void>(
        "GET",
        "https://mirror.example.com/api/v1/test"
    );

    expect(result).toEqual({ok: true});
    expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: "https://mirror.example.com/api/v1/test",
        })
    );
    expect(safeLog).toHaveBeenCalledWith(
        "info",
        "HTTP request successful",
        expect.objectContaining({method: "GET"})
    );
  });

  it("should perform POST request with data", async () => {
    mockedAxios.request.mockResolvedValue({
      status: 200,
      data: {result: "ok"},
    });

    const body = {foo: "bar"};
    const result = await adapter["request"]<{ result: string }, typeof body>(
        "POST",
        "https://rpc.example.com",
        body
    );

    expect(result).toEqual({result: "ok"});
    expect(axios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          data: body,
        })
    );
  });

  it("should throw error when axios.request fails", async () => {
    mockedAxios.request.mockRejectedValue({
      message: "Network Error",
      response: {status: 500},
    });

    await expect(
        adapter["request"]("GET", "https://mirror.example.com/fail")
    ).rejects.toThrow("Request failed [GET https://mirror.example.com/fail]: Network Error");

    expect(safeLog).toHaveBeenCalledWith(
        "error",
        "HTTP request failed",
        expect.objectContaining({
          url: "https://mirror.example.com/fail",
          reason: "Network Error",
          status: 500,
        })
    );
  });

  it("should handle error message from response data", async () => {
    mockedAxios.request.mockRejectedValue({
      response: {
        status: 400,
        data: {error: {message: "Bad Request"}},
      },
      message: "Request failed",
    });

    await expect(
        adapter["request"]("POST", "https://rpc.example.com", {bad: true})
    ).rejects.toThrow(
        "Request failed [POST https://rpc.example.com]: Bad Request"
    );

    expect(safeLog).toHaveBeenCalledWith(
        "error",
        "HTTP request failed",
        expect.objectContaining({
          reason: "Bad Request",
          status: 400,
        })
    );
  });
});

describe("HBARNodeAdapter.getBlock", () => {
  let adapter: HBARNodeAdapter;

  beforeEach(() => {
    adapter = new HBARNodeAdapter(
        "testnet",
        "QuickNode",
        "https://rpc.example.com",
        "https://mirror.example.com",
        10
    );
    jest.clearAllMocks();
  });

  it("should return a properly formatted Block with transactions", async () => {
    jest.spyOn(adapter, "getHeight").mockResolvedValue(1000);
    jest.spyOn(adapter as any, "request").mockResolvedValue({
      blocks: [
        {
          number: 499,
          timestamp: { from: "1699611111.000000000" },
          transactions: [
            { transaction_id: "0.0.1001-1699611111-000000001", result: "SUCCESS" },
          ],
        },
      ],
    });

    const block = await adapter.getBlock(499);

    // Проверяем структуру результата
    expect(block.height).toBe(499);
    expect(block.transactions).toHaveLength(1);
    expect(block.transactions[0].status).toBe("success");

    // Проверяем вызовы логов (без зависимости от языка или позиции)
    expect(safeLog).toHaveBeenCalledWith(
        "info",
        `Запрашивается блок №499`
    );

    expect(safeLog).toHaveBeenCalledWith(
        "info",
        `Блок №499 успешно получен`,
        expect.objectContaining({ txCount: 1 })
    );
  });

  it("should throw if requested block not yet available", async () => {
    jest.spyOn(adapter, "getHeight").mockResolvedValue(100);
    await expect(adapter.getBlock(150)).rejects.toThrow(
        "Запрошенный блок 150 пока недоступен. Текущая высота: 100"
    );

    // Логирование должно содержать ожидаемые данные
    expect(safeLog).toHaveBeenCalledWith(
        "warn",
        expect.stringContaining("пока недоступен"), // Для русского текста
        expect.objectContaining({ height: 150, currentHeight: 100 }) // Ожидаемые параметры
    );
  });

  it("should throw if block not found", async () => {
    jest.spyOn(adapter, "getHeight").mockResolvedValue(1000);
    jest.spyOn(adapter as any, "request").mockResolvedValue({ blocks: [] });

    await expect(adapter.getBlock(999)).rejects.toThrow("Блок №999 не найден");

    expect(safeLog).toHaveBeenCalledWith(
        "error",
        "Блок №999 не найден"
    );
  });
});

describe('HBARNodeAdapter balanceByAddress', () => {
  let adapter: HBARNodeAdapter;
  let service: HBARCoinService;

  beforeEach(() => {
    service = new HBARCoinService();
    adapter = new HBARNodeAdapter(
        'testnet',
        'QuickNode',
        "https://rpc.example.com",
        "https://mirror.example.com",
        10
    );
    jest.clearAllMocks();
  });

  it('should return balance for HBAR', async () => {
    const mockData = {
      balance: {
        balance: 1000,  // Баланс HBAR
        tokens: [],
      },
    };

    // Мокаем запрос
    jest.spyOn(adapter as any, 'request').mockResolvedValue(mockData);

    const result: BalanceByAddressResult = await adapter.balanceByAddress(service.network, '0.0.1234');

    expect(result).toEqual({
      balance: '1000',  // Баланс для HBAR
      totalBalance: '1000',  // Общий баланс
    });

    // Проверяем, что логирование было вызвано
    expect(safeLog).toHaveBeenCalledWith(
        'info',
        'Запрашиваем баланс для адреса 0.0.1234',
        { ticker: 'HBAR', address: '0.0.1234' }
    );
  });

  it('should return balance for token', async () => {
    const mockData = {
      balance: {
        balance: 0,
        tokens: [{ token_id: '0.0.1001', balance: 200 }],
      },
    };

    jest.spyOn(adapter as any, 'request').mockResolvedValue(mockData);

    const result: BalanceByAddressResult = await adapter.balanceByAddress('0.0.1001', '0.0.1234');

    expect(result).toEqual({
      balance: '200',
      totalBalance: '0',
    });

    expect(safeLog).toHaveBeenCalledWith(
        "info",
        "Запрашиваем баланс для адреса 0.0.1234",
        { ticker: "0.0.1001", address: "0.0.1234" }
    );
  });

  it('should return balance for HBAR and token', async () => {
    const mockData = {
      balance: {
        balance: 1000,  // Общий баланс HBAR
        tokens: [{ token_id: '0.0.1001', balance: 200 }],
      },
    };

    jest.spyOn(adapter as any, 'request').mockResolvedValue(mockData);

    const result: BalanceByAddressResult = await adapter.balanceByAddress('0.0.1001', '0.0.1234');

    expect(result).toEqual({
      balance: '200',  // Баланс для токена
      totalBalance: '1000',
    });

    // Логирование запроса
    expect(safeLog).toHaveBeenCalledWith(
        'info',
        'Запрашиваем баланс для адреса 0.0.1234',
        { ticker: '0.0.1001', address: '0.0.1234' }
    );
  });

  it('should throw if balance not found', async () => {
    const mockData = { balance: null };
    jest.spyOn(adapter as any, 'request').mockResolvedValue(mockData);

    await expect(adapter.balanceByAddress('HBAR', '0.0.1234')).rejects.toThrow(
        'Баланс для адреса 0.0.1234 не найден'
    );

    // Логируем ошибку
    expect(safeLog).toHaveBeenCalledWith(
        'error',
        'Баланс для адреса 0.0.1234 не найден',
        { address: '0.0.1234' }
    );
  });

  it('should throw if error occurs in request', async () => {
    jest.spyOn(adapter as any, 'request').mockRejectedValue(new Error('Request failed'));

    await expect(adapter.balanceByAddress('HBAR', '0.0.1234')).rejects.toThrow(
        'Request failed'
    );

    // Логируем ошибку запроса
    expect(safeLog).toHaveBeenCalledWith(
        'error',
        'Ошибка при запросе баланса для адреса 0.0.1234',
        { ticker: 'HBAR', error: 'Request failed' }
    );
  });

  it('should return total balance for multiple tokens and HBAR', async () => {
    const mockData = {
      balance: {
        balance: 1000,  // Общий баланс HBAR
        tokens: [
          { token_id: '0.0.1001', balance: 200 },  // Токен 1
          { token_id: '0.0.1002', balance: 300 },  // Токен 2
        ],
      },
    };

    jest.spyOn(adapter as any, 'request').mockResolvedValue(mockData);

    const result: BalanceByAddressResult = await adapter.balanceByAddress('0.0.1002', '0.0.1234');

    expect(result).toEqual({
      balance: '300',  // Баланс для токена 0.0.1002
      totalBalance: '1000',
    });

    expect(safeLog).toHaveBeenCalledWith(
        'info',
        'Запрашиваем баланс для адреса 0.0.1234',
        { ticker: '0.0.1002', address: '0.0.1234' }
    );
  });
});