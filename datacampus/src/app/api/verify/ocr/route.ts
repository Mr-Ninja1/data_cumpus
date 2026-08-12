import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/utils/serverAuth";

export const runtime = "nodejs";

type OcrResult = {
  fullName: string | null;
  studentId: string | null;
  program: string | null;
  confidence: number;
  rawText?: string;
  source: "gemini" | "stub";
};

function parseJsonLoose(text: string): Partial<OcrResult> | null {
  try {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1].trim() : trimmed;
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function runGeminiVision(base64: string, mime: string): Promise<OcrResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const model =
    process.env.GEMINI_VISION_MODEL ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";

  const url =
    process.env.GEMINI_API_URL ||
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const prompt = `You are reading a Zambia / ZICTC student ID card image
(Zambia University College of Technology and similar campus IDs).

Typical layout (left-to-right):
- Blue vertical "STUDENT" strip on the left
- Institution name at the top
- Large student full name
- Student number directly under the name (often digits like 2300104)
- Line starting with "Programme:" (e.g. Degree - Software Engineering)
- Photo on the right
- "Issued On :" date near the bottom

Extract fields and return ONLY valid JSON with this shape:
{
  "fullName": string | null,
  "studentId": string | null,
  "program": string | null,
  "confidence": number
}
Rules:
- fullName is the official printed student name (not the institution name).
- studentId is the student number under the name (digits/alphanumeric), not the issue date.
- program is the text after "Programme:" (include the degree type if present).
- confidence is 0–1 for how sure you are the card is a real student ID with readable fields.
- If the image is not an ID card, set confidence below 0.4 and null fields.
- Do not invent values.`;

  const useQueryKey = url.includes("generativelanguage.googleapis.com");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(useQueryKey ? {} : { Authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify(
      useQueryKey
        ? {
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: mime, data: base64 } },
                ],
              },
            ],
            generationConfig: { temperature: 0.1 },
          }
        : {
            model,
            prompt,
            image_base64: base64,
            mime_type: mime,
          }
    ),
  });

  if (!res.ok) {
    console.error("OCR gemini error", res.status, await res.text());
    return null;
  }

  const json = await res.json();
  const text =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ||
    json?.output_text ||
    json?.output ||
    "";

  const parsed = parseJsonLoose(String(text));
  if (!parsed) return null;

  const asText = (v: unknown) => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  };

  return {
    fullName: asText(parsed.fullName),
    studentId: asText(parsed.studentId),
    program: asText(parsed.program),
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
    rawText: String(text).slice(0, 4000),
    source: "gemini",
  };
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("image") || form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 400 });
  }

  const mime = file.type || "image/jpeg";
  const base64 = buf.toString("base64");

  let result = await runGeminiVision(base64, mime).catch((err) => {
    console.error("OCR failed", err);
    return null;
  });

  // Fallback when Gemini key is missing or the vision call fails
  if (!result) {
    const configured = Boolean(process.env.GEMINI_API_KEY);
    result = {
      fullName: null,
      studentId: null,
      program: null,
      confidence: 0.45,
      source: "stub",
      rawText: configured
        ? "OCR model call failed — your submission will go to review."
        : "OCR provider not configured — submission will need review.",
    };
  }

  return NextResponse.json({
    fullName: result.fullName,
    studentId: result.studentId,
    program: result.program,
    confidence: result.confidence,
    source: result.source,
    rawText: result.rawText,
  });
}
