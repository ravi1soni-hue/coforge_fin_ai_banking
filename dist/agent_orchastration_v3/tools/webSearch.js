/**
 * Web search tool using Serper.dev (Google Search API).
 * Provides real UK retail prices via Google Shopping + Organic results.
 */
const SERPER_API = "https://google.serper.dev/search";
export async function searchWeb(query) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.warn("[webSearch] SERPER_API_KEY not set — returning empty results");
        return { abstract: "", answer: "", relatedTopics: [] };
    }
    try {
        const res = await fetch(SERPER_API, {
            method: "POST",
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ q: query, gl: "gb", hl: "en", num: 8 }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok)
            throw new Error(`Serper status ${res.status}`);
        const data = await res.json();
        // Build abstract from knowledge graph + answer box
        const kgDesc = data.knowledgeGraph?.description ?? "";
        const kgAttrs = data.knowledgeGraph?.attributes
            ? Object.entries(data.knowledgeGraph.attributes).map(([k, v]) => `${k}: ${v}`).join("; ")
            : "";
        const answerBox = data.answerBox?.answer ?? data.answerBox?.snippet ?? "";
        const abstract = [kgDesc, kgAttrs, answerBox].filter(Boolean).join(" ");
        // Shopping results are the most reliable for prices
        const shoppingSnippets = (data.shopping ?? [])
            .slice(0, 5)
            .map((s) => [s.title, s.price, s.source].filter(Boolean).join(" — "));
        // Organic snippets as fallback
        const organicSnippets = (data.organic ?? [])
            .slice(0, 5)
            .map((r) => r.snippet ?? "")
            .filter(Boolean);
        const relatedTopics = [...shoppingSnippets, ...organicSnippets].slice(0, 8);
        console.log(`[webSearch] Serper results: ${shoppingSnippets.length} shopping, ${organicSnippets.length} organic`);
        return { abstract, answer: answerBox, relatedTopics };
    }
    catch (err) {
        console.warn("[webSearch] Serper search failed:", err);
        return { abstract: "", answer: "", relatedTopics: [] };
    }
}
