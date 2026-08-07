type RunModelOpts = {
  provider?: string;
  model?: string;
  prompt?: string;
  system?: string;
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
};

export async function runModel(opts: RunModelOpts) {
  const provider = opts.provider || process.env.MODEL_PROVIDER || 'local-stub';
  const model = opts.model || 'default';

  // If GEMINI_API_KEY and GEMINI_API_URL are provided, call configured endpoint
  if (provider === 'gemini' && process.env.GEMINI_API_KEY && process.env.GEMINI_API_URL) {
    try {
      const body = {
        model,
        prompt: opts.prompt,
        messages: opts.messages,
        max_tokens: opts.maxTokens || 1024,
      };

      const res = await fetch(process.env.GEMINI_API_URL as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Model API error: ${res.status} ${text}`);
      }

      const json = await res.json();
      // Expecting the provider to return { output_text: string } or similar
      const output = (json.output_text ?? json.output ?? json.choices?.[0]?.text) || JSON.stringify(json);
      return String(output);
    } catch (err: any) {
      console.error('Model call failed', err?.message || err);
      throw err;
    }
  }

  // Local stub fallback for development — echoes prompt and context
  const system = opts.system ? `${opts.system}\n\n` : '';
  const messages = (opts.messages || []).map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  const prompt = opts.prompt ? `PROMPT: ${opts.prompt}\n\n` : '';

  const fallback = `${system}${messages}\n\n${prompt}\n
This is a local-stub response. Replace with a real model by setting MODEL_PROVIDER=gemini and providing GEMINI_API_URL and GEMINI_API_KEY.`;
  return fallback;
}
