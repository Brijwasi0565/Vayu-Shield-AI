import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDailyExposure,
  calculateIAQEffectiveness,
  calculateIndianAQI,
  getAQICategoryInfo,
  getDominantPollutant,
  getVentilationWindowAdvice,
} from './aqi';

test('calculateIndianAQI returns accurate CPCB NAQI band values across all pollutants', () => {
  assert.equal(calculateIndianAQI({ pm25: 15, pm10: 25, no2: 20, o3: 25 }), 25);
  assert.equal(calculateIndianAQI({ pm25: 60, pm10: 90, no2: 40, o3: 50 }), 100);
  const severe = calculateIndianAQI({ pm25: 185, pm10: 280, no2: 65, o3: 45 });
  assert.ok(severe >= 301 && severe <= 400, `Expected 301-400, got ${severe}`);

  // SO2 and CO CPCB sub-indices (CO passed in ug/m3 from Open-Meteo -> mg/m3)
  const so2Driven = calculateIndianAQI({ pm25: 10, pm10: 20, no2: 15, o3: 20, so2: 400, co: 400 });
  assert.ok(so2Driven >= 200, `Expected SO2-driven AQI >= 200, got ${so2Driven}`);

  const coDriven = calculateIndianAQI({ pm25: 10, pm10: 20, no2: 15, o3: 20, so2: 10, co: 15000 });
  assert.ok(coDriven >= 250, `Expected CO-driven AQI >= 250, got ${coDriven}`);
});

test('getDominantPollutant identifies the highest CPCB sub-index pollutant', () => {
  assert.equal(getDominantPollutant({ pm25: 180, pm10: 100, no2: 20, o3: 30 }), 'PM2.5');
  assert.equal(getDominantPollutant({ pm25: 15, pm10: 260, no2: 20, o3: 30 }), 'PM10');
  assert.equal(getDominantPollutant({ pm25: 15, pm10: 25, no2: 190, o3: 20 }), 'NO2');
  assert.equal(getDominantPollutant({ pm25: 15, pm10: 25, no2: 20, o3: 180 }), 'O3');
  assert.equal(getDominantPollutant({ pm25: 10, pm10: 20, no2: 10, o3: 15, so2: 600 }), 'SO2');
  assert.equal(getDominantPollutant({ pm25: 10, pm10: 20, no2: 10, o3: 15, co: 20000 }), 'CO');
});

test('getAQICategoryInfo flags emergency mode above 300 and covers all bands', () => {
  assert.equal(getAQICategoryInfo(45).emergency, false);
  assert.equal(getAQICategoryInfo(85).category, 'Moderate');
  assert.equal(getAQICategoryInfo(180).category, 'Unhealthy for Sensitive Groups');
  assert.equal(getAQICategoryInfo(240).category, 'Unhealthy');
  assert.equal(getAQICategoryInfo(320).emergency, true);
  assert.equal(getAQICategoryInfo(320).category, 'Very Unhealthy');
  assert.equal(getAQICategoryInfo(430).category, 'Hazardous');
});

test('calculateDailyExposure computes exposure dose across all risk tiers', () => {
  const low = calculateDailyExposure(30, 60);
  assert.equal(low.exposureUnits, 30);
  assert.equal(low.riskLevel, 'Low');

  const mod = calculateDailyExposure(60, 120);
  assert.equal(mod.exposureUnits, 120);
  assert.equal(mod.riskLevel, 'Moderate');

  const high = calculateDailyExposure(120, 220);
  assert.equal(high.exposureUnits, 440);
  assert.equal(high.riskLevel, 'High');

  const critical = calculateDailyExposure(180, 320);
  assert.equal(critical.riskLevel, 'Critical');
});

test('calculateIAQEffectiveness evaluates undersized, moderate, and optimal ACH setups', () => {
  const optimal = calculateIAQEffectiveness(150, 9, 300, 260);
  assert.ok(optimal.ach > 4.8, `Expected ACH > 4.8, got ${optimal.ach}`);
  assert.ok(optimal.estimatedIndoorAqi < 80);
  assert.match(optimal.verdict, /Hospital-grade/);

  const moderate = calculateIAQEffectiveness(200, 10, 220, 260);
  assert.match(moderate.verdict, /Strong residential/);

  const undersized = calculateIAQEffectiveness(450, 12, 120, 300);
  assert.match(undersized.verdict, /Under-sized/);
});

test('getVentilationWindowAdvice handles empty data, clean-open windows, and high-AQI closure', () => {
  const empty = getVentilationWindowAdvice([], 8);
  assert.equal(empty.shouldOpenWindowsNow, false);
  assert.equal(empty.bestWindowLabel, '14:00 – 16:00');

  const cleanOpen = getVentilationWindowAdvice(
    [
      { time: '2026-11-19T13:00', aqi: 75, pm25: 25 },
      { time: '2026-11-19T14:00', aqi: 80, pm25: 28 },
    ],
    14,
  );
  assert.equal(cleanOpen.shouldOpenWindowsNow, true);
  assert.match(cleanOpen.reason, /cross-ventilation/);

  const hourly = [
    { time: '2026-11-19T06:00', aqi: 240, pm25: 120 },
    { time: '2026-11-19T07:00', aqi: 220, pm25: 110 },
    { time: '2026-11-19T14:00', aqi: 135, pm25: 68 },
    { time: '2026-11-19T15:00', aqi: 140, pm25: 70 },
  ];
  const advice = getVentilationWindowAdvice(hourly, 4);
  assert.equal(advice.bestWindowLabel, '14:00 – 15:00');
  assert.equal(advice.shouldOpenWindowsNow, false);
  assert.match(advice.reason, /Keep windows sealed/);
});

test('haversineDistanceKm measures real city distances', async () => {
  const { haversineDistanceKm } = await import('./aqi');
  assert.equal(haversineDistanceKm(28.6139, 77.209, 28.6139, 77.209), 0);
  const delhiMumbai = haversineDistanceKm(28.6139, 77.209, 19.076, 72.8777);
  assert.ok(delhiMumbai > 1100 && delhiMumbai < 1200, `got ${delhiMumbai}`);
});

test('INDIAN_CITIES has valid coordinates inside India', async () => {
  const { INDIAN_CITIES } = await import('./aqi');
  assert.ok(INDIAN_CITIES.length >= 10);
  for (const c of INDIAN_CITIES) {
    assert.ok(c.latitude > 6 && c.latitude < 38, `${c.name} latitude`);
    assert.ok(c.longitude > 68 && c.longitude < 98, `${c.name} longitude`);
  }
});

test('calculateIndianAQI handles missing pollutant readings safely', () => {
  assert.equal(calculateIndianAQI({ pm25: null, pm10: null, no2: null, o3: null }), 0);
});
