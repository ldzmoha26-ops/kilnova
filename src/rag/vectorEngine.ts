import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  EQUIPMENT_PARAMETER_REGISTRY,
  INITIAL_TECHNICAL_DOCUMENTS,
  SYNTHETIC_DEMO_INCIDENTS,
} from './knowledgeCorpus.ts';
import type {
  AssistantLanguage,
  DocumentChunk,
  EquipmentParameterEntry,
  HistoricalIncidentRecord,
  KnowledgeCollection,
  KnowledgeDocument,
  RagCitation,
  RagQueryRequest,
  RagQueryResponse,
} from './types.ts';

export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const FALLBACK_EMBEDDING_MODEL = 'gemini-embedding-001';
export const GENERATION_MODEL = 'gemini-3.8-flash';
export const FALLBACK_GENERATION_MODEL = 'gemini-4-hydrogen';

export const ADVISOR_DISCLAIMER =
  'ADVISOR-ONLY MODE: KILNOVA provides explainable decision support and never directly executes DCS commands or alters live kiln setpoints. All interventions require human operator validation.';

export function buildLanguageGuidance(preferredLanguage: AssistantLanguage = 'auto'): string {
  if (preferredLanguage === 'fr') {
    return 'Respond in clear industrial French (français), using accurate cement kiln terminology (four rotatif, virole, zone de cuisson, chaux libre, air tertiaire, Repli Manuel).';
  }
  if (preferredLanguage === 'ar') {
    return 'Respond in clear Modern Standard Arabic (العربية) with accurate cement rotary kiln terminology (الفرن الدوار، الغلاف المعدني، منطقة الحرق، الجير الحر، الهواء الثالثي، الوضع اليدوي الاحتياطي), keeping technical IDs like CAS-2026-081, PRC-2048, and 370 °C clear.';
  }
  if (preferredLanguage === 'en') {
    return 'Respond in clear industrial English using accurate dry-process rotary cement kiln terminology.';
  }
  return 'Automatically detect the operator/supervisor language (English, French, or Arabic) and respond naturally in the same language while keeping industrial cement kiln terminology, case IDs (CAS-2026-081/092/105, PRC-2048), and 370 °C threshold accurate.';
}

export function buildSupervisorSystemInstruction(options?: {
  mode?: 'text' | 'voice';
  preferredLanguage?: AssistantLanguage;
  operationalContext?: RagQueryRequest['operationalContext'];
}): string {
  const mode = options?.mode ?? 'text';
  const langRule = buildLanguageGuidance(options?.preferredLanguage ?? 'auto');
  const op = options?.operationalContext;
  const opSnapshot = op
    ? `\nCURRENT DEMONSTRATION DASHBOARD SNAPSHOT (Context A — Demonstration Data, NOT live plant DCS):\n- Condition: ${op.condition ?? 'ANOMALY'}\n- Active Zone: ${op.affectedZone ?? 'Shell Ring B-04 (Meter 39–43)'}\n- Shell Peak Temp: ${op.shellMaxTemp ?? 412} °C (Configured prototype limit < 370 °C)\n- Burning Zone Temp: ${op.burningZoneTemp ?? 1486} °C\n- Flagged Sensors: ${op.flaggedSensors ?? 3}/6\n`
    : '';

  const modeRules =
    mode === 'voice'
      ? `6. VOICE CONVERSATION & RAG TOOL RULES:
   - You are speaking live to a control-room supervisor over bidirectional audio. Keep spoken answers crisp, well-structured, and easy to follow without reading raw markdown symbols aloud.
   - For ANY question about kiln technical documents, SCAEK problem statement, GEW 2026 guide, process notes, equipment parameters, sensors, KPIs, energy consumption, safety limits, or historical incidents (e.g., CAS-2026-081, CAS-2026-092, CAS-2026-105, PRC-2048), ALWAYS call the \`search_kilnova_knowledge_base\` tool first to ground your spoken answer in the live KILNOVA RAG corpus.
   - Mention the relevant Case ID or Document Section naturally when answering, and verbally distinguish simulated demonstration records (DEMONSTRATION DATA) and preliminary notes (PENDING PLANT VALIDATION) from verified plant facts.
   - If the supervisor asks you to execute a DCS command, change burner fuel, adjust kiln speed, modify fan speeds, alter tertiary air, or change any operational setpoint, politely refuse and clearly explain that KILNOVA is strictly an ADVISOR-ONLY decision-support system and that human operators must validate and execute any intervention on the plant DCS.`
      : `6. Structure your answer concisely and clearly for control-room supervisors, distinguishing:
   - **Retrieved Facts & Historical Comparison** (citing exact Case IDs or Document Sections)
   - **Probable Causes & Technical Mechanism** (clearly separated as engineering hypotheses where applicable)
   - **Advisor Recommendations & Safety Constraints** (human-in-the-loop validation required).`;

  return `You are the KILNOVA AI Supervisor Agent (Operational Data & Report Intelligence) for the dry-process cement rotary kiln at SCAEK (GEW 2026 prototype).

MANDATORY SAFETY & SCIENTIFIC INTEGRITY RULES:
1. You are strictly an ADVISOR. Never claim to execute DCS commands, change burner settings, modify fuel flow, change kiln speed, change fan speeds, modify tertiary air settings, change operational setpoints, or control real kiln equipment. State clearly that all recommendations require human operator validation.
2. Ground every factual claim strictly in retrieved KILNOVA knowledge base sources. Never invent incident IDs, plant measurements, financial savings, ROI, or unvalidated ML accuracy percentages.
3. Whenever citing a historical incident from the demo_incidents collection (such as CAS-2026-081, CAS-2026-092, or CAS-2026-105), explicitly state its Incident ID, Date, Severity, Problem, Historical Action, Recorded 30-min/60-min Results, AND explicitly label it as a simulated demonstration test record (DEMONSTRATION DATA) — never present it as a verified SCAEK plant record.
4. Whenever citing parameters from the Handwritten Industrial Process Notes, explicitly note that they are preliminary readings tagged PENDING PLANT VALIDATION.
5. Always reference the configured prototype maximum shell temperature threshold as 370 °C (subject to plant engineering/safety validation), never 395 °C.
${modeRules}
7. MULTILINGUAL RULE: ${langRule}${opSnapshot}`;
}

