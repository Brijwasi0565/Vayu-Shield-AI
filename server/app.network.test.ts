import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { weatherCodeToLabel } from './services/telemetry';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vayushield-net-'));
process.env.VAYU_DATA_DIR = dataDir;
delete process.env.GEMINI_API_KEY;
delete process.env.WAQI_API_KEY;
delete process.env.OPENAQ_API_KEY;
delete process.env.NASA_FIRMS_API_KEY;

const realFetch = globalThis.fetch;
type Handler = (url: string) => Response | Promise<Response>;
let handler: Handler = () => new Response('{}', { status: 500 });
let upstreamCalls: string[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  upstreamCalls.push(url);
  return handler(url);
}) as typeof fetch;

let server: http.Server;
let base = '';

before(async () => {
  const { createApp } = await import('./app');
  server = http.createServer(createApp({ dataDir }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  upstreamCalls = [];
  handler = () => new Response('{}', { status: 500 });
  delete process.env.WAQI_API_KEY;
  delete process.env.OPENAQ_API_KEY;
  delete process.env.NASA_FIRMS_API_KEY;
});

const hours = Array.from({ length: 72 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 20, 0, 0, 0) + i * 3600_000);
  return d.toISOString().slice(0, 16);
});

const airQualityPayload = {
  current: {
    pm2_5: 112.44,
    pm10: 190.2,
    nitrogen_dioxide: 40.1,
    ozone: 55,
    sulphur_dioxide: 12.3,
    carbon_monoxide: 900,
    us_aqi: 180,
  },
  hourly: {
    time: hours,
    pm2_5: hours.map((_, i) => 80 + (i % 10)),
    pm10: hours.map((_, i) => 120 + (i % 10)),
    us_aqi: hours.map(() => 150),
  },
};

test('weatherCodeToLabel maps WMO codes accurately', () => {
  assert.equal(weatherCodeToLabel(0), 'Clear Sky');
  assert.equal(weatherCodeToLabel(2), 'Partly Cloudy');
  assert.equal(weatherCodeToLabel(48), 'Haze / Fog');
  assert.equal(weatherCodeToLabel(53), 'Light Drizzle');
  assert.equal(weatherCodeToLabel(63), 'Rain');
  assert.equal(weatherCodeToLabel(73), 'Snow / Hail');
  assert.equal(weatherCodeToLabel(81), 'Rain Showers');
  assert.equal(weatherCodeToLabel(95), 'Thunderstorm');
  assert.equal(weatherCodeToLabel(88), 'Overcast');
});

test('GET /api/aqi builds an Indian AQI response with dominant pollutant and OpenAQ enrichment', async () => {
  process.env.OPENAQ_API_KEY = 'openaq-test';
  handler = (url) => {
    if (url.includes('api.openaq.org')) {
      return json({
        results: [
          { name: 'R.K. Puram Monitor', coordinates: { latitude: 28.56, longitude: 77.18 } },
        ],
      });
    }
    return json(airQualityPayload);
  };
  const url = `${base}/api/aqi?lat=27.49&lon=77.67&city=Mathura`;

  const first = await realFetch(url);
  assert.equal(first.status, 200);
  const body = (await first.json()) as {
    location: string;
    aqi: number;
    category: string;
    dominantPollutant: string;
    forecast: unknown[];
    hourly: unknown[];
    pollutants: { pm25: number };
    stations: Array<{ name: string; source: string }>;
    fallbackUsed: boolean;
  };
  assert.equal(body.location, 'Mathura');
  assert.ok(body.aqi > 100, `aqi ${body.aqi}`);
  assert.equal(body.dominantPollutant, 'PM2.5');
  assert.equal(body.hourly.length, 48);
  assert.ok(body.forecast.length >= 3);
  assert.equal(body.pollutants.pm25, 112.4);
  assert.equal(body.stations.length, 2);
  assert.equal(body.stations[1].source, 'OpenAQ v3');
  assert.equal(body.fallbackUsed, false);
  assert.equal(upstreamCalls.length, 2);

  const second = await realFetch(url);
  assert.equal(second.status, 200);
  assert.equal(upstreamCalls.length, 2, 'second request must be served from cache');
});

test('GET /api/aqi returns 502 with a safe message when every provider fails', async () => {
  handler = () => new Response('boom', { status: 500 });
  const res = await realFetch(`${base}/api/aqi?lat=10.5&lon=76.2`);
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.ok(!text.includes('Open-Meteo AQI HTTP'), 'upstream error details must not leak');
});

