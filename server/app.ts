import type { GoogleGenAI } from '@google/genai';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { generateDeterministicRecommendations } from '../src/utils/recommendations';
import { TtlCache } from './cache';
import {
  apiSecurityHeaders,
  clampNumber,
  createRateLimiter,
  isSafeImageDataUrl,
  isValidEntityId,
  parseCoordinates,
  redactSecrets,
} from './security';
import {
  generatePosterCopy,
  getGeminiClient,
  runAIChat,
  transcribeAudio,
} from './services/geminiService';
import { createReportsStore } from './services/reportsStore';
import { createTelemetryService } from './services/telemetry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export interface CreateAppOptions {
  /** Optional injected Gemini client factory (for deterministic unit tests). */
  geminiClientFactory?: () => GoogleGenAI | null;
  /** Optional custom data directory for community reports persistence. */
  dataDir?: string;
}

const recommendationsSchema = z.object({
  currentAQI: z.number().min(0).max(1000),
  timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']).default('morning'),
  plannedActivity: z
    .enum(['outdoor_exercise', 'commute', 'school_drop', 'errands', 'indoor_rest'])
    .default('commute'),
  nearbyFireCount: z.number().min(0).max(500).optional(),
  members: z
    .array(
      z.object({
        id: z.string().max(128),
        name: z.string().max(80),
        ageGroup: z.enum(['infant', 'child', 'adult', 'elderly']),
        conditions: z.array(z.enum(['asthma', 'copd', 'allergies', 'heart_disease', 'pregnancy'])),
        activityLevel: z.enum(['sedentary', 'moderate', 'active']),
      }),
    )
    .max(15)
    .default([]),
});

const reportSchema = z.object({
  type: z.enum(['smoke', 'dust', 'traffic', 'industrial', 'clean_zone']),
  description: z.string().trim().min(3).max(500),
  city: z.string().trim().min(1).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  authorAlias: z.string().trim().min(1).max(60).optional(),
  authorId: z
    .string()
    .trim()
    .refine(isValidEntityId, 'Invalid author identifier format.')
    .optional(),
  photoDataUrl: z
    .string()
    .refine(isSafeImageDataUrl, 'Photo must be a PNG, JPEG, WebP or GIF image.')
    .optional(),
});

const voteSchema = z.object({
  vote: z.enum(['up', 'down']),
});

const chatSchema = z.object({
  message: z.string().trim().min(1).max(3000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        text: z.string().max(4000),
      }),
    )
    .max(20)
    .default([]),
  mode: z.enum(['standard', 'fast', 'thinking', 'search', 'maps']).default('standard'),
  context: z
    .object({
      city: z.string().max(80).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      aqi: z.number().min(0).max(1000).optional(),
      category: z.string().max(60).optional(),
      householdSummary: z.string().max(500).optional(),
    })
    .optional(),
});

const transcribeSchema = z.object({
  audioBase64: z
    .string()
    .min(10)
    .max(6_000_000)
    .regex(/^[A-Za-z0-9+/=]+$/, 'Audio payload must be base64 encoded.'),
  mimeType: z
    .string()
    .regex(
      /^audio\/(webm|mp4|ogg|wav|mpeg|mp3)(;codecs=[a-zA-Z0-9,._-]+)?$/,
      'Unsupported audio MIME type.',
    )
    .default('audio/webm'),
});

const posterCopySchema = z.object({
  prompt: z.string().trim().max(300).optional(),
  city: z.string().trim().max(60).optional(),
  aqi: z.unknown().optional(),
});

/**
 * Builds and configures the VayuShield AI Express API application.
 */
