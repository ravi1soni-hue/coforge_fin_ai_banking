/**
 * messageParser.ts
 *
 * ALL routing signals extracted from user messages in pure code — zero LLM.
 * This is intentional: routing must NEVER be non-deterministic.
 */

import type { FinancialGoalContext } from "./types.js";

// ─── Affirmative / consent detection ─────────────────────────────────────────

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
  /\bsounds great\b/i,
  /\bdo it\b/i,
  /^please\b/i,
  /^yeah\b/i,
  /\blet's do it\b/i,
  /\bthat would be (great|helpful|good|perfect)\b/i,
  /\bwhy not\b/i,
  /^absolutely\b/i,
];

/**
 * Returns true if the message is a short affirmative/consent (< 100 chars)
 * and matches at least one consent pattern.
 * Used by the pipeline to detect "yes please do that" without any LLM call.
 *
 * Returns false if the message contains a monetary amount or an interrogative
 * phrase — those indicate a new question, not consent to the previous offer.
 */
export function isAffirmative(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 100) return false;

  // If message contains a monetary amount, it's a new query — not consent
  if (/[\d,]+(?:\.\d{1,2})?\s*(gbp|pound|pounds|eur|euro|euros|usd|dollar|dollars)/i.test(trimmed)) return false;
  if (/[£$€]\s*[\d,]+/.test(trimmed)) return false;

  // If message contains a new question / "what about" / "how about", it's a new query
  if (/\bwhat (about|if)\b|\bhow (about|much)\b|\band (what|how)\b|\bwhat.{0,15}(trip|cost|afford)\b/i.test(trimmed)) return false;

  return CONSENT_PATTERNS.some((p) => p.test(trimmed));
}

// ─── Explicit product / plan request detection ───────────────────────────────

const PRODUCT_REQUEST_PATTERNS = [
  /\b(option|options)\b/i,
  /\b(plan|plans)\b/i,
  /\bemi\b/i,
  /\binstalment|installment\b/i,
  /\bhow.{0,20}(manage|spread|split)\b/i,
  /\balternative\b/i,
  /\bspread.{0,20}cost\b/i,
  /\bpayment.{0,20}plan\b/i,
  /\bwhat.{0,20}(can i do|are my options)\b/i,
];

/**
 * Returns true if the user is explicitly asking for product/plan options
 * even when the affordability verdict would be COMFORTABLE.
 * This is one of the trigger conditions for shouldSuggestProduct.
 */
export function isExplicitProductRequest(message: string): boolean {
  return PRODUCT_REQUEST_PATTERNS.some((p) => p.test(message));
}

// ─── Amount extraction ────────────────────────────────────────────────────────

/**
 * Extracts a monetary amount from a message (fast regex path, no LLM).
 *
 * Examples:
 *   "around 2200 euros"  → { amount: 2200, currency: "EUR" }
 *   "about £1,500"       → { amount: 1500, currency: "GBP" }
 *   "3000 dollars"       → { amount: 3000, currency: "USD" }
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
      const currency = /gbp|pound/.test(cw) ? "GBP" : /eur/.test(cw) ? "EUR" : "USD";
      return { amount: raw, currency };
    }
  }

  // bare number between 100 and 1,000,000 (likely a cost figure)
  const numMatch = /\b([\d,]+(?:\.\d{1,2})?)\b/.exec(message);
  if (numMatch) {
    const raw = parseFloat(numMatch[1].replace(/,/g, ""));
    if (raw >= 100 && raw <= 1_000_000) {
      const currency = /euro|eur/i.test(lower) ? "EUR" : /dollar|usd/i.test(lower) ? "USD" : "GBP";
      return { amount: raw, currency };
    }
  }

  return undefined;
}

// ─── Time horizon extraction ──────────────────────────────────────────────────

/**
 * Extracts a time horizon from a message (best-effort, no LLM).
 * Examples: "3 months", "next year", "by 2027", "in 2 years"
 */
export function extractTimeHorizon(message: string): string | undefined {
  const patterns = [
    /in\s+(\d+\s+(?:month|year)s?)/i,
    /over\s+(\d+\s+(?:month|year)s?)/i,
    /within\s+(\d+\s+(?:month|year)s?)/i,
    /by\s+(20\d{2})/i,
    /(next\s+(?:month|year))/i,
    /(\d+[-\s]year)/i,
    /(\d+[-\s]month)/i,
  ];
  for (const p of patterns) {
    const m = p.exec(message);
    if (m) return m[1].trim();
  }
  return undefined;
}

// ─── Destination extraction ───────────────────────────────────────────────────

/**
 * Extracts a destination / item name from a message (best-effort, no LLM).
 * Matches "to Paris", "to New York", "to Japan" style phrases.
 */
export function extractDestination(message: string): string | undefined {
  const m = /\b(?:to|about)\s+([a-zA-Z][a-zA-Z]+(?:\s+[a-zA-Z][a-zA-Z]+)?)\b/i.exec(message);
  if (!m) return undefined;
  return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
}

// ─── Goal type hint from domain keywords ─────────────────────────────────────

/**
 * Provides a best-effort goal type from message keywords.
 * Used as a fallback when the LLM classifies domain but no goal type is stored.
 */
export function inferGoalTypeFromMessage(
  message: string,
): FinancialGoalContext["goalType"] {
  const lower = message.toLowerCase();
  if (/\b(trip|travel|holiday|vacation|flight|hotel|paris|tokyo|dubai|rome|japan|france|italy|spain|germany|portugal|greece|usa|america|london|bangkok|bali|maldives|singapore|australia|canada|india|morocco|turkey|egypt)\b/.test(lower)) return "TRIP";
  if (/\b(house|home|mortgage|rent|property|deposit|flat|apartment)\b/.test(lower)) return "HOUSING";
  if (/\b(loan|borrow|lending|credit|finance)\b/.test(lower)) return "LOAN";
  if (/\b(invest|isa|sip|stock|fund|portfolio|pension)\b/.test(lower)) return "INVESTMENT";
  if (/\b(save|saving|savings|goal|target|pot)\b/.test(lower)) return "SAVINGS";
  return "PURCHASE"; // safe default for phones, cars, laptops, etc.
}
