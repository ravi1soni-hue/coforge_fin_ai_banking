import { OBBaseFinancialActivity, OBInvestmentActivity, OBTransactionActivity } from "../services/bank.provider.js";

/**
 * Converts an Open-Banking-style financial activity
 * into a human-readable text suitable for vector embedding.
 *
 * This text is what gets stored in `vector_documents.content`.
 */
export function toHumanReadableActivityText(
    activity: OBBaseFinancialActivity
  ): string {
    const base = buildBaseSentence(activity);
  
    switch (activity.activityType) {
        case "transaction":
          return buildTransactionSentence(activity as OBTransactionActivity, base);
        case "investment":
          return buildInvestmentSentence(activity as OBInvestmentActivity, base);
    
        default:
          return base;
      }
  }

  function buildBaseSentence(
    activity: OBBaseFinancialActivity
  ): string {
    return `
  On ${activity.bookingDate},
  an amount of ${activity.amount.value} ${activity.amount.currency}
  was recorded.
  Description: ${activity.description}.
  `.trim();
  }

  function buildTransactionSentence(
    tx: OBTransactionActivity,
    base: string
  ): string {
    const direction =
      tx.creditDebitIndicator === "credit"
        ? "credited to"
        : "debited from";
  
    const merchantPart = tx.merchant?.name
      ? ` at merchant ${tx.merchant.name}`
      : "";
  
    const categoryPart = tx.merchant?.category
      ? ` under category ${tx.merchant.category}`
      : "";
  
    return `
  ${base}
  This transaction was ${direction} the account
  ${merchantPart}${categoryPart}.
  `.replace(/\s+/g, " ").trim();
  }

  function buildInvestmentSentence(
    inv: OBInvestmentActivity,
    base: string
  ): string {
    const instrument = inv.instrument.name;
  
    const symbolPart = inv.instrument.symbol
      ? ` (${inv.instrument.symbol})`
      : "";
  
    const assetClassPart = inv.instrument.assetClass
      ? ` classified as ${inv.instrument.assetClass}`
      : "";
  
    return `
  ${base}
  This investment activity relates to ${instrument}${symbolPart}
  ${assetClassPart}.
  `.replace(/\s+/g, " ").trim();
  }