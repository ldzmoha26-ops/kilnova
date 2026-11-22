import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COPY_BY_LOCALE,
  GICA_PALETTE,
  THREE_THEME_PALETTES,
  getDirectionForLocale,
  getInitialVersionFromSearch,
} from './themeConfig';

test('GICA_PALETTE preserves verified brand blue and separates brand from operational status colors', () => {
  assert.equal(GICA_PALETTE.brandBlue, '#04375D');
  assert.equal(GICA_PALETTE.darkBg, '#051A2A');
  assert.equal(GICA_PALETTE.darkSurface, '#072840');
  assert.equal(GICA_PALETTE.darkBorder, '#1F4E73');
  assert.equal(GICA_PALETTE.lightBg, '#FFFFFF');
  assert.equal(GICA_PALETTE.lightSurface, '#F3F6F9');
  assert.equal(GICA_PALETTE.dataCyan, '#36C5D8');

  // Brand blue must never be reused as a status color
  const statusColors: string[] = [
    GICA_PALETTE.statusNormal,
    GICA_PALETTE.statusWarning,
    GICA_PALETTE.statusCritical,
    GICA_PALETTE.statusEmergency,
    GICA_PALETTE.statusOffline,
  ];
  assert.ok(!statusColors.includes(GICA_PALETTE.brandBlue));
});

test('getInitialVersionFromSearch resolves query params and defaults to obsidian v1', () => {
  assert.equal(getInitialVersionFromSearch(''), 'obsidian');
  assert.equal(getInitialVersionFromSearch('?version=v1'), 'obsidian');
  assert.equal(getInitialVersionFromSearch('?theme=obsidian'), 'obsidian');
  assert.equal(getInitialVersionFromSearch('?version=v2'), 'gica');
  assert.equal(getInitialVersionFromSearch('?theme=gica'), 'gica');
});

test('getDirectionForLocale returns rtl for Arabic and ltr for English and French', () => {
  assert.equal(getDirectionForLocale('ar'), 'rtl');
  assert.equal(getDirectionForLocale('fr'), 'ltr');
  assert.equal(getDirectionForLocale('en'), 'ltr');
});

test('all three locales define four stages and updated English hero intelligence copy', () => {
  assert.equal(COPY_BY_LOCALE.en.hero.headlineLine1, 'WHERE HEAT');
  assert.equal(COPY_BY_LOCALE.en.hero.headlineLine2, 'MEETS INTELLIGENCE.');
  assert.ok(COPY_BY_LOCALE.en.hero.subtitle.includes('rotary kiln'));
  for (const locale of ['en', 'fr', 'ar'] as const) {
    const copy = COPY_BY_LOCALE[locale];
    assert.equal(copy.hero.stages.length, 4);
    assert.equal(copy.philosophy.pillars.length, 4);
    assert.equal(copy.expertise.profiles.length, 4);
    assert.ok(copy.hero.headlineLine1.length > 0);
  }
});

test('Three.js theme palettes define distinct backgrounds for V1 KILNOVA carbon black and V2 GICA control room', () => {
  assert.equal(THREE_THEME_PALETTES.obsidian.bgHex, 0x0a0c10);
  assert.equal(THREE_THEME_PALETTES.gica.bgHex, 0x051a2a);
  assert.equal(THREE_THEME_PALETTES.gica.rimLightHex, 0x36c5d8);
});
