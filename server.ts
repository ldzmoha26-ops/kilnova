import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKilnovaApiApp } from './src/server/createKilnovaApiApp.ts';
import { attachKilnovaLiveVoiceServer, GEMINI_LIVE_MODEL } from './src/voice/liveVoiceBridge.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const { app, ragEngine } = createKilnovaApiApp({ isServerless: false });

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
