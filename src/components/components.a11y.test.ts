import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmergencyModal } from './EmergencyModal';
import { ErrorBoundary } from './ErrorBoundary';
import { HouseholdHealthHub } from './HouseholdHealthHub';
import { OverviewDashboard } from './OverviewDashboard';
import { INDIAN_CITIES } from '../utils/aqi';
import type { AQIResponse, ChallengeItem, HouseholdProfile } from '../types/env';

const sampleHousehold: HouseholdProfile = {
  id: 'hh_1',
  name: 'Test Family',
  location: 'New Delhi',
  latitude: 28.6139,
  longitude: 77.209,
  members: [
    {
      id: 'm1',
      name: 'Aarav',
      ageGroup: 'child',
      conditions: ['asthma'],
      activityLevel: 'active',
    },
  ],
  createdAt: '2026-11-20T00:00:00Z',
  updatedAt: '2026-11-20T00:00:00Z',
};

const sampleAqi: AQIResponse = {
  location: 'New Delhi',
  latitude: 28.6139,
  longitude: 77.209,
  aqi: 345,
  category: 'Very Unhealthy',
  dominantPollutant: 'PM2.5',
  pollutants: { pm25: 180, pm10: 290, no2: 45, o3: 32 },
  pollenStatus: 'Coming Soon',
  source: 'Open-Meteo Air Quality',
  fallbackUsed: false,
  timestamp: '2026-11-20T08:00:00Z',
  forecast: [
    { date: '2026-11-20', aqi: 345, category: 'Very Unhealthy', pm25Max: 180, pm10Max: 290 },
  ],
  hourly: [{ time: '2026-11-20T14:00', aqi: 190, pm25: 85 }],
};

const sampleChallenges: ChallengeItem[] = [
  {
    id: 'c1',
    challengeKey: 'indoor_7d',
    title: 'Indoor Streak',
    description: 'Stay indoors on hazardous smog days.',
    points: 100,
    progress: 3,
    target: 7,
    completed: false,
    badgeName: 'Clean Lung',
  },
];

test('OverviewDashboard renders live telemetry, dominant pollutant, and escaped XSS-safe strings', () => {
  const html = renderToStaticMarkup(
    React.createElement(OverviewDashboard, {
      aqi: sampleAqi,
      weather: {
        latitude: 28.6139,
        longitude: 77.209,
        temperature: 26.4,
        humidity: 48,
        windSpeed: 9,
        windDirection: 280,
        uvIndex: 5,
        weatherCode: 45,
        conditionLabel: 'Haze / Fog',
        source: 'Open-Meteo Weather API',
        timestamp: '2026-11-20T08:00:00Z',
        forecast: [],
      },
      fires: {
        alerts: [],
        nearbyCount: 0,
        source: 'NASA EONET',
        timestamp: '2026-11-20T08:00:00Z',
        firmsKeyConfigured: false,
      },
      loading: false,
      error: null,
      selectedCity: INDIAN_CITIES[0],
      onSelectCity: () => undefined,
      onDetectGPS: () => undefined,
      onRefresh: () => undefined,
      activeHousehold: { ...sampleHousehold, name: '<script>alert(1)</script>' },
      language: 'en',
      hasCalendarAuth: false,
      onScheduleRoutineEvent: async () => undefined,
      onOpenEmergency: () => undefined,
    }),
  );

  assert.ok(html.includes('345'));
  assert.ok(html.includes('Dominant: PM2.5'));
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag must be escaped');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('EmergencyModal renders accessible dialog semantics and checkbox controls when open', () => {
  const closedHtml = renderToStaticMarkup(
    React.createElement(EmergencyModal, {
      open: false,
      onClose: () => undefined,
      aqi: 345,
      city: 'New Delhi',
      fires: null,
      onFindShelters: () => undefined,
    }),
  );
  assert.equal(closedHtml, '');

  const openHtml = renderToStaticMarkup(
    React.createElement(EmergencyModal, {
      open: true,
      onClose: () => undefined,
      aqi: 345,
      city: 'New Delhi',
      fires: {
        alerts: [],
        nearbyCount: 2,
        source: 'NASA',
        timestamp: '2026-11-20T08:00:00Z',
        firmsKeyConfigured: false,
      },
      onFindShelters: () => undefined,
    }),
  );
  assert.ok(openHtml.includes('role="dialog"'));
  assert.ok(openHtml.includes('aria-modal="true"'));
  assert.ok(openHtml.includes('aria-labelledby="emergency-modal-title"'));
  assert.ok(openHtml.includes('role="checkbox"'));
  assert.ok(openHtml.includes('tel:112'));
});

