/**
 * Tavily Search API client — real web search for the Research Agent.
 * https://docs.tavily.com/documentation/api-reference/endpoint/search
 *
 * Token Management (Complete Architecture #34): "Extract only relevant
 * facts, send compact data to Gemini" is more efficient than sending full
 * pages. Tavily already returns short, relevant extracts rather than raw
 * HTML, and we trim further here — this call costs Tavily API usage, not
 * Gemini tokens, and what we hand back to Gemini afterward is a small
 * compact summary, not the underlying pages.
 */

export class TavilyConfigurationError extends Error {}
export class TavilySearchError extends Error {}

export type TavilyResult = { title: string; url: string; content: string };
export type TavilySearchResponse = { answer: string | null; results: TavilyResult[] };

const MAX_RESULTS = 5;
const MAX_CONTENT_CHARS = 400; // keep each snippet short — this is what gets sent to Gemini next

export async function tavilySearch(query: string): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new TavilyConfigurationError("Tavily is not configured. Add TAVILY_API_KEY on the server.");

  let res: Response;
  try {
    res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: MAX_RESULTS,
        include_answer: true,
      }),
    });
  } catch {
    throw new TavilySearchError("Could not reach Tavily's search API.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TavilySearchError(data?.error || data?.detail || `Tavily search failed (${res.status}).`);
  }

  const results: TavilyResult[] = Array.isArray(data.results)
    ? data.results.slice(0, MAX_RESULTS).map((r: any) => ({
        title: String(r.title || "").slice(0, 140),
        url: String(r.url || ""),
        content: String(r.content || "").slice(0, MAX_CONTENT_CHARS),
      }))
    : [];

  return { answer: typeof data.answer === "string" ? data.answer.slice(0, 600) : null, results };
}
