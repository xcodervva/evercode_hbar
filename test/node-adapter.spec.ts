import axios from "axios";
import { HBARNodeAdapter } from '../src/node-adapter';
import { HBARCoinService } from '../src/coin.service';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("HBARNodeAdapter.txByHash", () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
  });

  it("formats transaction from API response", async () => {
    mockedAxios.get.mockResolvedValue({
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

    const adapter = new HBARNodeAdapter("testnet", "QuickNode", "https://api.hedera.com", 1);
    const tx = await adapter.txByHash(service.network, "0.0.1001@1731022000.000000001");

    expect(tx.status).toBe("finished");
    expect(tx.from[0].address).toBe("0.0.1001");
    expect(tx.to[0].address).toBe("0.0.2002");
  });
});

describe("HBARNodeAdapter.getHeight", () => {
  const adapter = new HBARNodeAdapter("testnet", "QuickNode", "https://testnet.mirrornode.hedera.com", 10);

  it("returns height when API returns data", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        blocks: [{ number: 12345 }],
      },
    });

    const res = await adapter.getHeight();
    expect(res).toEqual(12345);
  });

  it("throws error when response invalid", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: {} });

    await expect(adapter.getHeight()).rejects.toThrow("Некорректный ответ");
  });

  it("logs error and throws on failure", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("Network error"));

    await expect(adapter.getHeight()).rejects.toThrow("Ошибка при получении высоты сети");
  });
});