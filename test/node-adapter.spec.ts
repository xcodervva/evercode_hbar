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

  it("should return height parsed from hex result", async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { result: "0x10" },
    });

    const height = await adapter.getHeight();
    expect(height).toBe(16);
  });

  it("should throw error on RPC error", async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { error: { message: "RPC failure" } },
    });

    await expect(adapter.getHeight()).rejects.toThrow("RPC error: RPC failure");
  });
});