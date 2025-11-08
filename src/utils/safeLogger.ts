import { logInfo, logError } from "../services/logService";

type LogLevel = "info" | "error";
interface LogMeta {
    [key: string]: any;
}

/**
 * Безопасное логирование, не выполняется при NODE_ENV='test'
 * и не роняет приложение при ошибке логирования.
 */
export async function safeLog(
    level: LogLevel,
    message: string,
    meta?: LogMeta
): Promise<void> {
    if (process.env.NODE_ENV === "test") return;

    try {
        if (level === "info") {
            await logInfo(message, meta);
        } else if (level === "error") {
            await logError(message, meta);
        } else {
            console.warn(`Unknown log level: ${level}`);
        }
    } catch (err: any) {
        console.warn("⚠️ Logging failed:", err.message);
    }
}
