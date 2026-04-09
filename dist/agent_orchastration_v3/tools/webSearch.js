/**
 * Web search tool using the DuckDuckGo Instant Answer API.
 * Free — no API key required.
 */
const DDG_API = "https://api.duckduckgo.com";
export async function searchWeb(query) {
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
        if (!res.ok)
            throw new Error(`DDG status ${res.status}`);
        const data = await res.json();
        const relatedTopics = (data.RelatedTopics ?? [])
            .slice(0, 8)
            .map((t) => t.Text ?? "")
            .filter(Boolean);
        return {
            abstract: data.AbstractText ?? data.Abstract ?? "",
            answer: data.Answer ?? "",
            relatedTopics,
        };
    }
    catch (err) {
        console.warn("[webSearch] DDG search failed:", err);
        return { abstract: "", answer: "", relatedTopics: [] };
    }
}