test('HouseholdHealthHub exposes WAI-ARIA tablist and tabpanel roles', () => {
  const html = renderToStaticMarkup(
    React.createElement(HouseholdHealthHub, {
      households: [sampleHousehold],
      activeHouseholdId: sampleHousehold.id,
      onSelectHousehold: () => undefined,
      onSaveHousehold: async () => undefined,
      onDeleteHousehold: async () => undefined,
      symptoms: [],
      onAddSymptom: async () => undefined,
      challenges: sampleChallenges,
      onIncrementChallenge: async () => undefined,
      aqi: sampleAqi,
      windSpeedKmh: 8,
      language: 'en',
      hasCalendarAuth: false,
      calendarEvents: [],
      onScheduleDoctorVisit: async () => undefined,
    }),
  );
  assert.ok(html.includes('role="tablist"'));
  assert.ok(html.includes('role="tab"'));
  assert.ok(html.includes('aria-selected="true"'));
  assert.ok(html.includes('role="tabpanel"'));
  assert.ok(html.includes('Test Family'));
});

test('ErrorBoundary renders children when healthy and alert fallback UI on error state', () => {
  const okHtml = renderToStaticMarkup(
    React.createElement(ErrorBoundary, null, React.createElement('p', null, 'Healthy child')),
  );
  assert.ok(okHtml.includes('Healthy child'));

  const boundary = new ErrorBoundary({ children: null });
  boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('Fatal boom'));
  const errHtml = renderToStaticMarkup(boundary.render() as React.ReactElement);
  assert.ok(errHtml.includes('role="alert"'));
  assert.ok(errHtml.includes('Fatal boom'));
});

test('Health subcomponents render accessible forms, IAQ metrics, and ARIA progressbars', async () => {
  const { ChallengesTab } = await import('./health/ChallengesTab');
  const { IAQToolsTab } = await import('./health/IAQToolsTab');
  const { SymptomTrackerTab } = await import('./health/SymptomTrackerTab');

  const challengesHtml = renderToStaticMarkup(
    React.createElement(ChallengesTab, {
      challenges: sampleChallenges,
      onIncrementChallenge: async () => undefined,
    }),
  );
  assert.ok(challengesHtml.includes('role="progressbar"'));
  assert.ok(challengesHtml.includes('aria-valuenow="3"'));
  assert.ok(challengesHtml.includes('aria-valuemax="7"'));

  const iaqHtml = renderToStaticMarkup(
    React.createElement(IAQToolsTab, {
      aqi: sampleAqi,
      currentAqi: 345,
      windSpeedKmh: 8,
    }),
  );
  assert.ok(iaqHtml.includes('Air Purifier CADR'));
  assert.ok(iaqHtml.includes('Snake Plant'));

  const symptomHtml = renderToStaticMarkup(
    React.createElement(SymptomTrackerTab, {
      activeHousehold: sampleHousehold,
      symptoms: [
        {
          id: 's1',
          type: 'cough',
          severity: 3,
          aqiAtTime: 220,
          outdoorMinutes: 45,
          createdAt: '2026-11-20T08:00:00Z',
        },
      ],
      currentAqi: 220,
      hasCalendarAuth: false,
      calendarEvents: [],
      onAddSymptom: async () => undefined,
      onScheduleDoctorVisit: async () => undefined,
    }),
  );
  assert.ok(symptomHtml.includes('Daily Exposure &amp; Symptom Logger'));
  assert.ok(symptomHtml.includes('Export CSV'));
  assert.ok(symptomHtml.includes('aria-label="Doctor appointment title"'));
});