/**
 * Splits a technical document into overlapping semantic chunks for vector retrieval.
 */
export function chunkText(
  text: string,
  maxChars = 650,
  overlapChars = 110
): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      // Split long paragraph by sentence or fixed window with overlap
      let start = 0;
      while (start < para.length) {
        const end = Math.min(para.length, start + maxChars);
        chunks.push(para.slice(start, end).trim());
        if (end >= para.length) break;
        start = Math.max(start + 1, end - overlapChars);
      }
      continue;
    }

    if ((current + '\n\n' + para).trim().length <= maxChars) {
      current = current ? `${current}\n\n${para}` : para;
    } else {
      if (current) chunks.push(current.trim());
      const tail = current ? current.slice(Math.max(0, current.length - overlapChars)).trim() : '';
      current = tail && (tail.length + para.length + 2 <= maxChars) ? `${tail}\n${para}` : para;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\-]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Deterministic BM25-inspired lexical overlap score (0..1) that ensures exact industrial
 * identifiers (e.g., CAS-2026-081, B-04, 370, V1-V10, LSF, free lime) always surface accurately
 * alongside dense vector similarity.
 */
export function lexicalScore(query: string, documentText: string): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const docLower = documentText.toLowerCase();
  const docTokens = new Set(tokenize(documentText));

  let matched = 0;
  let bonus = 0;
  for (const tok of qTokens) {
    if (docTokens.has(tok)) {
      matched += 1;
      // Extra weight for industrial identifiers & numbers
      if (/[0-9]/.test(tok) || tok.includes('-')) {
        bonus += 0.35;
      }
    } else if (tok.length >= 4 && docLower.includes(tok)) {
      matched += 0.6;
    }
  }

  return Math.min(1, (matched + bonus) / Math.max(1, qTokens.length));
}

export function buildDocumentChunks(doc: KnowledgeDocument): DocumentChunk[] {
  const pieces = chunkText(doc.content);
  return pieces.map((piece, idx) => ({
    chunkId: `${doc.id}#c${idx + 1}`,
    parentId: doc.id,
    collection: doc.collection,
    title: doc.title,
    section: pieces.length > 1 ? `${doc.section} (Part ${idx + 1}/${pieces.length})` : doc.section,
    source: doc.source,
    verificationStatus: doc.verificationStatus,
    text: `${doc.title} — ${doc.section}\nSource: ${doc.source} [${doc.verificationStatus}]\n${piece}`,
    metadata: {},
  }));
}

