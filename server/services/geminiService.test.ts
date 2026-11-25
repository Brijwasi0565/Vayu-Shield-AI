import test from 'node:test';
import assert from 'node:assert/strict';
import type { GoogleGenAI } from '@google/genai';
import { generatePosterCopy, getGeminiClient, runAIChat, transcribeAudio } from './geminiService';

function createMockGemini(overrides?: {
  generateText?: string;
  groundingChunks?: unknown[];
  throwOnCall?: boolean;
}) {
  const generateContent = async () => {
    if (overrides?.throwOnCall) throw new Error('Simulated SDK error');
    return {
      text: overrides?.generateText ?? 'Wear an N95 mask when AQI exceeds 150.',
      candidates: overrides?.groundingChunks
        ? [{ groundingMetadata: { groundingChunks: overrides.groundingChunks } }]
        : [],
    };
  };

  const chatsCreate = () => ({
    sendMessage: async () => {
      if (overrides?.throwOnCall) throw new Error('Simulated chat error');
      return { text: overrides?.generateText ?? 'Keep windows shut during inversion hours.' };
    },
  });

  return {
    models: { generateContent },
    chats: { create: chatsCreate },
  } as unknown as GoogleGenAI;
}

test('getGeminiClient returns null when GEMINI_API_KEY is unset or placeholder', () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal(getGeminiClient(), null);

  process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY';
  assert.equal(getGeminiClient(), null);

  process.env.GEMINI_API_KEY = 'test-local-placeholder-not-real';
  const client = getGeminiClient();
  assert.ok(client !== null);

  if (prev === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = prev;
});

test('runAIChat supports standard, fast, thinking, search, and maps modes', async () => {
  const mockAi = createMockGemini({
    groundingChunks: [
      { web: { uri: 'https://cpcb.nic.in/aqi', title: 'CPCB Bulletin' } },
      { maps: { uri: 'https://maps.google.com/?q=Lodhi+Garden', title: 'Lodhi Garden' } },
    ],
  });

  const standard = await runAIChat(mockAi, {
    message: 'How is the air?',
    history: [{ role: 'user', text: 'Hi' }],
    mode: 'standard',
    context: { city: 'Delhi', aqi: 240, category: 'Unhealthy' },
  });
  assert.equal(standard.model, 'gemini-4-hydrogen');
  assert.match(standard.reply, /windows shut/i);

  const fast = await runAIChat(mockAi, { message: 'Quick tip', history: [], mode: 'fast' });
  assert.match(fast.model, /flash-lite/i);

  const thinking = await runAIChat(mockAi, {
    message: 'Compare HEPA CADR',
    history: [],
    mode: 'thinking',
  });
  assert.match(thinking.model, /High Thinking/);

  const search = await runAIChat(mockAi, {
    message: 'Latest GRAP stage',
    history: [],
    mode: 'search',
  });
  assert.match(search.model, /Google Search/);
  assert.equal(search.links[0].title, 'CPCB Bulletin');

  const maps = await runAIChat(mockAi, {
    message: 'Nearby parks',
    history: [],
    mode: 'maps',
    context: { latitude: 28.6, longitude: 77.2 },
  });
  assert.match(maps.model, /Google Maps/);
  assert.equal(maps.links[0].title, 'Lodhi Garden');
});

test('transcribeAudio returns trimmed transcript and model tag', async () => {
  const mockAi = createMockGemini({ generateText: '  What is Delhi AQI today?  ' });
  const result = await transcribeAudio(mockAi, 'AAAA', 'audio/webm');
  assert.equal(result.transcript, 'What is Delhi AQI today?');
  assert.equal(result.model, 'gemini-3.5-transcribe');
});

test('generatePosterCopy validates structured JSON output and falls back on malformed AI text', async () => {
  const offline = await generatePosterCopy(null, {
    promptText: 'Clean air',
    city: 'Jaipur',
    aqi: 185,
  });
  assert.ok(offline.headline.includes('Jaipur'));
  assert.equal(offline.bullets.length, 3);

  const validAi = createMockGemini({
    generateText: JSON.stringify({
      headline: 'Protect Jaipur Kids',
      subhead: 'AQI 185 · Wear N95 Today',
      bullets: ['Use N95 mask', 'Seal bedroom doors', 'Run HEPA purifier', 'Extra bullet ignored'],
    }),
  });
  const aiOut = await generatePosterCopy(validAi, { promptText: 'Kids', city: 'Jaipur', aqi: 185 });
  assert.equal(aiOut.headline, 'Protect Jaipur Kids');
  assert.equal(aiOut.bullets.length, 3);

  const badJsonAi = createMockGemini({ generateText: 'not valid json {' });
  const fallbackOnBad = await generatePosterCopy(badJsonAi, {
    promptText: 'Kids',
    city: 'Jaipur',
    aqi: 185,
  });
  assert.ok(fallbackOnBad.headline.includes('Jaipur'));
});
