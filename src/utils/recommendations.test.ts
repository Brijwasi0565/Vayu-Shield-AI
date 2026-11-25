import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDeterministicRecommendations } from './recommendations';
import type { HouseholdMember } from '../types/env';

const sensitiveFamily: HouseholdMember[] = [
  { id: 'm1', name: 'Aarav', ageGroup: 'child', conditions: ['asthma'], activityLevel: 'active' },
  {
    id: 'm2',
    name: 'Dadi',
    ageGroup: 'elderly',
    conditions: ['heart_disease'],
    activityLevel: 'sedentary',
  },
];

const fullRiskHousehold: HouseholdMember[] = [
  ...sensitiveFamily,
  { id: 'm3', name: 'Kavya', ageGroup: 'infant', conditions: [], activityLevel: 'sedentary' },
  {
    id: 'm4',
    name: 'Neha',
    ageGroup: 'adult',
    conditions: ['pregnancy', 'allergies'],
    activityLevel: 'moderate',
  },
];

test('Good AQI produces safe outdoor guidance', () => {
  const rec = generateDeterministicRecommendations({
    currentAQI: 38,
    members: [
      { id: 'm1', name: 'Riya', ageGroup: 'adult', conditions: [], activityLevel: 'active' },
    ],
    timeOfDay: 'morning',
    plannedActivity: 'outdoor_exercise',
  });
  assert.equal(rec.outdoorGuidance, 'safe');
  assert.equal(rec.severityLevel, 'good');
});

test('Sensitive household at AQI 145 triggers avoid guidance and asthma/elderly advice', () => {
  const rec = generateDeterministicRecommendations({
    currentAQI: 145,
    members: sensitiveFamily,
    timeOfDay: 'morning',
    plannedActivity: 'school_drop',
  });
  assert.equal(rec.outdoorGuidance, 'avoid');
  assert.ok(rec.vulnerable.some((v) => v.includes('Asthma/COPD')));
  assert.ok(rec.vulnerable.some((v) => v.includes('Elderly')));
  assert.ok(rec.medication.some((m) => m.includes('inhaler')));
});

test('Moderate AQI with healthy adult returns safe/moderate and afternoon/night routine tips', () => {
  const afternoonErrands = generateDeterministicRecommendations({
    currentAQI: 88,
    members: [
      { id: 'm1', name: 'Amit', ageGroup: 'adult', conditions: [], activityLevel: 'moderate' },
    ],
    timeOfDay: 'afternoon',
    plannedActivity: 'errands',
  });
  assert.equal(afternoonErrands.severityLevel, 'moderate');
  assert.equal(afternoonErrands.outdoorGuidance, 'safe');
  assert.ok(afternoonErrands.routineTips.some((tip) => tip.includes('Afternoon')));

  const nightRest = generateDeterministicRecommendations({
    currentAQI: 115,
    members: fullRiskHousehold,
    timeOfDay: 'night',
    plannedActivity: 'indoor_rest',
  });
  assert.equal(nightRest.outdoorGuidance, 'avoid');
  assert.ok(nightRest.vulnerable.some((v) => v.includes('Infants')));
  assert.ok(nightRest.vulnerable.some((v) => v.includes('Pregnancy')));
  assert.ok(nightRest.medication.some((m) => m.includes('antihistamine')));
  assert.ok(nightRest.routineTips.some((tip) => tip.includes('bedroom')));
});

test('Nearby wildfire alert triggers avoid guidance and smoke sealing even below AQI 300', () => {
  const fireAlert = generateDeterministicRecommendations({
    currentAQI: 210,
    members: sensitiveFamily,
    timeOfDay: 'evening',
    plannedActivity: 'outdoor_exercise',
    nearbyFireCount: 1,
  });
  assert.equal(fireAlert.severityLevel, 'unhealthy');
  assert.equal(fireAlert.outdoorGuidance, 'avoid');
  assert.ok(fireAlert.overall.includes('Smoke plume alert'));
});

test('Hazardous AQI > 300 triggers strict sealing and N95/N99 mask rules', () => {
  const rec = generateDeterministicRecommendations({
    currentAQI: 340,
    members: sensitiveFamily,
    timeOfDay: 'evening',
    plannedActivity: 'commute',
    nearbyFireCount: 2,
  });
  assert.equal(rec.outdoorGuidance, 'avoid');
  assert.ok(rec.mask.includes('N95') || rec.mask.includes('N99'));
  assert.ok(rec.ventilation.toLowerCase().includes('sealed'));
});