export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();
  const cache = new TtlCache(500);
  const telemetry = createTelemetryService(cache);
  const dataDir = path.resolve(
    options.dataDir || process.env.VAYU_DATA_DIR || path.join(PROJECT_ROOT, '.data'),
  );
  const reportsStore = createReportsStore(dataDir);
  const resolveGemini = options.geminiClientFactory || getGeminiClient;
  const limiter = createRateLimiter();
  const rateLimit = limiter.middleware;

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  app.use('/api', apiSecurityHeaders());

  const defaultJson = express.json({ limit: '1mb' });
  const audioJson = express.json({ limit: '6mb' });
  app.use((req, res, next) =>
    req.path === '/api/ai/transcribe' ? next() : defaultJson(req, res, next),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/aqi', rateLimit(120), async (req, res) => {
    const coords = parseCoordinates(req.query.lat, req.query.lon);
    const city = String(req.query.city || 'New Delhi').slice(0, 80);
    if (!coords) {
      return res.status(400).json({ error: 'Invalid latitude or longitude coordinates.' });
    }
    try {
      const data = await telemetry.fetchRealAQI(coords.lat, coords.lon, city);
      return res.json(data);
    } catch (err) {
      console.error('AQI fetch failed:', redactSecrets(String(err)));
      return res.status(502).json({
        error: 'Unable to retrieve live AQI from Open-Meteo or fallback feeds.',
      });
    }
  });

  app.get('/api/weather', rateLimit(120), async (req, res) => {
    const coords = parseCoordinates(req.query.lat, req.query.lon);
    if (!coords) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }
    try {
      const data = await telemetry.fetchRealWeather(coords.lat, coords.lon);
      return res.json(data);
    } catch (err) {
      console.error('Weather fetch failed:', redactSecrets(String(err)));
      return res.status(502).json({ error: 'Unable to fetch Open-Meteo weather data.' });
    }
  });

  app.get('/api/fires', rateLimit(60), async (req, res) => {
    const coords = parseCoordinates(req.query.lat, req.query.lon);
    if (!coords) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }
    try {
      const data = await telemetry.fetchRealFires(coords.lat, coords.lon);
      return res.json(data);
    } catch (err) {
      console.error('Fire alerts fetch failed:', redactSecrets(String(err)));
      return res.status(502).json({ error: 'Unable to fetch NASA fire alert feed.' });
    }
  });

  app.get('/api/geocode', rateLimit(60), async (req, res) => {
    const q = String(req.query.q || '');
    const results = await telemetry.geocodeCity(q);
    return res.json({ results });
  });

  app.post('/api/recommendations', rateLimit(120), (req, res) => {
    const parsed = recommendationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid recommendation input', details: parsed.error.issues });
    }
    return res.json(generateDeterministicRecommendations(parsed.data));
  });

  app.get('/api/reports', rateLimit(120), (_req, res) => {
    return res.json({ reports: reportsStore.load() });
  });

  app.post('/api/reports', rateLimit(30), (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid report submission', details: parsed.error.issues });
    }
    const report = reportsStore.create(parsed.data);
    return res.status(201).json({ report });
  });

  app.post('/api/reports/:id/vote', rateLimit(60), (req, res) => {
    const id = req.params.id;
    if (!isValidEntityId(id)) {
      return res.status(400).json({ error: 'Invalid report identifier.' });
    }
    const parsed = voteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Vote must be "up" or "down".' });
    }
    const updated = reportsStore.vote(id, parsed.data.vote);
    if (!updated) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    return res.json({ report: updated });
  });

  app.post('/api/ai/chat', rateLimit(30), async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid AI request payload.' });
    }
    const ai = resolveGemini();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured in server environment secrets.',
      });
    }
    try {
      const result = await runAIChat(ai, parsed.data);
      return res.json(result);
    } catch (err) {
      console.error('Gemini chat error:', redactSecrets(String(err)));
      return res
        .status(502)
        .json({ error: 'The AI service is unavailable right now. Please try again.' });
    }
  });

  app.post('/api/ai/transcribe', rateLimit(20), audioJson, async (req, res) => {
    const parsed = transcribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid audio payload.' });
    }
    const ai = resolveGemini();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }
    try {
      const result = await transcribeAudio(ai, parsed.data.audioBase64, parsed.data.mimeType);
      return res.json(result);
    } catch (err) {
      console.error('Gemini transcribe error:', redactSecrets(String(err)));
      return res.status(502).json({ error: 'Audio transcription failed. Please try again.' });
    }
  });

  app.post('/api/ai/poster-copy', rateLimit(20), async (req, res) => {
    const parsed = posterCopySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid poster copy request.' });
    }
    const promptText = parsed.data.prompt || 'Clean air protection for school children';
    const city = parsed.data.city || 'New Delhi';
    const aqi = Math.round(clampNumber(parsed.data.aqi, 0, 1000, 150));
    const result = await generatePosterCopy(resolveGemini(), { promptText, city, aqi });
    return res.json(result);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use(
    (
      err: Error & { status?: number; type?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) return next(err);
      if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body is too large.' });
      }
      if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Malformed JSON body.' });
      }
      console.error('Unhandled server error:', redactSecrets(String(err)));
      return res.status(500).json({ error: 'Internal server error.' });
    },
  );

  return app;
}
