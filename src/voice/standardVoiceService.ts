import { GoogleGenAI } from '@google/genai';
import type { KilnovaRagEngine } from '../rag/vectorEngine.ts';
import type { AssistantLanguage, KnowledgeCollection, RagCitation } from '../rag/types.ts';

export const GEMINI_STT_MODEL = 'gemini-3.5-transcribe';
export const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';

export const ALLOWED_AUDIO_MIME_TYPES: ReadonlySet<string> = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
]);

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB decoded audio cap

export interface StandardVoiceTurnInput {
  audioBase64: string;
  mimeType: string;
  preferredLanguage?: AssistantLanguage;
  collectionFilter?: KnowledgeCollection | 'all';
  operationalContext?: {
    shellMaxTemp?: number;
    burningZoneTemp?: number;
    affectedZone?: string;
    condition?: string;
    flaggedSensors?: number;
  };
}

export interface StandardVoiceTurnResult {
  transcript: string;
  answer: string;
  citations: RagCitation[];
  usedEmbeddings: boolean;
  advisorDisclaimer: string;
  ragModel: string;
  sttModel: string;
  ttsModel: string;
  audioBase64: string | null;
  audioMimeType: string | null;
  ttsWarning?: string;
}

/**
 * Normalizes a browser MediaRecorder MIME string (e.g. "audio/webm;codecs=opus")
 * to its base IANA audio MIME type and validates against our strict allowlist.
 */
export function normalizeAudioMimeType(rawMimeType: string): string | null {
  if (typeof rawMimeType !== 'string') return null;
  const base = rawMimeType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO_MIME_TYPES.has(base)) {
    return null;
  }
  return base === 'audio/x-wav' ? 'audio/wav' : base;
}

/**
 * Strips markdown formatting and trims excessively long RAG answers into crisp,
 * natural industrial speech for TTS while keeping all numbers, IDs, and 370 °C intact.
 */
export function prepareTextForSpeech(markdownText: string, maxChars = 900): string {
  const cleaned = markdownText
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxChars) return cleaned;
  const slice = cleaned.slice(0, maxChars);
  const lastPeriod = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('؟ '), slice.lastIndexOf('! '));
  return lastPeriod > maxChars * 0.55 ? slice.slice(0, lastPeriod + 1).trim() : `${slice.trim()}...`;
}

function buildTranscribePrompt(preferredLanguage: AssistantLanguage): string {
  if (preferredLanguage === 'fr') {
    return 'Transcribe this spoken cement kiln operator/supervisor audio verbatim in French. Preserve technical IDs like CAS-2026-081, PRC-2048, Ring B-04, and 370 °C. Return only the transcript text with no commentary.';
  }
  if (preferredLanguage === 'ar') {
    return 'Transcribe this spoken cement kiln operator/supervisor audio verbatim in Arabic. Preserve technical IDs like CAS-2026-081, PRC-2048, Ring B-04, and 370 °C. Return only the transcript text with no commentary.';
  }
  if (preferredLanguage === 'en') {
    return 'Transcribe this spoken cement kiln operator/supervisor audio verbatim in English. Preserve technical IDs like CAS-2026-081, PRC-2048, Ring B-04, and 370 °C. Return only the transcript text with no commentary.';
  }
  return 'Transcribe this spoken cement kiln operator/supervisor audio verbatim in its original language (English, French, or Arabic). Preserve technical IDs like CAS-2026-081, PRC-2048, Ring B-04, and 370 °C. Return only the transcript text with no commentary.';
}

/**
 * Secondary Fallback Voice Pipeline (HTTPS):
 * 1. Speech-to-Text via Gemini (`gemini-3.5-transcribe`)
 * 2. Grounded RAG via EXISTING `KilnovaRagEngine.query(...)` (shared docs, incidents, safety rules)
 * 3. Text-to-Speech via Gemini (`gemini-3.8-flash-lite-tts`, unary 24 kHz WAV)
 */
