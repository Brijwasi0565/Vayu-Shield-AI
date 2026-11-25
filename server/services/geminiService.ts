import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';

export type ChatMode = 'standard' | 'fast' | 'thinking' | 'search' | 'maps';

export interface ChatContext {
  city?: string;
  latitude?: number;
  longitude?: number;
  aqi?: number;
  category?: string;
  householdSummary?: string;
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface AIChatResult {
  reply: string;
  model: string;
  links: Array<{ title: string; uri: string }>;
}

export interface PosterCopyResult {
  headline: string;
  subhead: string;
  bullets: string[];
}

const posterOutputSchema = z.object({
  headline: z.string().trim().min(1).max(80).optional(),
  subhead: z.string().trim().min(1).max(120).optional(),
  bullets: z.array(z.string().trim().min(1).max(120)).max(5).optional(),
});

/**
 * Instantiates the server-side Gemini client using GEMINI_API_KEY.
 * Returns null when unconfigured or left as a placeholder.
 */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildSystemInstruction(context?: ChatContext): string {
  const contextText = context
    ? `Current user context — City: ${context.city || 'New Delhi'}, Lat/Lon: ${context.latitude ?? 28.61},${context.longitude ?? 77.21}, Live AQI: ${context.aqi ?? 'Unknown'} (${context.category || 'N/A'}), Household: ${context.householdSummary || 'Standard adult'}.`
    : '';
  return (
    `You are VayuShield AI Environmental Health Advisor for India. ` +
    `Provide clear, calm, evidence-based explanations of air quality metrics, mask/purifier choices, and daily protective routines. ` +
    `IMPORTANT GUARDRAILS: Never override deterministic medical emergency warnings (AQI > 300 means stay indoors & seek medical help for acute breathing distress). ` +
    `Always keep answers practical for Indian households (mention N95/N99 standards, wet mopping, CPCB/WHO context when helpful). ` +
    contextText
  );
}

/** Runs a grounded or multi-turn environmental health chat completion. */
export async function runAIChat(
  ai: GoogleGenAI,
  params: {
    message: string;
    history: ChatTurn[];
    mode: ChatMode;
    context?: ChatContext;
  },
): Promise<AIChatResult> {
  const { message, history, mode, context } = params;
  const systemInstruction = buildSystemInstruction(context);

  if (mode === 'search') {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: message,
      config: { systemInstruction, tools: [{ googleSearch: {} }] },
    });
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const links = chunks
      .map((c: { web?: { uri?: string; title?: string } }) =>
        c.web?.uri ? { title: c.web.title || c.web.uri, uri: c.web.uri } : null,
      )
      .filter((x): x is { title: string; uri: string } => Boolean(x));
    return {
      reply: response.text || 'No response generated.',
      model: 'gemini-4-hydrogen (Google Search Grounded)',
      links,
    };
  }

  if (mode === 'maps') {
    const lat = context?.latitude ?? 28.6139;
    const lon = context?.longitude ?? 77.209;
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: message,
      config: {
        systemInstruction,
        tools: [{ googleMaps: {} }],
        toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lon } } },
      },
    });
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const links = chunks
      .map((c: { maps?: { uri?: string; title?: string } }) =>
        c.maps?.uri ? { title: c.maps.title || 'View on Google Maps', uri: c.maps.uri } : null,
      )
      .filter((x): x is { title: string; uri: string } => Boolean(x));
    return {
      reply: response.text || 'No places found.',
      model: 'gemini-4-hydrogen (Google Maps Grounded)',
      links,
    };
  }

  if (mode === 'fast') {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [
        ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
        { role: 'user', parts: [{ text: message }] },
      ],
      config: { systemInstruction },
    });
    return {
      reply: response.text || 'No response generated.',
      model: 'gemini-3.1-flash-lite (Low Latency)',
      links: [],
    };
  }

  if (mode === 'thinking') {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
        { role: 'user', parts: [{ text: message }] },
      ],
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    });
    return {
      reply: response.text || 'No response generated.',
      model: 'gemini-4-hydrogen (High Thinking)',
      links: [],
    };
  }

  const chat = ai.chats.create({
    model: 'gemini-4-hydrogen',
    history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    config: { systemInstruction },
  });
  const response = await chat.sendMessage({ message });
  return {
    reply: response.text || 'No response generated.',
    model: 'gemini-4-hydrogen',
    links: [],
  };
}

/** Transcribes spoken audio into English or Indian regional text. */
export async function transcribeAudio(
  ai: GoogleGenAI,
  audioBase64: string,
  mimeType: string,
): Promise<{ transcript: string; model: string }> {
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        { inlineData: { mimeType, data: audioBase64 } },
        { text: 'Transcribe this audio accurately in English or the spoken Indian language.' },
      ],
    },
  });
  return {
    transcript: (response.text || '').trim(),
    model: 'gemini-3.5-transcribe',
  };
}

/** Generates structured awareness poster copy with deterministic offline fallback. */
export async function generatePosterCopy(
  ai: GoogleGenAI | null,
  params: { promptText: string; city: string; aqi: number },
): Promise<PosterCopyResult> {
  const { promptText, city, aqi } = params;
  const fallback: PosterCopyResult = {
    headline: `Breathe Safer in ${city}`,
    subhead: `Current AQI ${aqi} · Practical Household Protection`,
    bullets: [
      'Wear a fitted N95 mask on high-traffic commutes',
      'Keep windows shut during peak morning smog hours',
      'Run HEPA filtration & wet-mop floors daily',
    ],
  };
  if (!ai) return fallback;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Create concise awareness poster copy for "${promptText}" in ${city} (AQI ${aqi}). Return JSON with fields: headline (max 6 words), subhead (max 10 words), bullets (array of 3 short 6-9 word action tips).`,
      config: { responseMimeType: 'application/json' },
    });
    const raw = JSON.parse(response.text || '{}');
    const validated = posterOutputSchema.safeParse(raw);
    if (!validated.success) return fallback;
    return {
      headline: validated.data.headline || fallback.headline,
      subhead: validated.data.subhead || fallback.subhead,
      bullets: validated.data.bullets?.length
        ? validated.data.bullets.slice(0, 3)
        : fallback.bullets,
    };
  } catch {
    return fallback;
  }
}
