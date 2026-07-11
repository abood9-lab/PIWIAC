import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { aiLimiter } from "../lib/security";

const router: IRouter = Router();

const MAX_PROMPT = 2000;

// ─── Model config ─────────────────────────────────────────────────────────────
type ModelId = "groq" | "mistral" | "deepseek";

interface ModelConfig {
  url: string;
  model: string;
  envKey: string;
  label: string;
}

const MODELS: Record<ModelId, ModelConfig> = {
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    envKey: "GROQ_API_KEY",
    label: "Groq (LLaMA 3.3 70B)",
  },
  mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-large-latest",
    envKey: "MISTRAL_API_KEY",
    label: "Mistral Large",
  },
  deepseek: {
    url: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
    label: "DeepSeek Chat",
  },
};

// ─── Shared fetch helper ───────────────────────────────────────────────────────
async function callModel(
  modelId: ModelId,
  messages: { role: string; content: string }[],
  maxTokens = 1024,
  temperature = 0.7
): Promise<string> {
  const cfg = MODELS[modelId];
  const apiKey = process.env[cfg.envKey];
  if (!apiKey) throw new Error(`${cfg.label} API key not configured`);

  const resp = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.model, messages, max_tokens: maxTokens, temperature }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`${cfg.label} error ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? "";
}

function validateModel(id: unknown): ModelId {
  if (id === "groq" || id === "mistral" || id === "deepseek") return id;
  return "groq";
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/ai/models — list available models
router.get("/ai/models", requireAuth, (_req, res) => {
  const list = Object.entries(MODELS).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    available: !!process.env[cfg.envKey],
  }));
  res.json({ models: list });
});

// POST /api/ai/chat — multi-turn chat with chosen model
router.post("/ai/chat", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { model, messages } = req.body as {
    model?: string;
    messages?: { role: string; content: string }[];
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const modelId = validateModel(model);
  try {
    const reply = await callModel(modelId, messages, 1500, 0.75);
    res.json({ reply, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "AI chat failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

// POST /api/ai/compare — same prompt → all 3 models in parallel
router.post("/ai/compare", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { prompt, systemPrompt } = req.body as { prompt?: string; systemPrompt?: string };

  if (!prompt?.trim()) { res.status(400).json({ error: "prompt is required" }); return; }
  if (prompt.length > MAX_PROMPT) { res.status(400).json({ error: "prompt too long" }); return; }

  const msgs = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    { role: "user", content: prompt.trim() },
  ];

  const results = await Promise.allSettled(
    (["groq", "mistral", "deepseek"] as ModelId[]).map(async (id) => ({
      id,
      label: MODELS[id].label,
      text: await callModel(id, msgs, 1024, 0.75),
    }))
  );

  const responses = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { id: "unknown", label: "Unknown", text: "", error: (r.reason as Error).message }
  );

  res.json({ responses });
});

// POST /api/ai/caption — Instagram caption
router.post("/ai/caption", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { prompt, model } = req.body as { prompt?: string; model?: string };

  if (!prompt?.trim()) { res.status(400).json({ error: "prompt is required" }); return; }
  if (prompt.length > MAX_PROMPT) { res.status(400).json({ error: "prompt too long" }); return; }

  const modelId = validateModel(model);
  try {
    const caption = await callModel(
      modelId,
      [
        {
          role: "system",
          content:
            "You are a creative Instagram caption writer. Write engaging, on-trend captions (1-3 sentences). Add 5 relevant hashtags at the end. No markdown or asterisks. Reply with only the caption.",
        },
        { role: "user", content: prompt.trim() },
      ],
      250,
      0.9
    );
    res.json({ caption, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "Caption generation failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

// POST /api/ai/hashtags — hashtag generator
router.post("/ai/hashtags", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { topic, count = 20, model } = req.body as { topic?: string; count?: number; model?: string };

  if (!topic?.trim()) { res.status(400).json({ error: "topic is required" }); return; }

  const modelId = validateModel(model);
  try {
    const text = await callModel(
      modelId,
      [
        {
          role: "system",
          content: `Generate exactly ${count} Instagram hashtags for the given topic. Return only hashtags, one per line, each starting with #. No explanations.`,
        },
        { role: "user", content: topic.trim() },
      ],
      300,
      0.8
    );
    const hashtags = text
      .split(/\n|,/)
      .map((h) => h.trim())
      .filter((h) => h.startsWith("#"));
    res.json({ hashtags, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "Hashtag generation failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

// POST /api/ai/bio — profile bio generator
router.post("/ai/bio", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { description, style = "casual", model } = req.body as {
    description?: string;
    style?: string;
    model?: string;
  };

  if (!description?.trim()) { res.status(400).json({ error: "description is required" }); return; }

  const modelId = validateModel(model);
  try {
    const bio = await callModel(
      modelId,
      [
        {
          role: "system",
          content: `Write a ${style} Instagram bio (max 150 characters). Make it catchy and authentic. Include an emoji or two. Reply with only the bio text.`,
        },
        { role: "user", content: description.trim() },
      ],
      100,
      0.85
    );
    res.json({ bio, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "Bio generation failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

// POST /api/ai/translate — text translation
router.post("/ai/translate", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { text, targetLanguage, model } = req.body as {
    text?: string;
    targetLanguage?: string;
    model?: string;
  };

  if (!text?.trim()) { res.status(400).json({ error: "text is required" }); return; }
  if (!targetLanguage?.trim()) { res.status(400).json({ error: "targetLanguage is required" }); return; }

  const modelId = validateModel(model);
  try {
    const translation = await callModel(
      modelId,
      [
        {
          role: "system",
          content: `You are a professional translator. Translate the given text to ${targetLanguage}. Return only the translated text, nothing else.`,
        },
        { role: "user", content: text.trim() },
      ],
      1000,
      0.3
    );
    res.json({ translation, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "Translation failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

// POST /api/ai/improve — rewrite & improve text
router.post("/ai/improve", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { text, tone = "professional", model } = req.body as {
    text?: string;
    tone?: string;
    model?: string;
  };

  if (!text?.trim()) { res.status(400).json({ error: "text is required" }); return; }

  const modelId = validateModel(model);
  try {
    const improved = await callModel(
      modelId,
      [
        {
          role: "system",
          content: `Rewrite the given text to be more ${tone}. Fix grammar, improve clarity and flow. Keep the same meaning but make it better. Return only the improved text.`,
        },
        { role: "user", content: text.trim() },
      ],
      1500,
      0.6
    );
    res.json({ improved, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "Text improvement failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

// POST /api/ai/sentiment — sentiment analysis
router.post("/ai/sentiment", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { text, model } = req.body as { text?: string; model?: string };

  if (!text?.trim()) { res.status(400).json({ error: "text is required" }); return; }

  const modelId = validateModel(model);
  try {
    const raw = await callModel(
      modelId,
      [
        {
          role: "system",
          content: `Analyze the sentiment of the given text and return a JSON object with:
- "sentiment": "positive" | "negative" | "neutral" | "mixed"
- "score": number from -1.0 (very negative) to 1.0 (very positive)
- "emotions": array of detected emotions (e.g. ["joy", "excitement"])
- "summary": one sentence explaining the sentiment
Return only valid JSON.`,
        },
        { role: "user", content: text.trim() },
      ],
      300,
      0.2
    );

    type SentimentResult = { sentiment: string; score: number; emotions: string[]; summary: string };
    const fallback: SentimentResult = { sentiment: "neutral", score: 0, emotions: [], summary: raw };
    let parsed: SentimentResult = fallback;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const candidate = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        const validSentiments = ["positive", "negative", "neutral", "mixed"];
        parsed = {
          sentiment: typeof candidate.sentiment === "string" && validSentiments.includes(candidate.sentiment)
            ? candidate.sentiment
            : "neutral",
          score: typeof candidate.score === "number" ? Math.max(-1, Math.min(1, candidate.score)) : 0,
          emotions: Array.isArray(candidate.emotions)
            ? (candidate.emotions as unknown[]).filter((e): e is string => typeof e === "string")
            : [],
          summary: typeof candidate.summary === "string" ? candidate.summary : raw,
        };
      }
    } catch {
      parsed = fallback;
    }

    res.json({ analysis: parsed, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "Sentiment analysis failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

// POST /api/ai/story — creative story generator
router.post("/ai/story", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { prompt, genre = "general", length = "short", model } = req.body as {
    prompt?: string;
    genre?: string;
    length?: string;
    model?: string;
  };

  if (!prompt?.trim()) { res.status(400).json({ error: "prompt is required" }); return; }

  const wordCount = length === "short" ? "100-150" : length === "medium" ? "200-300" : "400-500";
  const modelId = validateModel(model);
  try {
    const story = await callModel(
      modelId,
      [
        {
          role: "system",
          content: `You are a creative storyteller. Write a ${genre} story based on the given prompt. Keep it ${wordCount} words. Make it engaging with vivid descriptions. No markdown or asterisks.`,
        },
        { role: "user", content: prompt.trim() },
      ],
      700,
      0.9
    );
    res.json({ story, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "Story generation failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

// POST /api/ai/roast — fun roast generator
router.post("/ai/roast", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { subject, model } = req.body as { subject?: string; model?: string };

  if (!subject?.trim()) { res.status(400).json({ error: "subject is required" }); return; }

  const modelId = validateModel(model);
  try {
    const roast = await callModel(
      modelId,
      [
        {
          role: "system",
          content:
            "You are a comedian. Write a funny, light-hearted roast about the given subject. Keep it playful and not offensive. 2-3 sentences max. No markdown.",
        },
        { role: "user", content: subject.trim() },
      ],
      200,
      0.95
    );
    res.json({ roast, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "Roast generation failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

// POST /api/ai/reply-suggestions — suggest replies to a comment/message
router.post("/ai/reply-suggestions", requireAuth, aiLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { message, context, model } = req.body as {
    message?: string;
    context?: string;
    model?: string;
  };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const modelId = validateModel(model);
  try {
    const raw = await callModel(
      modelId,
      [
        {
          role: "system",
          content: `Generate 4 short reply suggestions for the given message${context ? ` in the context of: ${context}` : ""}. 
Return a JSON array of strings. Each reply should be different in tone (e.g. friendly, witty, formal, enthusiastic). Keep each reply under 20 words. Return only the JSON array.`,
        },
        { role: "user", content: message.trim() },
      ],
      300,
      0.85
    );

    let suggestions: string[] = [];
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as unknown;
        suggestions = Array.isArray(parsed)
          ? (parsed as unknown[]).filter((s): s is string => typeof s === "string")
          : [raw];
      } else {
        suggestions = [raw];
      }
    } catch {
      suggestions = [raw];
    }

    res.json({ suggestions, model: MODELS[modelId].label });
  } catch (e: any) {
    req.log.error({ err: e }, "Reply suggestions failed");
    res.status(502).json({ error: e.message ?? "AI service error" });
  }
});

export default router;
