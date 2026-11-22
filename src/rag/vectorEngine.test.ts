import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KilnovaRagEngine,
  chunkText,
  cosineSimilarity,
  lexicalScore,
} from './vectorEngine';

test('chunkText splits long documents with overlap and preserves non-empty chunks', () => {
  const longText = Array.from({ length: 40 }, (_, i) => `Sentence ${i + 1} regarding SCAEK kiln burning zone and 370 C limit.`).join(' ');
  const chunks = chunkText(longText, 300, 60);
  assert.ok(chunks.length >= 3, `Expected >= 3 chunks, got ${chunks.length}`);
  for (const ch of chunks) {
    assert.ok(ch.length > 0);
  }
});

test('cosineSimilarity handles identical, orthogonal, and mismatched vectors', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1) < 1e-6);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1]) - 0) < 1e-6);
  assert.equal(cosineSimilarity([1, 2], [1]), 0);
});

test('lexicalScore ranks exact domain matches higher than unrelated text', () => {
  const high = lexicalScore(
    'Ring B-04 shell temperature 412 C exceeds 370 C threshold CAS-2026-081',
    'CAS-2026-081 Ring B-04 shell temperature reached 412 C above 370 C limit'
  );
  const low = lexicalScore(
    'Ring B-04 shell temperature 412 C exceeds 370 C threshold',
    'Grate cooler fan speed optimization in steady state'
  );
  assert.ok(high > low, `Expected high (${high}) > low (${low})`);
});

test('KilnovaRagEngine retrieves CAS-2026-081 as DEMONSTRATION DATA and respects collection filters', () => {
  const engine = new KilnovaRagEngine(undefined); // Offline retrieval test without API calls
  assert.ok(engine.getDocuments().length >= 5);
  assert.equal(engine.getIncidents().length, 3);
  assert.ok(engine.getParameters().length >= 15);

  const incidentHits = engine.retrieveTopChunks(
    'Shell temperature hotspot 412 C CAS-2026-081 cooling fans',
    { collectionFilter: 'demo_incidents', topK: 3 }
  );
  assert.ok(incidentHits.length > 0);
  assert.equal(incidentHits[0].chunk.metadata.case_id, 'CAS-2026-081');
  assert.equal(incidentHits[0].chunk.verificationStatus, 'DEMONSTRATION DATA');
});

test('KilnovaRagEngine retrieves PENDING PLANT VALIDATION equipment parameters', () => {
  const engine = new KilnovaRagEngine(undefined);
  const paramHits = engine.retrieveTopChunks(
    'raw meal feed rate 230 260 t/h kiln diameter 4.6 m length 74 m',
    { collectionFilter: 'equipment_registry', topK: 4 }
  );
  assert.ok(paramHits.length > 0);
  assert.ok(
    paramHits.some((h) => h.chunk.verificationStatus === 'PENDING PLANT VALIDATION'),
    'Expected PENDING PLANT VALIDATION status on preliminary engineering notes'
  );
});

test('KilnovaRagEngine dynamically indexes newly added technical documents and incidents', async () => {
  const engine = new KilnovaRagEngine(undefined);
  const beforeChunks = engine.getChunkCount();

  await engine.addDocument({
    title: 'Custom Cyclone C3 Pressure Drop SOP',
    section: 'SOP-C3',
    source: 'Shift Engineer Note',
    collection: 'procedures',
    verificationStatus: 'PENDING PLANT VALIDATION',
    content:
      'When Cyclone C3 differential pressure exceeds 18 mbar due to alkali buildup, inspect air blasters and verify precalciner draft immediately.',
  });

  await engine.addIncident({
    case_id: 'CAS-2026-199',
    date: '2026-11-22',
    severity: 'CRITICAL',
    problem: 'Cyclone C3 Plugging Warning',
    context: 'Differential pressure rose to 21 mbar during high alkali raw meal feed.',
    action_taken: 'Triggered air cannon sequence and reduced raw feed by 10 t/h.',
    result_30_min: 'Differential pressure dropped to 15 mbar.',
    result_60_min: 'Normal cyclone flow restored.',
    tags: ['Cyclone C3', 'Alkali', 'Plugging'],
    dataOrigin: 'USER SUBMITTED LOG',
  });

  assert.ok(engine.getChunkCount() > beforeChunks);

  const hits = engine.retrieveTopChunks('Cyclone C3 alkali buildup CAS-2026-199', {
    collectionFilter: 'all',
    topK: 4,
  });
  assert.ok(
    hits.some((h) => h.chunk.metadata.case_id === 'CAS-2026-199' || h.chunk.title.includes('Cyclone C3')),
    'Expected newly ingested doc/incident to be immediately retrievable'
  );
});