export function buildIncidentChunk(inc: HistoricalIncidentRecord): DocumentChunk {
  const text = [
    `[${inc.dataOrigin} — SIMULATED HISTORICAL TEST RECORD] Incident ${inc.case_id}`,
    `Date: ${inc.date} | Severity: ${inc.severity}`,
    `Problem: ${inc.problem}`,
    `Context: ${inc.context}`,
    `Action Taken: ${inc.action_taken}`,
    `Result (30 min): ${inc.result_30_min}`,
    `Result (60 min): ${inc.result_60_min}`,
    `Tags: ${inc.tags.join(', ')}`,
  ].join('\n');

  return {
    chunkId: `INC-${inc.case_id}`,
    parentId: inc.case_id,
    collection: 'demo_incidents',
    title: `Incident ${inc.case_id} — ${inc.problem}`,
    section: `${inc.case_id} (${inc.date} · ${inc.severity})`,
    source: `${inc.dataOrigin} · Synthetic Incident Dataset`,
    verificationStatus: 'DEMONSTRATION DATA',
    text,
    metadata: {
      case_id: inc.case_id,
      date: inc.date,
      severity: inc.severity,
      tags: inc.tags,
      dataOrigin: inc.dataOrigin,
    },
  };
}

export function buildParameterRegistryChunks(
  params: readonly EquipmentParameterEntry[]
): DocumentChunk[] {
  // Group parameters by category so retrieval stays focused and cites exact status
  const byCategory = new Map<string, EquipmentParameterEntry[]>();
  for (const p of params) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const chunks: DocumentChunk[] = [];
  for (const [category, items] of byCategory.entries()) {
    const body = items
      .map(
        (p) =>
          `- ${p.parameterName} (${p.equipment}): ${p.value} ${p.unit} | Source: ${p.source} | Status: ${p.verificationStatus} | Significance: ${p.operationalSignificance}`
      )
      .join('\n');
    chunks.push({
      chunkId: `REG-${category.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`,
      parentId: `REGISTRY-${category}`,
      collection: 'equipment_registry',
      title: `Equipment & Process Parameter Registry — ${category}`,
      section: `Parameter Registry · ${category}`,
      source: 'Handwritten Industrial Process Notes & SCAEK Registry',
      verificationStatus: 'PENDING PLANT VALIDATION',
      text: `Equipment & Process Parameter Registry (${category})\n${body}`,
      metadata: {},
    });
  }
  return chunks;
}

export class KilnovaRagEngine {
  private documents: KnowledgeDocument[] = [];
  private incidents: HistoricalIncidentRecord[] = [];
  private parameters: EquipmentParameterEntry[] = [...EQUIPMENT_PARAMETER_REGISTRY];
  private chunks: DocumentChunk[] = [];
  private ai: GoogleGenAI | null = null;
  private embeddingsHydrated = false;
  private embeddingsInFlight: Promise<boolean> | null = null;
  private embeddingsBackoffUntil = 0;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY;
    if (key) {
      this.ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    this.seedInitialCorpus();
  }

  private seedInitialCorpus() {
    this.documents = INITIAL_TECHNICAL_DOCUMENTS.map((d) => ({ ...d }));
    this.incidents = SYNTHETIC_DEMO_INCIDENTS.map((i) => ({ ...i, tags: [...i.tags] }));
    this.rebuildChunks();
  }

  private rebuildChunks() {
    const nextChunks: DocumentChunk[] = [];
    for (const doc of this.documents) {
      nextChunks.push(...buildDocumentChunks(doc));
    }
    nextChunks.push(...buildParameterRegistryChunks(this.parameters));
    for (const inc of this.incidents) {
      nextChunks.push(buildIncidentChunk(inc));
    }
    // Preserve already-computed embeddings when chunkId & text match
    const prevById = new Map(this.chunks.map((c) => [c.chunkId, c]));
    this.chunks = nextChunks.map((chunk) => {
      const existing = prevById.get(chunk.chunkId);
      if (existing && existing.text === chunk.text && existing.embedding) {
        return { ...chunk, embedding: existing.embedding };
      }
      return chunk;
    });
  }

  public getDocuments(): KnowledgeDocument[] {
    return this.documents;
  }

  public getIncidents(): HistoricalIncidentRecord[] {
    return this.incidents;
  }

  public getParameters(): EquipmentParameterEntry[] {
    return this.parameters;
  }

  public getChunkCount(): number {
    return this.chunks.length;
  }

  public async addDocument(
    input: Omit<KnowledgeDocument, 'id' | 'createdAt'> & { id?: string }
  ): Promise<KnowledgeDocument> {
    const doc: KnowledgeDocument = {
      id: input.id ?? `DOC-USR-${Date.now().toString(36).toUpperCase()}`,
      title: input.title.trim(),
      section: input.section.trim(),
      source: input.source.trim(),
      collection: input.collection,
      verificationStatus: input.verificationStatus,
      content: input.content.trim(),
      createdAt: new Date().toISOString(),
    };
    this.documents.unshift(doc);
    this.rebuildChunks();
    await this.ensureEmbeddings();
    return doc;
  }

