/**
 * Exchange rate tool using the Frankfurter API.
 * Free — no API key required. Same API used elsewhere in this codebase.
 */

const FRANKFURTER_API = "https://api.frankfurter.app";

/**
 * Returns how many units of `to` currency equal 1 unit of `from` currency.
 * e.g. getExchangeRate("EUR", "GBP") → 0.856
 */
export async function getExchangeRate(from: string, to: string): Promise<number> {
  if (from.toUpperCase() === to.toUpperCase()) return 1;

  const url = `${FRANKFURTER_API}/latest?from=${from.toUpperCase()}&to=${to.toUpperCase()}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: { "User-Agent": "FinancialAssistant/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Frankfurter API error ${res.status} for ${from}→${to}`);
  }

  const data = await res.json();
  const rate = data?.rates?.[to.toUpperCase()];

  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No valid rate returned for ${from}→${to}`);
  }

  return rate;
}
