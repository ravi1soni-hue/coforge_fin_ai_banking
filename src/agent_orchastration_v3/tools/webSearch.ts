/**
 * Web search tool using the DuckDuckGo Instant Answer API.
 * Free — no API key required.
 */

export interface WebSearchData {
  abstract: string;     // main answer text
  answer: string;       // direct answer (e.g. calculation results)
  relatedTopics: string[];  // related snippets / descriptions
}

const DDG_API = "https://api.duckduckgo.com";

export async function searchWeb(query: string): Promise<WebSearchData> {
  try {
    const url = new URL(DDG_API);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("no_html", "1");
    url.searchParams.set("skip_disambig", "1");

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "FinancialAssistant/1.0" },
    });

    if (!res.ok) throw new Error(`DDG status ${res.status}`);

    const data = await res.json();

    const relatedTopics = ((data.RelatedTopics ?? []) as Array<{ Text?: string }>)
      .slice(0, 8)
      .map((t) => t.Text ?? "")
      .filter(Boolean);

    return {
      abstract: data.AbstractText ?? data.Abstract ?? "",
      answer: data.Answer ?? "",
      relatedTopics,
    };
  } catch (err) {
    console.warn("[webSearch] DDG search failed:", err);
    return { abstract: "", answer: "", relatedTopics: [] };
  }
}
