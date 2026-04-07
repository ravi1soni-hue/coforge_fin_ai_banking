/**
 * Detects whether a user message is a short affirmative / consent.
 * This is fully code-based — NO LLM involved — so it never misroutes.
 */

const CONSENT_PATTERNS = [
  /^yes\b/i,
  /\byes please\b/i,
  /\byes,? do that\b/i,
  /^sure\b/i,
  /^ok(ay)?\b/i,
  /^go ahead\b/i,
  /^please do\b/i,
  /\bdo that\b/i,
  /\brun the numbers\b/i,
  /\bshow me\b/i,
  /\bsounds good\b/i,
  /\bdo it\b/i,
  /^please\b/i,
  /^yeah\b/i,
  /\blet's do it\b/i,
  /\bthat would be (great|helpful|good)\b/i,
];

/**
 * Returns true if the message is a short affirmative (< 100 chars) and
 * matches at least one consent pattern. Does NOT require pendingOffer to
 * be present — the pipeline checks stage separately.
 */
export function isAffirmative(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 100) return false;
  return CONSENT_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Extracts a numeric amount from a message using regex first (fast path),
 * then returns undefined if nothing found (caller can prompt the user).
 *
 * Examples:
 *   "around 2200 euros"       → { amount: 2200, currency: "EUR" }
 *   "about £1,500"            → { amount: 1500, currency: "GBP" }
 *   "3000 dollars"            → { amount: 3000, currency: "USD" }
 */
export function extractAmount(
  message: string,
): { amount: number; currency: string } | undefined {
  const lower = message.toLowerCase();

  // currency symbol + number
  const symbolMatch = /([£$€])\s*([\d,]+(?:\.\d{1,2})?)/i.exec(message);
  if (symbolMatch) {
    const sym = symbolMatch[1];
    const raw = parseFloat(symbolMatch[2].replace(/,/g, ""));
    if (raw > 0) {
      return {
        amount: raw,
        currency: sym === "£" ? "GBP" : sym === "$" ? "USD" : "EUR",
      };
    }
  }

  // number + currency word/code
  const wordMatch = /([\d,]+(?:\.\d{1,2})?)\s*(gbp|pound|pounds|eur|euro|euros|usd|dollar|dollars)/i.exec(
    message,
  );
  if (wordMatch) {
    const raw = parseFloat(wordMatch[1].replace(/,/g, ""));
    const cw = wordMatch[2].toLowerCase();
    if (raw > 0) {
      const currency = /gbp|pound/.test(cw)
        ? "GBP"
        : /eur/.test(cw)
          ? "EUR"
          : "USD";
      return { amount: raw, currency };
    }
  }

  // bare number between 100 and 1,000,000 (likely a cost figure)
  const numMatch = /\b([\d,]+(?:\.\d{1,2})?)\b/.exec(message);
  if (numMatch) {
    const raw = parseFloat(numMatch[1].replace(/,/g, ""));
    if (raw >= 100 && raw <= 1_000_000) {
      // Guess currency from context keywords
      const currency = /euro|eur/i.test(lower)
        ? "EUR"
        : /dollar|usd/i.test(lower)
          ? "USD"
          : "GBP"; // default to home currency
      return { amount: raw, currency };
    }
  }

  return undefined;
}

/**
 * Extracts destination from a message (best-effort, no LLM).
 */
export function extractDestination(message: string): string | undefined {
  const m = /\bto\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/.exec(message);
  return m?.[1];
}
