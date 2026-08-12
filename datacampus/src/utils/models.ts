type RunModelOpts = {
  provider?: string;
  model?: string;
  prompt?: string;
  system?: string;
  messages?: { role: "system" | "user" | "assistant"; content: string }[];
  maxTokens?: number;
};

function flattenMessages(opts: RunModelOpts) {
  const parts: string[] = [];
  if (opts.prompt) parts.push(opts.prompt);
  for (const m of opts.messages || []) {
    if (m.role === "system") continue;
    parts.push(`${m.role.toUpperCase()}: ${m.content}`);
  }
  return parts.join("\n\n") || "Continue.";
}

async function runGeminiGenerateContent(opts: RunModelOpts): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const model =
    opts.model && opts.model !== "default"
      ? opts.model
      : process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const customUrl = process.env.GEMINI_API_URL;
  const url =
    customUrl ||
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const system = opts.system || "";
  const combinedUserText = flattenMessages(opts);

  const useGoogleApi = url.includes("generativelanguage.googleapis.com");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(useGoogleApi ? {} : { Authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify(
      useGoogleApi
        ? {
            systemInstruction: system ? { parts: [{ text: system }] } : undefined,
            contents: [
              {
                role: "user",
                parts: [{ text: combinedUserText }],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: opts.maxTokens || 2048,
            },
          }
        : {
            model,
            prompt: opts.prompt,
            system: opts.system,
            messages: opts.messages,
            max_tokens: opts.maxTokens || 2048,
          }
    ),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const text =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ||
    json?.output_text ||
    json?.output ||
    json?.choices?.[0]?.text ||
    "";
  return String(text || "").trim();
}

async function runClaudeMessages(opts: RunModelOpts): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

  const model =
    opts.model && opts.model !== "default"
      ? opts.model
      : process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest";

  const url = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: opts.system || undefined,
      max_tokens: opts.maxTokens || 2048,
      messages: [
        {
          role: "user",
          content: flattenMessages(opts),
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const text =
    json?.content?.filter((part: { type?: string }) => part?.type === "text")
      ?.map((part: { text?: string }) => part.text || "")
      .join("") ||
    json?.output_text ||
    "";

  return String(text || "").trim();
}

export async function runModel(opts: RunModelOpts) {
  const provider = opts.provider || process.env.MODEL_PROVIDER || "local-stub";

  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    try {
      return await runGeminiGenerateContent(opts);
    } catch (err: unknown) {
      console.error("Model call failed", err instanceof Error ? err.message : err);
      throw err;
    }
  }

  if (provider === "claude" && process.env.ANTHROPIC_API_KEY) {
    try {
      return await runClaudeMessages(opts);
    } catch (err: unknown) {
      console.error("Claude call failed", err instanceof Error ? err.message : err);
      throw err;
    }
  }

  const system = opts.system ? `${opts.system}\n\n` : "";
  const messages = (opts.messages || [])
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
  const prompt = opts.prompt ? `PROMPT: ${opts.prompt}\n\n` : "";

  return `${system}${messages}\n\n${prompt}\n
This is a local-stub response. Replace with a real model by setting MODEL_PROVIDER=gemini and providing GEMINI_API_KEY.`;
}
