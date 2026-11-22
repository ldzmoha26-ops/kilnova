import type { IncomingMessage } from 'node:http';
import {
  GoogleGenAI,
  Modality,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'node:http';
import {
  ADVISOR_DISCLAIMER,
  KilnovaRagEngine,
  buildSupervisorSystemInstruction,
} from '../rag/vectorEngine';
import type { AssistantLanguage, KnowledgeCollection } from '../rag/types';

export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';

const VALID_LANGUAGES: ReadonlySet<string> = new Set(['auto', 'en', 'fr', 'ar']);
const VALID_COLLECTIONS: ReadonlySet<string> = new Set([
  'all',
  'technical_docs',
  'equipment_registry',
  'demo_incidents',
  'procedures',
]);

const SEARCH_KILNOVA_RAG_DECLARATION: FunctionDeclaration = {
  name: 'search_kilnova_knowledge_base',
  description:
    'Read-only retrieval from the existing KILNOVA RAG knowledge base (technical reports, official SCAEK problem statement, GEW 2026 guide, handwritten process notes tagged PENDING PLANT VALIDATION, verified equipment registry, and synthetic demonstration incidents CAS-2026-081, CAS-2026-092, CAS-2026-105). Never executes DCS commands.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          'Concise industrial search query (include relevant IDs like 370 C, Ring B-04, CAS-2026-081, PRC-2048, kWh/t, free lime, O2 analyzer, tertiary air, etc.).',
      },
      collection: {
        type: Type.STRING,
        description:
          'Optional collection filter: all, technical_docs, equipment_registry, demo_incidents, or procedures.',
      },
    },
    required: ['query'],
  },
};

