export type KnowledgeCollection =
  | 'technical_docs'
  | 'equipment_registry'
  | 'demo_incidents'
  | 'procedures';

export type VerificationStatus =
  | 'VERIFIED'
  | 'PENDING PLANT VALIDATION'
  | 'PROTOTYPE CONFIGURED'
  | 'DEMONSTRATION DATA';

export interface KnowledgeDocument {
  id: string;
  title: string;
  section: string;
  source: string;
  collection: KnowledgeCollection;
  verificationStatus: VerificationStatus;
  content: string;
  createdAt: string;
}

export interface HistoricalIncidentRecord {
  case_id: string;
  date: string;
  severity: 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  problem: string;
  context: string;
  action_taken: string;
  result_30_min: string;
  result_60_min: string;
  tags: string[];
  dataOrigin: 'DEMONSTRATION DATA' | 'USER SUBMITTED LOG';
}

export interface EquipmentParameterEntry {
  id: string;
  parameterName: string;
  category:
    | 'Raw Meal & Feed'
    | 'Preheater & Calcination'
    | 'Kiln & Burners'
    | 'Air & Ventilation'
    | 'Grate Cooler'
    | 'Safety & Instrumentation';
  equipment: string;
  value: string;
  unit: string;
  source: string;
  verificationStatus: 'PENDING PLANT VALIDATION' | 'PROTOTYPE CONFIGURED' | 'PROBLEM STATEMENT REFERENCE';
  operationalSignificance: string;
}

export interface DocumentChunk {
  chunkId: string;
  parentId: string;
  collection: KnowledgeCollection;
  title: string;
  section: string;
  source: string;
  verificationStatus: VerificationStatus;
  text: string;
  metadata: {
    case_id?: string;
    date?: string;
    severity?: string;
    tags?: string[];
    dataOrigin?: string;
  };
  embedding?: number[];
}

export interface RagCitation {
  chunkId: string;
  collection: KnowledgeCollection;
  sourceName: string;
  sectionOrCaseId: string;
  verificationStatus: VerificationStatus;
  excerpt: string;
  score: number;
  incidentMeta?: {
    case_id: string;
    date: string;
    severity: string;
    problem: string;
    action_taken: string;
    result_30_min: string;
    result_60_min: string;
    dataOrigin: string;
  };
}

export interface RagQueryRequest {
  question: string;
  collectionFilter?: KnowledgeCollection | 'all';
  operationalContext?: {
    shellMaxTemp?: number;
    burningZoneTemp?: number;
    affectedZone?: string;
    condition?: string;
    flaggedSensors?: number;
  };
}

export interface RagQueryResponse {
  answer: string;
  citations: RagCitation[];
  retrievedCount: number;
  usedEmbeddings: boolean;
  advisorDisclaimer: string;
  model: string;
}
