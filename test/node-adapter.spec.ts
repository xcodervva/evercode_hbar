import axios from "axios";
import { HBARNodeAdapter } from '../src/node-adapter';
import { HBARCoinService } from '../src/coin.service';
import { safeLog } from "../src/utils/safeLogger";

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

// describe("HBARNodeAdapter.getHeight", () => {
//   const adapter = new HBARNodeAdapter("testnet", "QuickNode", "https://testnet.mirrornode.hedera.com", 10);
//
//   it("should return height parsed from hex result", async () => {
//     (axios.post as jest.Mock).mockResolvedValue({
//       data: { result: "0x10" },
//     });
//
//     const height = await adapter.getHeight();
//     expect(height).toBe(16);
//   });
//
//   it("should throw error on RPC error", async () => {
//     (axios.post as jest.Mock).mockResolvedValue({
//       data: { error: { message: "RPC failure" } },
//     });
//
//     await expect(adapter.getHeight()).rejects.toThrow("RPC error: RPC failure");
//   });
// });

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