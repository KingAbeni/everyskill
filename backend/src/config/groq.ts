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

/**
 * FR20 — same request/response shape as callGroqJson, but sends multimodal content (text +
 * one or more image URLs) and targets the vision-capable model (env.groq.visionModel) rather
 * than the text-only model used everywhere else in this file.
 */
async function callGroqVisionJson(
  systemPrompt: string,
  userText: string,
  imageUrls: string[],
  unavailableMessage: string,
): Promise<unknown> {
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
        model: env.groq.visionModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
            ],
          },
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

// ---------- FR19 — AI Content Assistance (text-only) ----------

const improveDescriptionSchema = z.object({
  improvedDescription: z.string(),
  reasoning: z.string(),
});

export type ImprovedDescription = z.infer<typeof improveDescriptionSchema>;

export async function improveListingDescriptionWithGroq(title: string, description: string): Promise<ImprovedDescription> {
  const systemPrompt =
    "You improve a home-services marketplace listing description to be clearer, more compelling, and more likely " +
    "to convert browsers into bookings — while staying strictly truthful to the original content. Never invent " +
    "claims, credentials, guarantees, or details not implied by the original description. Respond with strict JSON " +
    'only, no markdown, matching exactly: {"improvedDescription": string, "reasoning": string}.';

  const userPrompt = JSON.stringify({ title, description });
  const parsedJson = await callGroqJson(systemPrompt, userPrompt, "Description improvement");

  const parsed = improveDescriptionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(502, "Description improvement returned an unexpected shape");
  }
  return parsed.data;
}

const suggestKeywordsSchema = z.object({
  keywords: z.array(z.string()),
  reasoning: z.string(),
});

export type SuggestedKeywords = z.infer<typeof suggestKeywordsSchema>;

export async function suggestListingKeywordsWithGroq(
  title: string,
  description: string,
  categoryNames: string[],
): Promise<SuggestedKeywords> {
  const systemPrompt =
    "You suggest search keywords/tags for a home-services marketplace listing, to help customers find it. " +
    "Respond with strict JSON only, no markdown, matching exactly: " +
    '{"keywords": string[], "reasoning": string}. Suggest 3-8 short, relevant keywords a customer might search for.';

  const userPrompt = JSON.stringify({ title, description, categories: categoryNames });
  const parsedJson = await callGroqJson(systemPrompt, userPrompt, "Keyword suggestion");

  const parsed = suggestKeywordsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(502, "Keyword suggestion returned an unexpected shape");
  }
  return parsed.data;
}

// ---------- FR20 — AI Image Analysis (vision) ----------

const categoryFromImageSchema = z.object({
  categoryId: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

export type AiCategoryFromImage = z.infer<typeof categoryFromImageSchema>;

export async function recommendCategoryFromImageWithGroq(
  categories: CategoryOption[],
  imageUrl: string,
): Promise<AiCategoryFromImage> {
  const systemPrompt =
    "You classify a home-services marketplace listing photo into the single best-matching category from a fixed " +
    "list, based on what's visible in the image. Respond with strict JSON only, no markdown, matching exactly: " +
    '{"categoryId": string, "confidence": "high"|"medium"|"low", "reasoning": string}. ' +
    "The categoryId MUST be exactly one of the ids provided in the category list. " +
    'If nothing fits well, choose the closest one and set confidence to "low".';

  const userText = JSON.stringify({ categories: categories.map((c) => ({ id: c.id, name: c.name })) });
  const parsedJson = await callGroqVisionJson(systemPrompt, userText, [imageUrl], "Image category recommendation");

  const parsed = categoryFromImageSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(502, "Image category recommendation returned an unexpected shape");
  }
  if (!categories.some((c) => c.id === parsed.data.categoryId)) {
    throw new AppError(502, "Image category recommendation returned an unknown category id");
  }
  return parsed.data;
}

const detectedObjectsSchema = z.object({
  objects: z.array(z.string()),
  description: z.string(),
});

export type DetectedServiceObjects = z.infer<typeof detectedObjectsSchema>;

export async function detectServiceObjectsWithGroq(imageUrl: string): Promise<DetectedServiceObjects> {
  const systemPrompt =
    "You identify objects, tools, and equipment visible in a home-services photo (e.g. a listing photo or " +
    "job-documentation photo). Respond with strict JSON only, no markdown, matching exactly: " +
    '{"objects": string[], "description": string}. "objects" is a short list of concrete nouns visible ' +
    '(e.g. "pipe wrench", "vacuum cleaner", "ladder"). "description" is a one-sentence plain-language summary ' +
    "of what the image shows.";

  const parsedJson = await callGroqVisionJson(systemPrompt, "Analyze this image.", [imageUrl], "Image object detection");

  const parsed = detectedObjectsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(502, "Image object detection returned an unexpected shape");
  }
  return parsed.data;
}

const compareBeforeAfterSchema = z.object({
  verdict: z.enum(["MATCH", "MISMATCH", "INCONCLUSIVE"]),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

export type BeforeAfterComparison = z.infer<typeof compareBeforeAfterSchema>;

export async function compareBeforeAfterWithGroq(beforeImageUrl: string, afterImageUrl: string): Promise<BeforeAfterComparison> {
  const systemPrompt =
    "You compare a 'before' and an 'after' photo of a home-service job to judge whether the after photo " +
    "plausibly shows real, completed work at the same location/subject as the before photo. Respond with strict " +
    'JSON only, no markdown, matching exactly: {"verdict": "MATCH"|"MISMATCH"|"INCONCLUSIVE", ' +
    '"confidence": "high"|"medium"|"low", "reasoning": string}. ' +
    "MATCH = same location/subject with visible completed work. MISMATCH = a different location/subject, or no " +
    "visible change/work done. INCONCLUSIVE = cannot tell from the images provided.";

  const userText = "The first image is BEFORE the job. The second image is AFTER the job.";
  const parsedJson = await callGroqVisionJson(systemPrompt, userText, [beforeImageUrl, afterImageUrl], "Before/after comparison");

  const parsed = compareBeforeAfterSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(502, "Before/after comparison returned an unexpected shape");
  }
  return parsed.data;
}

const suspiciousImageSchema = z.object({
  suspicious: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

export type SuspiciousImageVerdict = z.infer<typeof suspiciousImageSchema>;

export async function detectSuspiciousImageWithGroq(imageUrl: string): Promise<SuspiciousImageVerdict> {
  const systemPrompt =
    "You screen an image uploaded to a home-services marketplace (as a listing photo, review photo, or " +
    "job-completion proof photo) for clear signs it may be fake, a stolen/stock photo, entirely unrelated to any " +
    'plausible home service, or otherwise not a genuine original photo. Respond with strict JSON only, no markdown, ' +
    'matching exactly: {"suspicious": boolean, "confidence": "high"|"medium"|"low", "reasoning": string}. ' +
    "Only set suspicious:true when there is a clear indicator (e.g. an obvious stock-photo watermark, screenshot " +
    "artifacts, or content with no plausible connection to a home service) — default to false when in doubt, " +
    "since this feeds an automated moderation queue and false positives cost real users trust.";

  const parsedJson = await callGroqVisionJson(systemPrompt, "Analyze this image.", [imageUrl], "Image moderation check");

  const parsed = suspiciousImageSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(502, "Image moderation check returned an unexpected shape");
  }
  return parsed.data;
}
