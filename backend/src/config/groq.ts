import { z } from "zod";
import { env } from "./env";
import { AppError } from "../utils/AppError";

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

export type CategoryOption = { id: string; name: string };

async function callGroqJson(systemPrompt: string, userPrompt: string, unavailableMessage: string): Promise<unknown> {
  if (!env.groq.apiKey) {
    throw new AppError(500, `${unavailableMessage} (missing GROQ_API_KEY)`);
  }

  let response: Response;
  try {
    response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.groq.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.groq.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch {
    throw new AppError(502, `${unavailableMessage} — the AI service is unavailable`);
  }

  if (!response.ok) {
    throw new AppError(502, `${unavailableMessage} — the AI service is unavailable`);
  }

  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AppError(502, `${unavailableMessage} — the AI service returned an unexpected response`);
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new AppError(502, `${unavailableMessage} — the AI service returned invalid JSON`);
  }
}

const aiRecommendationSchema = z.object({
  categoryId: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

export type AiCategoryRecommendation = z.infer<typeof aiRecommendationSchema>;

export async function recommendCategoryWithGroq(
  categories: CategoryOption[],
  title: string,
  description: string,
): Promise<AiCategoryRecommendation> {
  const systemPrompt =
    "You classify a service listing into the single best-matching category from a fixed list. " +
    "Respond with strict JSON only, no markdown, matching exactly: " +
    '{"categoryId": string, "confidence": "high"|"medium"|"low", "reasoning": string}. ' +
    "The categoryId MUST be exactly one of the ids provided in the category list. " +
    'If nothing fits well, choose the closest one and set confidence to "low".';

  const userPrompt = JSON.stringify({
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    listing: { title, description },
  });

  const parsedJson = await callGroqJson(systemPrompt, userPrompt, "Category recommendation service");

  const parsed = aiRecommendationSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(502, "Category recommendation service returned an unexpected shape");
  }

  if (!categories.some((c) => c.id === parsed.data.categoryId)) {
    throw new AppError(502, "Category recommendation service returned an unknown category id");
  }

  return parsed.data;
}

const searchInterpretationSchema = z.object({
  categoryId: z.string().nullable(),
  minPrice: z.number().nullable(),
  maxPrice: z.number().nullable(),
  location: z.string().nullable(),
  availableDate: z.string().nullable(),
  urgency: z.enum(["low", "medium", "high"]),
  explanation: z.string(),
});

export type SearchInterpretation = z.infer<typeof searchInterpretationSchema>;

export async function interpretSearchQueryWithGroq(
  categories: CategoryOption[],
  query: string,
  todayIso: string,
): Promise<SearchInterpretation> {
  const systemPrompt =
    "You extract structured search filters from a natural-language home-services marketplace search query. " +
    `Today's date is ${todayIso} (ISO format, so you can resolve relative dates like "tomorrow" or "this weekend"). ` +
    "Respond with strict JSON only, no markdown, matching exactly: " +
    '{"categoryId": string|null, "minPrice": number|null, "maxPrice": number|null, "location": string|null, ' +
    '"availableDate": string|null, "urgency": "low"|"medium"|"high", "explanation": string}. ' +
    "categoryId MUST be exactly one of the ids in the provided category list, or null if no category clearly matches. " +
    "minPrice/maxPrice are numbers extracted from budget mentions (e.g. \"under $100\" -> maxPrice: 100), or null if no budget is mentioned. " +
    "location is a place/area name mentioned in the query, or null if none. " +
    'availableDate is a single resolved ISO date ("YYYY-MM-DD") if the query mentions a specific or relative time ' +
    '(e.g. "tomorrow", "this weekend", "next Monday"), or null if no time is mentioned. ' +
    'urgency is "high" for words like "emergency"/"urgent"/"asap", "low" for "whenever"/"no rush", otherwise "medium". ' +
    "explanation is a one-sentence, plain-language summary of how you interpreted the query.";

  const userPrompt = JSON.stringify({
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    query,
  });

  const parsedJson = await callGroqJson(systemPrompt, userPrompt, "AI search");

  const parsed = searchInterpretationSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(502, "AI search returned an unexpected shape");
  }

  if (parsed.data.categoryId !== null && !categories.some((c) => c.id === parsed.data.categoryId)) {
    throw new AppError(502, "AI search returned an unknown category id");
  }

  return parsed.data;
}
