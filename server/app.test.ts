import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { GoogleGenAI } from '@google/genai';

// The app reads these at import time, so set them before loading it.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vayushield-test-'));
process.env.VAYU_DATA_DIR = dataDir;
delete process.env.GEMINI_API_KEY;

let server: http.Server;
let base = '';
let mockedServer: http.Server;
let mockedBase = '';

before(async () => {
  const { createApp } = await import('./app');
  server = http.createServer(createApp({ dataDir }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const mockAi = {
    models: {
      generateContent: async () => ({
        text: 'Use an N95 mask outdoors and run HEPA indoors.',
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: 'https://cpcb.nic.in', title: 'CPCB' } },
                { web: { uri: 'javascript:alert(1)', title: 'Bad Link' } },
              ],
            },
          },
        ],
      }),
    },
    chats: {
      create: () => ({
        sendMessage: async () => ({ text: 'Stay indoors while AQI is elevated.' }),
      }),
    },
  } as unknown as GoogleGenAI;

  mockedServer = http.createServer(
    createApp({
      dataDir,
      geminiClientFactory: () => mockAi,
    }),
  );
  await new Promise<void>((resolve) => mockedServer.listen(0, '127.0.0.1', resolve));
  mockedBase = `http://127.0.0.1:${(mockedServer.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => mockedServer.close(() => resolve()));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const post = (url: string, body: unknown, raw = false, targetBase = base) =>
  fetch(`${targetBase}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });

test('GET /api/health responds ok and hides the framework header', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { ok: boolean }).ok, true);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('unknown API routes return a JSON 404', async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found.' });
});

test('malformed JSON returns 400 without a stack trace', async () => {
  const res = await post('/api/recommendations', '{not json', true);
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.ok(!text.includes('node_modules'));
  assert.ok(!text.includes(' at '));
});

test('oversized JSON bodies are rejected with 413', async () => {
  const res = await post('/api/recommendations', {
    currentAQI: 100,
    filler: 'x'.repeat(1_200_000),
  });
  assert.equal(res.status, 413);
});

test('invalid coordinates are rejected on AQI, weather and fire routes', async () => {
  for (const route of ['aqi', 'weather', 'fires']) {
    const res = await fetch(`${base}/api/${route}?lat=999&lon=abc`);
    assert.equal(res.status, 400, `${route} should reject bad coordinates`);
  }
});

test('POST /api/recommendations validates input and returns guidance', async () => {
  const bad = await post('/api/recommendations', { currentAQI: 5000 });
  assert.equal(bad.status, 400);

  const ok = await post('/api/recommendations', {
    currentAQI: 320,
    timeOfDay: 'morning',
    plannedActivity: 'commute',
    members: [
      {
        id: 'm1',
        name: 'Asha',
        ageGroup: 'child',
        conditions: ['asthma'],
        activityLevel: 'moderate',
      },
    ],
  });
  assert.equal(ok.status, 200);
  const json = (await ok.json()) as Record<string, unknown>;
  assert.ok(Object.keys(json).length > 0);
});

test('reports: list, create, vote, validate entity IDs and reject unsafe photos', async () => {
  const list = await fetch(`${base}/api/reports`);
  assert.equal(list.status, 200);
  const { reports } = (await list.json()) as { reports: unknown[] };
  assert.ok(reports.length >= 1);

  const valid = {
    type: 'smoke',
    description: 'Crop burning smoke visible near the highway.',
    city: 'Mathura',
    latitude: 27.49,
    longitude: 77.67,
  };

  const svg = await post('/api/reports', {
    ...valid,
    photoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pjwvc3ZnPg==',
  });
  assert.equal(svg.status, 400);

  const badCoords = await post('/api/reports', { ...valid, latitude: 200 });
  assert.equal(badCoords.status, 400);

  const created = await post('/api/reports', {
    ...valid,
    photoDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  });
  assert.equal(created.status, 201);
  const { report } = (await created.json()) as { report: { id: string; upvotes: number } };
  assert.equal(report.upvotes, 1);

  const voted = await post(`/api/reports/${encodeURIComponent(report.id)}/vote`, { vote: 'up' });
  assert.equal(voted.status, 200);
  assert.equal(((await voted.json()) as { report: { upvotes: number } }).report.upvotes, 2);

  const badVote = await post(`/api/reports/${encodeURIComponent(report.id)}/vote`, {
    vote: 'side',
  });
  assert.equal(badVote.status, 400);

  const invalidId = await post('/api/reports/bad$id!/vote', { vote: 'up' });
  assert.equal(invalidId.status, 400);

  const missing = await post('/api/reports/nope/vote', { vote: 'up' });
  assert.equal(missing.status, 404);
});

test('AI chat reports 503 when no Gemini key is set and returns grounded replies when mocked', async () => {
  const res = await post('/api/ai/chat', { message: 'What mask should I wear?' });
  assert.equal(res.status, 503);
  const text = await res.text();
  assert.ok(!/AIza/.test(text));

  const invalid = await post('/api/ai/chat', { message: '' });
  assert.equal(invalid.status, 400);

  const ok = await post(
    '/api/ai/chat',
    { message: 'Check GRAP stage', mode: 'search', history: [{ role: 'user', text: 'Hi' }] },
    false,
    mockedBase,
  );
  assert.equal(ok.status, 200);
  const json = (await ok.json()) as { reply: string; links: Array<{ uri: string }> };
  assert.match(json.reply, /N95/);
  assert.equal(json.links.length, 2);
});

test('poster copy falls back to safe offline text and clamps AQI', async () => {
  const res = await post('/api/ai/poster-copy', {
    prompt: 'Schools',
    city: 'Mathura',
    aqi: 'DROP TABLE',
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { headline: string; subhead: string; bullets: string[] };
  assert.ok(json.headline.includes('Mathura'));
  assert.ok(json.subhead.includes('150'));
  assert.equal(json.bullets.length, 3);
});

test('transcribe validates mimeType/base64 and succeeds with configured Gemini client', async () => {
  const badLen = await post('/api/ai/transcribe', { audioBase64: 'x' });
  assert.equal(badLen.status, 400);

  const badMime = await post('/api/ai/transcribe', {
    audioBase64: 'QUFBQUFBQUFBQUFB',
    mimeType: 'text/html',
  });
  assert.equal(badMime.status, 400);

  const noKey = await post('/api/ai/transcribe', {
    audioBase64: 'QUFBQUFBQUFBQUFB',
    mimeType: 'audio/webm',
  });
  assert.equal(noKey.status, 503);

  const ok = await post(
    '/api/ai/transcribe',
    { audioBase64: 'QUFBQUFBQUFBQUFB', mimeType: 'audio/webm' },
    false,
    mockedBase,
  );
  assert.equal(ok.status, 200);
  const json = (await ok.json()) as { transcript: string; model: string };
  assert.equal(json.model, 'gemini-3.5-transcribe');
  assert.match(json.transcript, /N95/);
});
