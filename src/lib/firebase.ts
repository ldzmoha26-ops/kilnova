import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleAuthProvider);
}

export async function signOutGoogle() {
  return signOut(auth);
}

export interface PersistedRagDocumentInput {
  id: string;
  title: string;
  section: string;
  source: string;
  collection: 'technical_docs' | 'equipment_registry' | 'procedures';
  verificationStatus: 'VERIFIED' | 'PENDING PLANT VALIDATION' | 'PROTOTYPE CONFIGURED';
  content: string;
}

export async function saveUserRagDocument(input: PersistedRagDocumentInput): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const safeId = input.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  const path = `rag_documents/${safeId}`;
  try {
    await setDoc(doc(db, 'rag_documents', safeId), {
      authorUid: user.uid,
      title: input.title.trim().slice(0, 200),
      section: input.section.trim().slice(0, 120),
      source: input.source.trim().slice(0, 160),
      collection: input.collection,
      verificationStatus: input.verificationStatus,
      content: input.content.trim().slice(0, 12000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export interface PersistedRagIncidentInput {
  id: string;
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

export async function saveUserRagIncident(input: PersistedRagIncidentInput): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const safeId = input.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  const path = `rag_incidents/${safeId}`;
  const cleanTags = input.tags
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 8);
  try {
    await setDoc(doc(db, 'rag_incidents', safeId), {
      authorUid: user.uid,
      case_id: input.case_id.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40),
      date: input.date.slice(0, 10),
      severity: input.severity,
      problem: input.problem.trim().slice(0, 300),
      context: input.context.trim().slice(0, 2000),
      action_taken: input.action_taken.trim().slice(0, 2000),
      result_30_min: input.result_30_min.trim().slice(0, 400),
      result_60_min: input.result_60_min.trim().slice(0, 400),
      tags: cleanTags.length > 0 ? cleanTags : ['Kiln'],
      dataOrigin: input.dataOrigin,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function loadUserPersistedRagEntries() {
  const user = auth.currentUser;
  if (!user) return { documents: [], incidents: [] };
  try {
    const docsSnap = await getDocs(
      query(collection(db, 'rag_documents'), where('authorUid', '==', user.uid))
    );
    const incSnap = await getDocs(
      query(collection(db, 'rag_incidents'), where('authorUid', '==', user.uid))
    );
    return {
      documents: docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      incidents: incSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'rag_documents');
  }
}