test('GET /api/aqi falls back to WAQI when Open-Meteo fails and a key exists', async () => {
  process.env.WAQI_API_KEY = 'test-token-not-real';
  handler = (url) =>
    url.includes('api.waqi.info')
      ? json({
          status: 'ok',
          data: { aqi: 210, iaqi: { pm25: { v: 150 } }, time: { iso: '2026-11-20T08:00:00Z' } },
        })
      : new Response('down', { status: 503 });
  const res = await realFetch(`${base}/api/aqi?lat=13.08&lon=80.27&city=Chennai`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { aqi: number; fallbackUsed: boolean; source: string };
  assert.equal(body.aqi, 210);
  assert.equal(body.fallbackUsed, true);
  assert.match(body.source, /WAQI/);
});

test('GET /api/weather maps Open-Meteo data and labels the condition', async () => {
  handler = () =>
    json({
      current: {
        temperature_2m: 31.26,
        relative_humidity_2m: 40,
        wind_speed_10m: 9.5,
        wind_direction_10m: 270,
        weather_code: 45,
      },
      daily: {
        time: ['2026-11-20', '2026-11-21'],
        temperature_2m_max: [33, 34],
        temperature_2m_min: [20, 21],
        precipitation_probability_max: [5, 10],
        wind_speed_10m_max: [14, 16],
        weather_code: [45, 1],
        uv_index_max: [6.4, 7],
      },
    });
  const res = await realFetch(`${base}/api/weather?lat=22.57&lon=88.36`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    temperature: number;
    conditionLabel: string;
    uvIndex: number;
    forecast: unknown[];
  };
  assert.equal(body.temperature, 31.3);
  assert.equal(body.conditionLabel, 'Haze / Fog');
  assert.equal(body.uvIndex, 6.4);
  assert.equal(body.forecast.length, 2);
});

test('GET /api/weather returns 502 when the provider is down', async () => {
  const res = await realFetch(`${base}/api/weather?lat=17.38&lon=78.48`);
  assert.equal(res.status, 502);
});

test('GET /api/fires parses NASA FIRMS CSV hotspots when configured', async () => {
  process.env.NASA_FIRMS_API_KEY = 'firms-test-key';
  const csv = [
    'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence',
    '30.12,75.45,338.4,0.4,0.4,2026-11-20,0815,N,VIIRS,high',
  ].join('\n');
  handler = () => new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv' } });

  const res = await realFetch(`${base}/api/fires?lat=30.10&lon=75.40`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    alerts: Array<{ title: string; source: string; confidence: string }>;
    nearbyCount: number;
    firmsKeyConfigured: boolean;
  };
  assert.equal(body.firmsKeyConfigured, true);
  assert.equal(body.nearbyCount, 1);
  assert.equal(body.alerts[0].source, 'NASA FIRMS VIIRS');
  assert.match(body.alerts[0].title, /338K/);
});

test('GET /api/fires converts NASA EONET events into sorted nearby alerts', async () => {
  handler = () =>
    json({
      events: [
        {
          id: 'far',
          title: 'Far fire',
          geometry: [{ date: '2026-11-19T00:00:00Z', coordinates: [90.0, 25.0] }],
        },
        {
          id: 'near',
          title: 'Near fire',
          link: 'https://example.test/e',
          geometry: [{ date: '2026-11-19T00:00:00Z', coordinates: [77.7, 27.6] }],
        },
        { id: 'nogeo', title: 'No geometry' },
      ],
    });
  const res = await realFetch(`${base}/api/fires?lat=27.49&lon=77.67`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    alerts: Array<{ id: string; distanceKm: number }>;
    nearbyCount: number;
  };
  assert.deepEqual(
    body.alerts.map((a) => a.id),
    ['near', 'far'],
  );
  assert.equal(body.nearbyCount, 1);
  assert.ok(body.alerts[0].distanceKm < body.alerts[1].distanceKm);
});

test('GET /api/fires returns 502 when NASA is unreachable', async () => {
  handler = () => {
    throw new Error('network down');
  };
  const res = await realFetch(`${base}/api/fires?lat=8.52&lon=76.94`);
  assert.equal(res.status, 502);
});

test('GET /api/geocode returns the built-in city list for short queries', async () => {
  const res = await realFetch(`${base}/api/geocode?q=a`);
  const body = (await res.json()) as { results: unknown[] };
  assert.equal(res.status, 200);
  assert.equal(body.results.length, 6);
  assert.equal(upstreamCalls.length, 0);
});

test('GET /api/geocode maps Nominatim results and caches them', async () => {
  handler = () =>
    json([{ display_name: 'Mathura, Uttar Pradesh, India', lat: '27.4924', lon: '77.6737' }]);
  const url = `${base}/api/geocode?q=Mathura`;
  const res = await realFetch(url);
  const body = (await res.json()) as {
    results: Array<{ name: string; state: string; latitude: number }>;
  };
  assert.equal(body.results[0].name, 'Mathura');
  assert.match(body.results[0].state, /Uttar Pradesh/);
  assert.equal(body.results[0].latitude, 27.4924);
  await realFetch(url);
  assert.equal(upstreamCalls.length, 1, 'repeat search must come from cache');
});

test('GET /api/geocode falls back to the local city directory when Nominatim fails', async () => {
  handler = () => new Response('nope', { status: 500 });
  const res = await realFetch(`${base}/api/geocode?q=Delhi`);
  const body = (await res.json()) as { results: Array<{ source: string }> };
  assert.equal(res.status, 200);
  assert.ok(body.results.length >= 1);
  assert.equal(body.results[0].source, 'Indian Cities Directory');
});
