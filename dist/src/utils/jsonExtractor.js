export function extractJson(text) {
    if (!text)
        throw new Error("Empty LLM response");
    // 1️⃣ Try to extract JSON inside ```json ... ```
    const fencedMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }
    // 2️⃣ Try to extract ANY {...} block (fallback)
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
        return objectMatch[0].trim();
    }
    // 3️⃣ Give up — response is unusable
    throw new Error("No JSON object found in LLM response");
}
