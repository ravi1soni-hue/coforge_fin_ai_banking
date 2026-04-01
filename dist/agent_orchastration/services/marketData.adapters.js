import axios from "axios";
import { ENV } from "../../config/env.js";
const normalizeConfidence = (score) => {
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
const conf = (score, flags) => {
    const clamped = Math.max(0, Math.min(1, score));
    return {
        label: normalizeConfidence(clamped),
        score: Number(clamped.toFixed(2)),
        flags,
    };
};
const inferCurrencyFromSymbol = (symbol) => {
    const lower = symbol.toLowerCase();
    if (lower.endsWith(".uk") || lower.endsWith(".l")) {
        return "GBP";
    }
    if (lower.endsWith(".us")) {
        return "USD";
    }
    if (lower.endsWith(".de")) {
        return "EUR";
    }
    if (lower.endsWith(".jp")) {
        return "JPY";
    }
    return undefined;
};
const parseStooqCsv = (csv) => {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) {
        return undefined;
    }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const values = lines[1].split(",").map((v) => v.trim());
    if (header.length !== values.length) {
        return undefined;
    }
    return header.reduce((acc, key, idx) => {
        acc[key] = values[idx] ?? "";
        return acc;
    }, {});
};
export class FundPriceAdapter {
    baseUrl = ENV.MARKET_DATA_STOOQ_BASE_URL;
    timeoutMs = ENV.MARKET_DATA_TIMEOUT_MS;
    async getLatest(symbol) {
        if (!symbol) {
            return {
                symbol,
                source: "stooq",
                confidence: conf(0, ["fund_symbol_missing"]),
            };
        }
        try {
            const url = `${this.baseUrl}/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
            const response = await axios.get(url, {
                timeout: this.timeoutMs,
                responseType: "text",
            });
            const parsed = parseStooqCsv(response.data);
            if (!parsed) {
                return {
                    symbol,
                    source: "stooq",
                    confidence: conf(0.15, ["fund_csv_parse_failed"]),
                };
            }
            const closeRaw = parsed.close;
            const dateRaw = parsed.date;
            const closeValue = Number(closeRaw);
            if (!Number.isFinite(closeValue) || closeRaw === "N/D") {
                return {
                    symbol,
                    source: "stooq",
                    confidence: conf(0.2, ["fund_quote_not_available"]),
                };
            }
            return {
                symbol,
                value: closeValue,
                asOf: dateRaw,
                currency: inferCurrencyFromSymbol(symbol),
                source: "stooq",
                confidence: conf(0.7, ["fund_quote_live_reference"]),
            };
        }
        catch {
            return {
                symbol,
                source: "stooq",
                confidence: conf(0.1, ["fund_source_unreachable"]),
            };
        }
    }
}
export class BenchmarkAdapter {
    baseUrl = ENV.MARKET_DATA_STOOQ_BASE_URL;
    timeoutMs = ENV.MARKET_DATA_TIMEOUT_MS;
    async getLatest(symbol) {
        if (!symbol) {
            return {
                symbol,
                source: "stooq",
                confidence: conf(0, ["benchmark_symbol_missing"]),
            };
        }
        try {
            const url = `${this.baseUrl}/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
            const response = await axios.get(url, {
                timeout: this.timeoutMs,
                responseType: "text",
            });
            const parsed = parseStooqCsv(response.data);
            if (!parsed) {
                return {
                    symbol,
                    source: "stooq",
                    confidence: conf(0.15, ["benchmark_csv_parse_failed"]),
                };
            }
            const closeRaw = parsed.close;
            const dateRaw = parsed.date;
            const closeValue = Number(closeRaw);
            if (!Number.isFinite(closeValue) || closeRaw === "N/D") {
                return {
                    symbol,
                    source: "stooq",
                    confidence: conf(0.2, ["benchmark_quote_not_available"]),
                };
            }
            return {
                symbol,
                value: closeValue,
                asOf: dateRaw,
                currency: inferCurrencyFromSymbol(symbol),
                source: "stooq",
                confidence: conf(0.65, ["benchmark_quote_live_reference"]),
            };
        }
        catch {
            return {
                symbol,
                source: "stooq",
                confidence: conf(0.1, ["benchmark_source_unreachable"]),
            };
        }
    }
}
export class FxAdapter {
    baseUrl = ENV.MARKET_DATA_FX_BASE_URL;
    timeoutMs = ENV.MARKET_DATA_TIMEOUT_MS;
    async getRate(from, to) {
        const fromCode = from.toUpperCase();
        const toCode = to.toUpperCase();
        if (!fromCode || !toCode) {
            return {
                pair: `${fromCode}/${toCode}`,
                source: "frankfurter",
                confidence: conf(0, ["fx_currency_missing"]),
            };
        }
        if (fromCode === toCode) {
            return {
                pair: `${fromCode}/${toCode}`,
                rate: 1,
                asOf: new Date().toISOString().slice(0, 10),
                source: "internal",
                confidence: conf(1, ["fx_same_currency_identity"]),
            };
        }
        try {
            const url = `${this.baseUrl}/latest?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}`;
            const response = await axios.get(url, {
                timeout: this.timeoutMs,
            });
            const rateValue = response.data?.rates?.[toCode];
            if (!Number.isFinite(rateValue)) {
                return {
                    pair: `${fromCode}/${toCode}`,
                    source: "frankfurter",
                    confidence: conf(0.2, ["fx_rate_not_available"]),
                };
            }
            return {
                pair: `${fromCode}/${toCode}`,
                rate: rateValue,
                asOf: response.data?.date,
                source: "frankfurter",
                confidence: conf(0.75, ["fx_live_reference"]),
            };
        }
        catch {
            return {
                pair: `${fromCode}/${toCode}`,
                source: "frankfurter",
                confidence: conf(0.1, ["fx_source_unreachable"]),
            };
        }
    }
}
