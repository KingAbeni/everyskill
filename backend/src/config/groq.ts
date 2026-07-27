import { z } from "zod";
import { env } from "./env";
import { AppError } from "../utils/AppError";

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

const aiRecommendationSchema = z.object({
  categoryId: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

export type CategoryOption = { id: string; name: string };
export type AiCategoryRecommendation = z.infer<typeof aiRecommendationSchema>;

export async function recommendCategoryWithGroq(
  categories: CategoryOption[],
  title: string,
  description: string,
): Promise<AiCategoryRecommendation> {
  if (!env.groq.apiKey) {
    throw new AppError(500, "AI category recommendation is not configured (missing GROQ_API_KEY)");
  }

  const systemPrompt =
    'You classify a service listing into the single best-matching category from a fixed list. ' +
    'Respond with strict JSON only, no markdown, matching exactly: ' +
    '{"categoryId": string, "confidence": "high"|"medium"|"low", "reasoning": string}. ' +
    "The categoryId MUST be exactly one of the ids provided in the category list. " +
    'If nothing fits well, choose the closest one and set confidence to "low".';

  const userPrompt = JSON.stringify({
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    listing: { title, description },
  });

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
    throw new AppError(502, "Category recommendation service is unavailable");
  }

  if (!response.ok) {
    throw new AppError(502, "Category recommendation service is unavailable");
  }

  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AppError(502, "Category recommendation service returned an unexpected response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new AppError(502, "Category recommendation service returned invalid JSON");
  }

  const parsed = aiRecommendationSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(502, "Category recommendation service returned an unexpected shape");
  }

  if (!categories.some((c) => c.id === parsed.data.categoryId)) {
    throw new AppError(502, "Category recommendation service returned an unknown category id");
  }

  return parsed.data;
}