export async function runStandardVoiceTurn(
  ragEngine: KilnovaRagEngine,
  input: StandardVoiceTurnInput,
  apiKey?: string
): Promise<StandardVoiceTurnResult> {
  const key = apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'Server GEMINI_API_KEY is not configured. Standard Voice fallback cannot process audio.'
    );
  }

  const safeMime = normalizeAudioMimeType(input.mimeType);
  if (!safeMime) {
    throw new Error(
      `Unsupported audio format "${input.mimeType}". Expected webm, mp4, ogg, wav, or mp3.`
    );
  }

  if (typeof input.audioBase64 !== 'string' || input.audioBase64.trim().length < 32) {
    throw new Error('Recorded audio clip was empty. Please speak clearly and try again.');
  }

  const decodedBytes = Buffer.from(input.audioBase64, 'base64');
  if (decodedBytes.byteLength === 0 || decodedBytes.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(
      `Audio recording size (${Math.round(decodedBytes.byteLength / 1024)} KB) exceeds the 5 MB limit or is empty.`
    );
  }

  const preferredLanguage: AssistantLanguage =
    input.preferredLanguage === 'en' ||
    input.preferredLanguage === 'fr' ||
    input.preferredLanguage === 'ar'
      ? input.preferredLanguage
      : 'auto';

  const ai = new GoogleGenAI({
    apiKey: key,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Step 1: Speech-to-Text using official gemini-3.5-transcribe (with multimodal gemini-4-hydrogen fallback on transient 404/503)
  let sttModelUsed = GEMINI_STT_MODEL;
  let sttResponse;
  try {
    sttResponse = await ai.models.generateContent({
      model: GEMINI_STT_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: safeMime,
              data: input.audioBase64,
            },
          },
          {
            text: buildTranscribePrompt(preferredLanguage),
          },
        ],
      },
    });
  } catch (sttErr) {
    console.warn('Primary STT model failed, trying multimodal Gemini fallback:', sttErr);
    sttModelUsed = 'gemini-4-hydrogen';
    sttResponse = await ai.models.generateContent({
      model: sttModelUsed,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: safeMime,
              data: input.audioBase64,
            },
          },
          {
            text: buildTranscribePrompt(preferredLanguage),
          },
        ],
      },
    });
  }

  const transcript = (sttResponse.text ?? '').trim();
  if (!transcript || transcript.length < 2) {
    throw new Error('No intelligible speech was detected in the recording. Please try speaking again.');
  }

  // Step 2: Existing RAG Supervisor Agent backend (same corpus, safety rules, citations)
  const ragResult = await ragEngine.query({
    question: transcript.slice(0, 1500),
    collectionFilter: input.collectionFilter ?? 'all',
    preferredLanguage,
    operationalContext: input.operationalContext,
  });

  // Step 3: Text-to-Speech via official gemini-3.8-flash-lite-tts (unary complete 24kHz WAV)
  const spokenText = prepareTextForSpeech(ragResult.answer);
  let audioBase64: string | null = null;
  let audioMimeType: string | null = null;
  let ttsWarning: string | undefined;

  try {
    const ttsResponse = await ai.models.generateContent({
      model: GEMINI_TTS_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: spokenText,
              speechMetadata: {
                style: 'Clear, calm, authoritative industrial plant supervisor advisor',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Zephyr' },
          },
        },
      },
    });

    const inlinePart = ttsResponse.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data
    )?.inlineData;

    if (inlinePart?.data) {
      audioBase64 = inlinePart.data;
      audioMimeType = inlinePart.mimeType || 'audio/wav';
    } else {
      ttsWarning = 'Speech audio could not be generated for this turn; written RAG response is displayed.';
    }
  } catch (ttsErr) {
    console.error('Standard Voice TTS failed (returning written RAG response):', ttsErr);
    ttsWarning =
      ttsErr instanceof Error
        ? `Audio synthesis temporarily unavailable (${ttsErr.message}). Written RAG response is displayed.`
        : 'Audio synthesis temporarily unavailable. Written RAG response is displayed.';
  }

  return {
    transcript,
    answer: ragResult.answer,
    citations: ragResult.citations,
    usedEmbeddings: ragResult.usedEmbeddings,
    advisorDisclaimer: ragResult.advisorDisclaimer,
    ragModel: ragResult.model,
    sttModel: sttModelUsed,
    ttsModel: GEMINI_TTS_MODEL,
    audioBase64,
    audioMimeType,
    ttsWarning,
  };
}