  public async addIncident(
    input: HistoricalIncidentRecord
  ): Promise<HistoricalIncidentRecord> {
    const normalized: HistoricalIncidentRecord = {
      ...input,
      case_id: input.case_id.trim().toUpperCase(),
      tags: input.tags.map((t) => t.trim()).filter(Boolean),
    };
    const existingIdx = this.incidents.findIndex((i) => i.case_id === normalized.case_id);
    if (existingIdx >= 0) {
      this.incidents[existingIdx] = normalized;
    } else {
      this.incidents.unshift(normalized);
    }
    this.rebuildChunks();
    await this.ensureEmbeddings();
    return normalized;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async embedTexts(texts: string[]): Promise<number[][]> {
    if (!this.ai || texts.length === 0) return [];
    const models = [EMBEDDING_MODEL, FALLBACK_EMBEDDING_MODEL];
    let lastError: unknown;
    for (const model of models) {
      try {
        const result = await this.withTimeout(
          this.ai.models.embedContent({
            model,
            contents: texts,
          }),
          4500,
          `embedContent(${model})`
        );
        const embeddings = result.embeddings ?? [];
        return embeddings.map((e) => e.values ?? []);
      } catch (err) {
        lastError = err;
      }
    }
    console.warn('Embedding API temporarily unavailable; using hybrid lexical retrieval:', lastError);
    return [];
  }

  public async ensureEmbeddings(): Promise<boolean> {
    if (!this.ai) return false;
    const missing = this.chunks.filter((c) => !c.embedding || c.embedding.length === 0);
    if (missing.length === 0) {
      this.embeddingsHydrated = true;
      return true;
    }
    if (Date.now() < this.embeddingsBackoffUntil) {
      return false;
    }
    if (this.embeddingsInFlight) {
      return this.embeddingsInFlight;
    }

    const work = (async () => {
      // Embed in batches of 16 to stay clean & fast
      for (let i = 0; i < missing.length; i += 16) {
        const batch = missing.slice(i, i + 16);
        const vectors = await this.embedTexts(batch.map((c) => c.text));
        if (vectors.length === 0) {
          this.embeddingsHydrated = false;
          this.embeddingsBackoffUntil = Date.now() + 60_000;
          return false;
        }
        batch.forEach((chunk, idx) => {
          if (vectors[idx] && vectors[idx].length > 0) {
            chunk.embedding = vectors[idx];
          }
        });
      }
      this.embeddingsHydrated = this.chunks.every((c) => c.embedding && c.embedding.length > 0);
      return this.embeddingsHydrated;
    })();

    this.embeddingsInFlight = work;
    try {
      return await work;
    } finally {
      this.embeddingsInFlight = null;
    }
  }

  /**
   * Pure + dense hybrid vector retrieval supporting collection metadata filtering.
   */
  public retrieveTopChunks(
    query: string,
    options?: {
      topK?: number;
      collectionFilter?: KnowledgeCollection | 'all';
      queryEmbedding?: number[];
    }
  ): Array<{ chunk: DocumentChunk; score: number }> {
    const topK = options?.topK ?? 5;
    const filter = options?.collectionFilter ?? 'all';
    const qEmb = options?.queryEmbedding;

    const candidates =
      filter === 'all'
        ? this.chunks
        : this.chunks.filter((c) => c.collection === filter);

    const scored = candidates.map((chunk) => {
      const lex = lexicalScore(query, chunk.text);
      const vec =
        qEmb && chunk.embedding && chunk.embedding.length === qEmb.length
          ? Math.max(0, cosineSimilarity(qEmb, chunk.embedding))
          : null;

      // Hybrid score: 65% dense semantic vector similarity + 35% exact industrial lexical matching
      const score = vec !== null ? vec * 0.65 + lex * 0.35 : lex;
      return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Shared RAG retrieval pipeline used by both Text Supervisor Chat and Gemini Live Voice Agent.
   */
  public async retrieveWithCitations(
    question: string,
    options?: {
      topK?: number;
      collectionFilter?: KnowledgeCollection | 'all';
    }
  ): Promise<{
    matches: Array<{ chunk: DocumentChunk; score: number }>;
    citations: RagCitation[];
    contextBlocks: string;
    usedEmbeddings: boolean;
  }> {
    const cleanQuestion = question.trim();
    const usedEmbeddings = await this.ensureEmbeddings();
    let queryEmbedding: number[] | undefined;
    if (usedEmbeddings && cleanQuestion) {
      const qVectors = await this.embedTexts([cleanQuestion]);
      queryEmbedding = qVectors[0];
    }

    const matches = this.retrieveTopChunks(cleanQuestion, {
      topK: options?.topK ?? 5,
      collectionFilter: options?.collectionFilter ?? 'all',
      queryEmbedding,
    });

    const citations: RagCitation[] = matches.map(({ chunk, score }) => {
      const incident =
        chunk.collection === 'demo_incidents' && chunk.metadata.case_id
          ? this.incidents.find((i) => i.case_id === chunk.metadata.case_id)
          : undefined;
      return {
        chunkId: chunk.chunkId,
        collection: chunk.collection,
        sourceName: chunk.source,
        sectionOrCaseId: chunk.metadata.case_id ?? chunk.section,
        verificationStatus: chunk.verificationStatus,
        excerpt: chunk.text.slice(0, 260) + (chunk.text.length > 260 ? '…' : ''),
        score: Number(score.toFixed(3)),
        incidentMeta: incident
          ? {
              case_id: incident.case_id,
              date: incident.date,
              severity: incident.severity,
              problem: incident.problem,
              action_taken: incident.action_taken,
              result_30_min: incident.result_30_min,
              result_60_min: incident.result_60_min,
              dataOrigin: incident.dataOrigin,
            }
          : undefined,
      };
    });

    const contextBlocks = matches
      .map(
        ({ chunk, score }, idx) =>
          `[SOURCE ${idx + 1} | Collection: ${chunk.collection} | Status: ${chunk.verificationStatus} | Score: ${score.toFixed(
            3
          )}]\n${chunk.text}`
      )
      .join('\n\n---\n\n');

    return {
      matches,
      citations,
      contextBlocks,
      usedEmbeddings: usedEmbeddings && Boolean(queryEmbedding && queryEmbedding.length > 0),
    };
  }

  public async query(req: RagQueryRequest): Promise<RagQueryResponse> {
    if (!this.ai) {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const question = req.question.trim();
    if (!question) {
      throw new Error('Question cannot be empty.');
    }

    const { citations, contextBlocks, usedEmbeddings } = await this.retrieveWithCitations(question, {
      topK: 5,
      collectionFilter: req.collectionFilter ?? 'all',
    });

    const opCtx = req.operationalContext
      ? `\nCURRENT DEMONSTRATION DASHBOARD SNAPSHOT (Context A — Demonstration Data, NOT live plant DCS):\n- Condition: ${req.operationalContext.condition ?? 'ANOMALY'}\n- Active Zone: ${req.operationalContext.affectedZone ?? 'Shell Ring B-04 (Meter 39–43)'}\n- Shell Peak Temp: ${req.operationalContext.shellMaxTemp ?? 412} °C (Configured prototype limit < 370 °C)\n- Burning Zone Temp: ${req.operationalContext.burningZoneTemp ?? 1486} °C\n- Flagged Sensors: ${req.operationalContext.flaggedSensors ?? 3}/6\n`
      : '';

    const systemInstruction = buildSupervisorSystemInstruction({
      mode: 'text',
      preferredLanguage: req.preferredLanguage ?? 'auto',
    });

    const userPrompt = `${opCtx}\nRETRIEVED KNOWLEDGE BASE SOURCES:\n${contextBlocks}\n\nSUPERVISOR QUESTION:\n${question}`;

    const candidateModels = [GENERATION_MODEL, FALLBACK_GENERATION_MODEL, 'gemini-3.1-flash-lite'];
    let answer = '';
    let usedModel = GENERATION_MODEL;
    let lastErr: unknown;

    for (const modelName of candidateModels) {
      try {
        const response = await this.withTimeout(
          this.ai.models.generateContent({
            model: modelName,
            contents: userPrompt,
            config: {
              systemInstruction,
              temperature: 0.2,
              ...(modelName === GENERATION_MODEL
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          }),
          15000,
          `generateContent(${modelName})`
        );
        const text = response.text?.trim();
        if (text) {
          answer = text;
          usedModel = modelName;
          break;
        }
      } catch (err) {
        lastErr = err;
        console.warn(`Gemini model ${modelName} error, attempting fallback if available:`, err);
      }
    }

    if (!answer) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error('Gemini generation failed across configured models.');
    }

    return {
      answer,
      citations,
      retrievedCount: citations.length,
      usedEmbeddings,
      advisorDisclaimer: ADVISOR_DISCLAIMER,
      model: usedModel,
    };
  }
}
