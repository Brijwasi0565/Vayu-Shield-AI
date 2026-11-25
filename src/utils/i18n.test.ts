import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGUAGES, getRegionalHealthTip, t } from './i18n';
import type { LanguageCode } from '../types/env';

test('all 7 supported languages are listed with unique codes', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 7);
  assert.equal(new Set(SUPPORTED_LANGUAGES.map((l) => l.code)).size, 7);
});

test('every language provides every English translation key', () => {
  const englishKeys = Object.keys(t('en')).sort();
  for (const { code } of SUPPORTED_LANGUAGES) {
    assert.deepEqual(Object.keys(t(code)).sort(), englishKeys, `${code} is missing keys`);
  }
});

test('no translation is empty and non-Devanagari scripts never leak Devanagari characters', () => {
  for (const { code } of SUPPORTED_LANGUAGES) {
    for (const [key, value] of Object.entries(t(code))) {
      assert.ok(String(value).trim().length > 0, `${code}.${key} is empty`);
      if (code === 'gu' || code === 'ta' || code === 'te' || code === 'bn') {
        assert.ok(
          !/[\u0900-\u097F]/.test(String(value)),
          `Stray Devanagari script detected in ${code}.${key}: ${value}`,
        );
      }
    }
  }
});

test('unknown language codes fall back to English', () => {
  assert.deepEqual(t('xx' as LanguageCode), t('en'));
});

test('regional tips are localized and distinct for every language and city type', () => {
  for (const { code } of SUPPORTED_LANGUAGES) {
    const tips = ['New Delhi', 'Mumbai', 'Bengaluru'].map((city) =>
      getRegionalHealthTip(city, code),
    );
    for (const tip of tips) {
      assert.ok(tip.length > 10, `${code} tip too short: ${tip}`);
    }
    assert.equal(new Set(tips).size, 3, `${code} should return distinct regional tips per zone`);
    if (code !== 'en' && code !== 'hi') {
      assert.notEqual(
        tips[0],
        getRegionalHealthTip('New Delhi', 'en'),
        `${code} regional tip must be translated`,
      );
    }
  }
});
