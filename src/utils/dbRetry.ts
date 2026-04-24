// DB utility: retry wrapper for cold start failures
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1200): Promise<T> {
  let lastErr;
  for (let i = 0; i <= retries; ++i) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      // Only retry on connection/cold start errors
      if (!/ECONNREFUSED|Connection terminated|timeout|server closed|suspend|idle/i.test(err?.message || "")) throw err;
      if (i < retries) await new Promise(res => setTimeout(res, delayMs));
    }
  }
  throw lastErr;
}
