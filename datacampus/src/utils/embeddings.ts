// Embedding utilities with optional external API and deterministic local fallback
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiUrl = process.env.EMBEDDING_API_URL;
  const apiKey = process.env.EMBEDDING_API_KEY;

  if (apiUrl && apiKey) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: text }),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error('Embedding API error', res.status, txt);
        return localFallbackEmbedding(text);
      }
      const json = await res.json();
      // Expect returning { embedding: number[] } or { data: { embedding } }
      const emb = json.embedding ?? json.data?.embedding ?? json.data?.[0]?.embedding ?? null;
      if (Array.isArray(emb)) return emb.map(Number);
      // Some providers return nested structures; try to find first numeric array
      const found = findNumericArray(json);
      if (found) return found;
      return localFallbackEmbedding(text);
    } catch (err) {
      console.error('Embedding call failed', err);
      return localFallbackEmbedding(text);
    }
  }

  return localFallbackEmbedding(text);
}

function findNumericArray(obj: any): number[] | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    if (obj.every((v) => typeof v === 'number')) return obj as number[];
    for (const el of obj) {
      const f = findNumericArray(el);
      if (f) return f;
    }
  } else {
    for (const k of Object.keys(obj)) {
      const f = findNumericArray(obj[k]);
      if (f) return f;
    }
  }
  return null;
}

function localFallbackEmbedding(text: string, dim = 128): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = text.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const idx = h % dim;
    vec[idx] += 1;
  }
  // normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm === 0) return vec.map(() => 0);
  return vec.map((v) => v / norm);
}

export function cosineSim(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
