import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KilnovaRagEngine } from './src/rag/vectorEngine';
import { attachKilnovaLiveVoiceServer, GEMINI_LIVE_MODEL } from './src/voice/liveVoiceBridge';
import type { AssistantLanguage, HistoricalIncidentRecord, KnowledgeCollection } from './src/rag/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const VALID_COLLECTIONS: ReadonlySet<string> = new Set([
  'technical_docs',
  'equipment_registry',
  'demo_incidents',
  'procedures',
]);

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'VERIFIED',
  'PENDING PLANT VALIDATION',
  'PROTOTYPE CONFIGURED',
  'DEMONSTRATION DATA',
]);

const VALID_SEVERITIES: ReadonlySet<string> = new Set(['WARNING', 'CRITICAL', 'EMERGENCY']);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const ragEngine = new KilnovaRagEngine(process.env.GEMINI_API_KEY);
  void ragEngine.ensureEmbeddings().catch(() => {});

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'kilnova-scada-rag',
      documents: ragEngine.getDocuments().length,
      incidents: ragEngine.getIncidents().length,
      parameters: ragEngine.getParameters().length,
      chunks: ragEngine.getChunkCount(),
      configuredShellLimitC: 370,
      voiceLiveModel: GEMINI_LIVE_MODEL,
      voiceWsPath: '/api/voice/live',
    });
  });

  // Equipment & Process Parameter Registry (Handwritten notes + SCAEK problem statement)
  app.get('/api/parameters', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    let list = ragEngine.getParameters();
    if (category && category !== 'all') {
      list = list.filter((p) => p.category === category);
    }
    if (q) {
      list = list.filter(
        (p) =>
          p.parameterName.toLowerCase().includes(q) ||
          p.equipment.toLowerCase().includes(q) ||
          p.value.toLowerCase().includes(q) ||
          p.operationalSignificance.toLowerCase().includes(q)
      );
    }
    res.json({ parameters: list, total: list.length });
  });

  // RAG Technical Documents
  app.get('/api/rag/documents', (_req, res) => {
    res.json({ documents: ragEngine.getDocuments() });
  });

  app.post('/api/rag/documents', async (req, res) => {
    try {
      const { title, section, source, collection, verificationStatus, content } = req.body ?? {};
      if (
        typeof title !== 'string' ||
        title.trim().length < 3 ||
        title.trim().length > 200 ||
        typeof section !== 'string' ||
        section.trim().length < 2 ||
        section.trim().length > 120 ||
        typeof source !== 'string' ||
        source.trim().length < 2 ||
        source.trim().length > 160 ||
        typeof content !== 'string' ||
        content.trim().length < 20 ||
        content.trim().length > 12000
      ) {
        return res.status(400).json({
          error: 'Invalid document payload. Provide valid title, section, source, and content (20–12,000 chars).',
        });
      }

      const safeCollection: KnowledgeCollection = VALID_COLLECTIONS.has(collection)
        ? collection
        : 'technical_docs';
      const safeStatus = VALID_STATUSES.has(verificationStatus)
        ? verificationStatus
        : 'PENDING PLANT VALIDATION';

      const doc = await ragEngine.addDocument({
        title,
        section,
        source,
        collection: safeCollection,
        verificationStatus: safeStatus,
        content,
      });
      res.status(201).json({ document: doc, chunks: ragEngine.getChunkCount() });
    } catch (err) {
      console.error('Failed to add RAG document:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to ingest document.',
      });
    }
  });

  // RAG Historical / Demonstration Incidents
  app.get('/api/rag/incidents', (_req, res) => {
    res.json({ incidents: ragEngine.getIncidents() });
  });

  app.post('/api/rag/incidents', async (req, res) => {
    try {
      const body = req.body ?? {};
      const {
        case_id,
        date,
        severity,
        problem,
        context,
        action_taken,
        result_30_min,
        result_60_min,
        tags,
        dataOrigin,
      } = body;

      if (
        typeof case_id !== 'string' ||
        !/^[A-Z0-9-]{4,40}$/i.test(case_id.trim()) ||
        typeof date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ||
        !VALID_SEVERITIES.has(severity) ||
        typeof problem !== 'string' ||
        problem.trim().length < 5 ||
        typeof context !== 'string' ||
        context.trim().length < 10 ||
        typeof action_taken !== 'string' ||
        action_taken.trim().length < 10 ||
        typeof result_30_min !== 'string' ||
        result_30_min.trim().length < 3 ||
        typeof result_60_min !== 'string' ||
        result_60_min.trim().length < 3
      ) {
        return res.status(400).json({
          error:
            'Invalid incident payload. Required: case_id (e.g. CAS-2026-112), date (YYYY-MM-DD), severity, problem, context, action_taken, result_30_min, result_60_min.',
        });
      }

      const cleanTags = Array.isArray(tags)
        ? tags
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 8)
        : ['Kiln'];

      const record: HistoricalIncidentRecord = {
        case_id: case_id.trim().toUpperCase(),
        date: date.trim(),
        severity,
        problem: problem.trim().slice(0, 300),
        context: context.trim().slice(0, 2000),
        action_taken: action_taken.trim().slice(0, 2000),
        result_30_min: result_30_min.trim().slice(0, 400),
        result_60_min: result_60_min.trim().slice(0, 400),
        tags: cleanTags.length > 0 ? cleanTags : ['Kiln'],
        dataOrigin: dataOrigin === 'DEMONSTRATION DATA' ? 'DEMONSTRATION DATA' : 'USER SUBMITTED LOG',
      };

      const saved = await ragEngine.addIncident(record);
      res.status(201).json({ incident: saved, chunks: ragEngine.getChunkCount() });
    } catch (err) {
      console.error('Failed to add incident record:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to store incident.',
      });
    }
  });

  // Main RAG Query Endpoint (AI Supervisor Agent)
  app.post('/api/rag/query', async (req, res) => {
    try {
      const { question, collectionFilter, preferredLanguage, operationalContext } = req.body ?? {};
      if (typeof question !== 'string' || question.trim().length < 2 || question.trim().length > 1500) {
        return res.status(400).json({
          error: 'Please enter a valid question (2–1,500 characters).',
        });
      }

      const safeFilter =
        collectionFilter === 'all' || VALID_COLLECTIONS.has(collectionFilter)
          ? collectionFilter
          : 'all';

      const safeLanguage: AssistantLanguage =
        preferredLanguage === 'en' || preferredLanguage === 'fr' || preferredLanguage === 'ar'
          ? preferredLanguage
          : 'auto';

      const result = await ragEngine.query({
        question: question.trim(),
        collectionFilter: safeFilter,
        preferredLanguage: safeLanguage,
        operationalContext:
          operationalContext && typeof operationalContext === 'object'
            ? operationalContext
            : undefined,
      });

      res.json(result);
    } catch (err) {
      console.error('RAG query failed:', err);
      const message = err instanceof Error ? err.message : 'AI Supervisor Agent query failed.';
      res.status(502).json({ error: message });
    }
  });

  // Frontend mounting: Vite middleware in development, static dist in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachKilnovaLiveVoiceServer(httpServer, ragEngine, process.env.GEMINI_API_KEY);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `KILNOVA Industrial Intelligence server running on http://0.0.0.0:${PORT} (Voice Live: /api/voice/live · ${GEMINI_LIVE_MODEL})`
    );
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
