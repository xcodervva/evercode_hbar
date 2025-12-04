export function sanitizeUrl(url: string): string {
    try {
        const parsed = new URL(url);

        // Маскируем чувствительные query-параметры
        const sensitiveParams = ["api-key", "token", "auth", "access_key"];
        for (const key of sensitiveParams) {
            if (parsed.searchParams.has(key)) {
                parsed.searchParams.set(key, "***");
            }
        }

        // Маскируем потенциально чувствительные сегменты пути
        // Например: https://example.com/<секрет>/ или /v1/<ключ>/balance
        const pathSegments = parsed.pathname
            .split("/")
            .filter(Boolean)
            .map((segment, index) => {
                // Простая эвристика: если сегмент выглядит как длинный hex/base64 — маскируем
                if (/^[a-fA-F0-9]{16,}$/.test(segment) || /[A-Za-z0-9\-_]{20,}/.test(segment)) {
                    return "***";
                }
                return segment;
            });

        parsed.pathname = "/" + pathSegments.join("/");

        return parsed.toString();

        return parsed.toString();
    } catch {
        // Если URL невалиден — не трогаем
        return url;
    }
}