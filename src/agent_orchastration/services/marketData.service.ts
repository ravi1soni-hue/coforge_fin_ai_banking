import {
  BenchmarkAdapter,
  ConfidenceLabel,
  FxAdapter,
  FundPriceAdapter,
  QuoteResult,
} from "./marketData.adapters.js";

type TxType = "CREDIT" | "DEBIT";

export interface MarketDataInput {
  userCurrency: string;
  investments: Array<{
    type: string;
    currentValue: number;
    monthlyContribution?: number;
  }>;
  transactions: Array<{
    date: string;
    type: TxType;
    amount: number;
    category?: string;
  }>;
}

export interface ConfidenceBreakdown {
  label: ConfidenceLabel;
  score: number;
  flags: string[];
}

export interface InvestmentMarketReference {
  investmentType: string;
  estimatedCostBasis?: number;
  estimatedProfitOrLoss?: number;
  estimatedReturnPct?: number;
  quoteCurrency: string;
  fund: {
    symbol?: string;
    price?: number;
    asOf?: string;
    source?: string;
  };
  benchmark: {
    symbol?: string;
    level?: number;
    asOf?: string;
    source?: string;
  };
  fx: {
    pair?: string;
    rate?: number;
    asOf?: string;
    source?: string;
  };
  confidence: ConfidenceBreakdown;
}

export interface MarketReferenceBundle {
  generatedAt: string;
  baseCurrency: string;
  performance: {
    estimatedProfitOrLoss?: number;
    estimatedReturnPct?: number;
    period: string;
    confidence: ConfidenceBreakdown;
    isComputable: boolean;
  };
  references: InvestmentMarketReference[];
}

const normalizeCurrency = (currency: string | undefined): string => {
  if (!currency) {
    return "GBP";
  }
  return currency.trim().toUpperCase() || "GBP";
};

const scoreToLabel = (score: number): ConfidenceLabel => {
  if (score >= 0.8) {
    return "high";
  }
  if (score >= 0.55) {
    return "medium";
  }
  if (score >= 0.3) {
    return "low";
  }
  return "none";
};

const summarizeConfidence = (score: number, flags: string[]): ConfidenceBreakdown => {
  const clamped = Math.max(0, Math.min(1, score));
  return {
    label: scoreToLabel(clamped),
    score: Number(clamped.toFixed(2)),
    flags,
  };
};

const normalizeInvestmentKey = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
};

const FUND_SYMBOL_MAP: Array<{ pattern: RegExp; symbol: string; currency: string }> = [
  { pattern: /stocks\s*&?\s*shares\s*isa|isa/i, symbol: "vusa.uk", currency: "GBP" },
];

const BENCHMARK_SYMBOL_MAP: Array<{ pattern: RegExp; symbol: string; currency: string }> = [
  { pattern: /stocks\s*&?\s*shares\s*isa|isa/i, symbol: "ukx.i", currency: "GBP" },
];

const resolveMappedSymbol = (
  investmentType: string,
  map: Array<{ pattern: RegExp; symbol: string; currency: string }>
): { symbol?: string; currency?: string } => {
  for (const entry of map) {
    if (entry.pattern.test(investmentType)) {
      return { symbol: entry.symbol, currency: entry.currency };
    }
  }
  return {};
};

const deriveObservedMonths = (dates: string[]): number => {
  if (!dates.length) {
    return 0;
  }
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  return months.size;
};

export class MarketDataService {
  private readonly fundAdapter = new FundPriceAdapter();
  private readonly benchmarkAdapter = new BenchmarkAdapter();
  private readonly fxAdapter = new FxAdapter();