interface ClientControlMessage {
  type: 'start' | 'audio' | 'text' | 'interrupt' | 'end';
  data?: string;
  text?: string;
  language?: string;
  collectionFilter?: string;
  operationalContext?: {
    shellMaxTemp?: number;
    burningZoneTemp?: number;
    affectedZone?: string;
    condition?: string;
    flaggedSensors?: number;
  };
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '')
      .toString()
      .split(',')[0]
      .trim()
      .toLowerCase();
    if (!hostHeader) return true;
    if (originHost === hostHeader) return true;
    // Allow local dev loopback pairs
    if (
      (originHost.startsWith('localhost:') || originHost.startsWith('127.0.0.1:')) &&
      (hostHeader.startsWith('localhost:') || hostHeader.startsWith('127.0.0.1:'))
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function attachKilnovaLiveVoiceServer(
  httpServer: HttpServer,
  ragEngine: KilnovaRagEngine,
  apiKey?: string
): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024, // 256 KB frame cap
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = (request.url ?? '').split('?')[0];
    if (pathname !== '/api/voice/live') {
      return;
    }

    if (!isAllowedOrigin(request)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Session | null = null;
    let isClosing = false;
    let pendingToolCalls = 0;
    let activeCollectionFilter: KnowledgeCollection | 'all' = 'all';

    const closeLiveSession = () => {
      if (liveSession) {
        const s = liveSession;
        liveSession = null;
        try {
          s.close();
        } catch {
          // Ignore already-closed live session
        }
      }
    };

    clientWs.on('message', async (rawData) => {
      let msg: ClientControlMessage;
      try {
        const text = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
        msg = JSON.parse(text) as ClientControlMessage;
      } catch {
        sendJson(clientWs, {
          type: 'error',
          code: 'INVALID_FRAME',
          message: 'Malformed voice control frame.',
        });
        return;
      }

      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'start') {
        const key = apiKey ?? process.env.GEMINI_API_KEY;
        if (!key) {
          sendJson(clientWs, {
            type: 'error',
            code: 'MISSING_API_KEY',
            message:
              'Server GEMINI_API_KEY is not configured. Voice session cannot start; text chat remains available once configured.',
          });
          return;
        }

        // Cleanly close any prior session on this socket before opening a new one
        closeLiveSession();

        const preferredLanguage: AssistantLanguage = VALID_LANGUAGES.has(msg.language ?? '')
          ? (msg.language as AssistantLanguage)
          : 'auto';
        activeCollectionFilter = VALID_COLLECTIONS.has(msg.collectionFilter ?? '')
          ? (msg.collectionFilter as KnowledgeCollection | 'all')
          : 'all';

        sendJson(clientWs, {
          type: 'status',
          state: 'connecting',
          model: GEMINI_LIVE_MODEL,
        });

        try {
          const ai = new GoogleGenAI({
            apiKey: key,
            apiVersion: 'v1beta',
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const systemInstruction = buildSupervisorSystemInstruction({
            mode: 'voice',
            preferredLanguage,
            operationalContext: msg.operationalContext,
          });

          let sessionPromise: Promise<Session> | null = null;

          sessionPromise = ai.live.connect({
            model: GEMINI_LIVE_MODEL,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Zephyr',
                  },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              tools: [{ functionDeclarations: [SEARCH_KILNOVA_RAG_DECLARATION] }],
              systemInstruction,
            },
            callbacks: {
              onopen: () => {
                // Wait for sessionPromise setupComplete before marking client connected
              },
              onmessage: (message: LiveServerMessage) => {
                if (isClosing || clientWs.readyState !== WebSocket.OPEN) return;

                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  sendJson(clientWs, {
                    type: 'input_transcript',
                    text: content.inputTranscription.text,
                  });
                }

                if (content?.outputTranscription?.text) {
                  sendJson(clientWs, {
                    type: 'output_transcript',
                    text: content.outputTranscription.text,
                  });
                }

                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendJson(clientWs, {
                      type: 'audio',
                      data: part.inlineData.data,
                      mimeType: part.inlineData.mimeType ?? 'audio/pcm;rate=24000',
                    });
                  }
                }

                if (content?.interrupted) {
                  sendJson(clientWs, { type: 'interrupted' });
                }

                // Handle read-only RAG tool calls using the EXISTING KilnovaRagEngine
                const calls = message.toolCall?.functionCalls ?? [];
                if (calls.length > 0 && sessionPromise) {
                  pendingToolCalls += calls.length;
                  void (async () => {
                    const activeSession = await sessionPromise;
                    const functionResponses = [];

                    try {
                      for (const call of calls) {
                        if (call.name !== 'search_kilnova_knowledge_base') {
                          functionResponses.push({
                            id: call.id,
                            name: call.name ?? 'unknown_tool',
                            response: {
                              error:
                                'Tool rejected: KILNOVA AI Supervisor Agent is strictly advisor-only and read-only.',
                            },
                          });
                          continue;
                        }

                        const rawArgs = (call.args ?? {}) as Record<string, unknown>;
                        const queryText =
                          typeof rawArgs.query === 'string' && rawArgs.query.trim().length > 0
                            ? rawArgs.query.trim().slice(0, 500)
                            : 'kiln shell 370 C threshold and incidents';
                        const requestedCollection =
                          typeof rawArgs.collection === 'string' &&
                          VALID_COLLECTIONS.has(rawArgs.collection)
                            ? (rawArgs.collection as KnowledgeCollection | 'all')
                            : activeCollectionFilter;

                        sendJson(clientWs, {
                          type: 'rag_lookup_started',
                          query: queryText,
                        });

                        try {
                          const retrieved = await ragEngine.retrieveWithCitations(queryText, {
                            topK: 5,
                            collectionFilter: requestedCollection,
                          });

                          sendJson(clientWs, {
                            type: 'rag_citations',
                            query: queryText,
                            citations: retrieved.citations,
                            usedEmbeddings: retrieved.usedEmbeddings,
                          });

                          functionResponses.push({
                            id: call.id,
                            name: call.name,
                            response: {
                              advisorPolicy: ADVISOR_DISCLAIMER,
                              configuredShellLimitC: 370,
                              retrievedCount: retrieved.citations.length,
                              sourcesText: retrieved.contextBlocks,
                              citations: retrieved.citations.map((c) => ({
                                sectionOrCaseId: c.sectionOrCaseId,
                                sourceName: c.sourceName,
                                collection: c.collection,
                                verificationStatus: c.verificationStatus,
                              })),
                            },
                          });
                        } catch (ragErr) {
                          const errMsg =
                            ragErr instanceof Error
                              ? ragErr.message
                              : 'RAG knowledge base lookup failed.';
                          sendJson(clientWs, {
                            type: 'rag_error',
                            message: errMsg,
                          });
                          functionResponses.push({
                            id: call.id,
                            name: call.name,
                            response: {
                              error: `RAG retrieval error: ${errMsg}. Inform the supervisor honestly and do not invent plant facts.`,
                            },
                          });
                        }
                      }

                      if (!isClosing && liveSession) {
                        try {
                          activeSession.sendToolResponse({ functionResponses });
                        } catch (toolSendErr) {
                          console.error('Failed to send Live tool response:', toolSendErr);
                        }
                      }
                    } finally {
                      pendingToolCalls = Math.max(0, pendingToolCalls - calls.length);
                    }
                  })();
                }

                if (content?.turnComplete && pendingToolCalls === 0 && calls.length === 0) {
                  sendJson(clientWs, { type: 'turn_complete' });
                }
              },
              onerror: (errEvent) => {
                if (isClosing) return;
                const detail =
                  errEvent && typeof errEvent === 'object' && 'message' in errEvent
                    ? String((errEvent as { message?: unknown }).message)
                    : 'Gemini Live API stream error.';
                sendJson(clientWs, {
                  type: 'error',
                  code: 'GEMINI_LIVE_ERROR',
                  message: `Gemini Live (${GEMINI_LIVE_MODEL}) error: ${detail}`,
                });
              },
              onclose: (closeEvent) => {
                liveSession = null;
                if (isClosing) return;
                const reason =
                  closeEvent && typeof closeEvent === 'object' && 'reason' in closeEvent
                    ? String((closeEvent as { reason?: unknown }).reason || '')
                    : '';
                const codeNum =
                  closeEvent && typeof closeEvent === 'object' && 'code' in closeEvent
                    ? Number((closeEvent as { code?: unknown }).code || 0)
                    : 0;
                if (codeNum && codeNum !== 1000 && reason) {
                  sendJson(clientWs, {
                    type: 'error',
                    code: 'GEMINI_LIVE_CLOSED',
                    message: `Gemini Live (${GEMINI_LIVE_MODEL}) session closed (${codeNum}): ${reason}`,
                  });
                } else {
                  sendJson(clientWs, {
                    type: 'status',
                    state: 'disconnected',
                    reason: reason || 'Session ended',
                  });
                }
              },
            },
          });

          const resolvedSession = await sessionPromise;
          if (isClosing || clientWs.readyState !== WebSocket.OPEN) {
            try {
              resolvedSession.close();
            } catch {
              // ignore
            }
            return;
          }
          liveSession = resolvedSession;
          sendJson(clientWs, {
            type: 'status',
            state: 'connected',
            model: GEMINI_LIVE_MODEL,
            advisorDisclaimer: ADVISOR_DISCLAIMER,
          });
        } catch (err) {
          liveSession = null;
          const rawMessage = err instanceof Error ? err.message : String(err);
          console.error(`Failed to connect Gemini Live (${GEMINI_LIVE_MODEL}):`, err);
          sendJson(clientWs, {
            type: 'error',
            code: 'GEMINI_LIVE_UNAVAILABLE',
            message: `Unable to start Gemini Live session with model "${GEMINI_LIVE_MODEL}": ${rawMessage}. Text chat remains fully available.`,
          });
        }
        return;
      }

      if (msg.type === 'audio') {
        if (!liveSession || typeof msg.data !== 'string' || msg.data.length === 0) return;
        if (msg.data.length > 200_000) return;
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch (err) {
          console.error('Failed forwarding audio to Gemini Live:', err);
        }
        return;
      }

      if (msg.type === 'text') {
        if (!liveSession || typeof msg.text !== 'string' || !msg.text.trim()) return;
        try {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text.trim().slice(0, 1500) }] }],
            turnComplete: true,
          });
        } catch (err) {
          sendJson(clientWs, {
            type: 'error',
            code: 'SEND_TEXT_FAILED',
            message:
              err instanceof Error ? err.message : 'Unable to send text into active voice session.',
          });
        }
        return;
      }

      if (msg.type === 'interrupt') {
        // Send a brief quiet audio end / activity signal and notify client to flush playback
        sendJson(clientWs, { type: 'interrupted' });
        return;
      }

      if (msg.type === 'end') {
        closeLiveSession();
        sendJson(clientWs, { type: 'status', state: 'disconnected', reason: 'Ended by user' });
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      closeLiveSession();
    });

    clientWs.on('error', () => {
      isClosing = true;
      closeLiveSession();
    });
  });

  return wss;
}
