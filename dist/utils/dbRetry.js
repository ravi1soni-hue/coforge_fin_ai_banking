// DB utility: retry wrapper for cold start failures
export async function withDbRetry(fn, retries = 2, delayMs = 1200) {
    let lastErr;
    for (let i = 0; i <= retries; ++i) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            // Only retry on connection/cold start errors
            if (!/ECONNREFUSED|Connection terminated|timeout|server closed|suspend|idle/i.test(err?.message || ""))
                throw err;
            if (i < retries)
                await new Promise(res => setTimeout(res, delayMs));
        }
    }
    throw lastErr;
}
