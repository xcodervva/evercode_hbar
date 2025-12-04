import { sanitizeUrl } from "../../src/utils/sanitizeUrl";

describe("sanitizeUrl", () => {
    it("should mask api-key in URL query", () => {
        const input = "https://api.service.io/data?api-key=12345&limit=10";
        const output = sanitizeUrl(input);
        expect(output).toBe("https://api.service.io/data?api-key=***&limit=10");
    });

    it("should not modify URL without api-key", () => {
        const input = "https://api.service.io/data?limit=10";
        const output = sanitizeUrl(input);
        expect(output).toBe(input);
    });

    it("should handle multiple query params including api-key", () => {
        const input = "https://api.service.io/data?user=test&api-key=xyz&mode=prod";
        const output = sanitizeUrl(input);
        expect(output).toBe("https://api.service.io/data?user=test&api-key=***&mode=prod");
    });

    it("should return original string if URL is invalid", () => {
        const input = "not a valid url";
        const output = sanitizeUrl(input);
        expect(output).toBe(input);
    });

    it("should mask only the api-key param, not similar names", () => {
        const input = "https://example.com/?apikey=123&api-key=456";
        const output = sanitizeUrl(input);
        expect(output).toBe("https://example.com/?apikey=123&api-key=***");
    });

    it("should mask long hexadecimal segments in path", () => {
        const input = "https://cool-delicate-moon.hedera-mainnet.quiknode.pro/516302c3c44bbee0d2/";
        const output = sanitizeUrl(input);
        expect(output).toBe("https://cool-delicate-moon.hedera-mainnet.quiknode.pro/***");
    });

    it("should mask alphanumeric tokens in path", () => {
        const input = "https://node.infura.io/v3/abc123xyz987654321token";
        const output = sanitizeUrl(input);
        expect(output).toBe("https://node.infura.io/v3/***");
    });

    it("should not mask short or safe path segments", () => {
        const input = "https://example.com/v1/healthcheck";
        const output = sanitizeUrl(input);
        expect(output).toBe(input);
    });

    it("should mask multiple sensitive path segments if present", () => {
        const input = "https://example.com/v1/abc123xyz987654321token/anotherlonghash1234567890";
        const output = sanitizeUrl(input);
        expect(output).toBe("https://example.com/v1/***/***");
    });
});