  async buildMarketReferenceBundle(input: MarketDataInput): Promise<MarketReferenceBundle> {
    const baseCurrency = normalizeCurrency(input.userCurrency);
    const references: InvestmentMarketReference[] = [];

    let portfolioCurrentValue = 0;
    let portfolioCostBasis = 0;
    let hasCostBasis = false;
    let confidenceScoreSum = 0;
    let confidenceWeightSum = 0;
    const bundleFlags: string[] = [];

    for (const investment of input.investments) {
      const investmentType = typeof investment.type === "string" ? investment.type : "Investment";
      const normalizedType = normalizeInvestmentKey(investmentType);

      const relatedDebits = input.transactions.filter((tx) => {
        if (tx.type !== "DEBIT") {
          return false;
        }
        if (!tx.category) {
          return false;
        }

        const normalizedCategory = normalizeInvestmentKey(tx.category);
        return (
          normalizedCategory.includes(normalizedType) ||
          normalizedType.includes(normalizedCategory)
        );
      });

      const txCostBasis = relatedDebits.reduce((sum, tx) => sum + tx.amount, 0);
      const observedMonths = deriveObservedMonths(relatedDebits.map((tx) => tx.date));
      const monthlyContribution =
        typeof investment.monthlyContribution === "number" && Number.isFinite(investment.monthlyContribution)
          ? investment.monthlyContribution
          : undefined;

      const estimatedCostBasis = txCostBasis > 0
        ? txCostBasis
        : observedMonths > 0 && monthlyContribution !== undefined
        ? monthlyContribution * observedMonths
        : undefined;

      const estimatedProfitOrLoss =
        estimatedCostBasis !== undefined ? investment.currentValue - estimatedCostBasis : undefined;
      const estimatedReturnPct =
        estimatedCostBasis !== undefined && estimatedCostBasis > 0 && estimatedProfitOrLoss !== undefined
          ? (estimatedProfitOrLoss / estimatedCostBasis) * 100
          : undefined;

      const fundMap = resolveMappedSymbol(investmentType, FUND_SYMBOL_MAP);
      const benchmarkMap = resolveMappedSymbol(investmentType, BENCHMARK_SYMBOL_MAP);
      const quoteCurrency = normalizeCurrency(fundMap.currency ?? baseCurrency);

      const [fundQuote, benchmarkQuote, fxRate] = await Promise.all([
        fundMap.symbol
          ? this.fundAdapter.getLatest(fundMap.symbol)
          : Promise.resolve<QuoteResult>({
              symbol: "",
              value: undefined,
              asOf: undefined,
              currency: undefined,
              source: "stooq",
              confidence: summarizeConfidence(0, ["fund_symbol_not_mapped"]),
            }),
        benchmarkMap.symbol
          ? this.benchmarkAdapter.getLatest(benchmarkMap.symbol)
          : Promise.resolve<QuoteResult>({
              symbol: "",
              value: undefined,
              asOf: undefined,
              currency: undefined,
              source: "stooq",
              confidence: summarizeConfidence(0, ["benchmark_symbol_not_mapped"]),
            }),
        this.fxAdapter.getRate(quoteCurrency, baseCurrency),
      ]);

      const flags: string[] = [];
      let score = 0.2;

      if (estimatedCostBasis !== undefined) {
        score += txCostBasis > 0 ? 0.35 : 0.2;
        flags.push(txCostBasis > 0 ? "cost_basis_from_transactions" : "cost_basis_inferred_from_monthly_contributions");
      } else {
        flags.push("cost_basis_missing");
      }

      score += fundQuote.confidence.score * 0.2;
      score += benchmarkQuote.confidence.score * 0.1;
      score += fxRate.confidence.score * 0.1;

      flags.push(...fundQuote.confidence.flags, ...benchmarkQuote.confidence.flags, ...fxRate.confidence.flags);

      if (/premium bonds/i.test(investmentType)) {
        flags.push("non_market_instrument_reference_limited");
        score -= 0.12;
      }

      const confidence = summarizeConfidence(score, [...new Set(flags)]);

      const reference: InvestmentMarketReference = {
        investmentType,
        estimatedCostBasis,
        estimatedProfitOrLoss,
        estimatedReturnPct,
        quoteCurrency,
        fund: {
          symbol: fundMap.symbol,
          price: fundQuote.value,
          asOf: fundQuote.asOf,
          source: fundQuote.source,
        },
        benchmark: {
          symbol: benchmarkMap.symbol,
          level: benchmarkQuote.value,
          asOf: benchmarkQuote.asOf,
          source: benchmarkQuote.source,
        },
        fx: {
          pair: fxRate.pair,
          rate: fxRate.rate,
          asOf: fxRate.asOf,
          source: fxRate.source,
        },
        confidence,
      };

      references.push(reference);

      if (estimatedCostBasis !== undefined) {
        portfolioCurrentValue += investment.currentValue;
        portfolioCostBasis += estimatedCostBasis;
        hasCostBasis = true;
      }

      confidenceScoreSum += confidence.score * Math.max(investment.currentValue, 1);
      confidenceWeightSum += Math.max(investment.currentValue, 1);
      bundleFlags.push(...confidence.flags);
    }

    const estimatedProfitOrLoss = hasCostBasis
      ? portfolioCurrentValue - portfolioCostBasis
      : undefined;

    const estimatedReturnPct =
      hasCostBasis && portfolioCostBasis > 0 && estimatedProfitOrLoss !== undefined
        ? (estimatedProfitOrLoss / portfolioCostBasis) * 100
        : undefined;

    const portfolioConfidenceScore =
      confidenceWeightSum > 0 ? confidenceScoreSum / confidenceWeightSum : 0;

    const confidence = summarizeConfidence(portfolioConfidenceScore, [...new Set(bundleFlags)]);

    return {
      generatedAt: new Date().toISOString(),
      baseCurrency,
      performance: {
        estimatedProfitOrLoss,
        estimatedReturnPct,
        period: "observed_transaction_window",
        confidence,
        isComputable: estimatedProfitOrLoss !== undefined,
      },
      references,
    };
  }
}