import { safeLog } from "../../src/utils/safeLogger";
import * as logService from "../../src/services/logService";

jest.mock("../../src/services/logService", () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

describe("safeLog", () => {
    beforeEach(() => {
        process.env.NODE_ENV = "development";
        jest.clearAllMocks();
    });

    it("calls logInfo when level=info", async () => {
        await safeLog("info", "test info", { key: "value" });
        expect(logService.logInfo).toHaveBeenCalledWith("test info", { key: "value" });
    });

    it("calls logError when level=error", async () => {
        await safeLog("error", "test error", { key: "value" });
        expect(logService.logError).toHaveBeenCalledWith("test error", { key: "value" });
    });

    it("skips logging when NODE_ENV=test", async () => {
        process.env.NODE_ENV = "test";
        await safeLog("info", "no log", {});
        expect(logService.logInfo).not.toHaveBeenCalled();
    });
});
