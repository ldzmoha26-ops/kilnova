# KILNOVA Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Any path outside `/rag_documents/{docId}` and `/rag_incidents/{incidentId}` is unconditionally denied (`allow read, write: if false`).
2. **Verified Identity**: All authenticated writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Author Ownership & Immutability**: Every `RagDocument` and `RagIncident` must bind `authorUid == request.auth.uid` on creation, and `authorUid` and `createdAt` are immutable on update.
4. **Strict Keys & Size Bounds**: Every string field enforces min/max `.size()`, arrays (`tags`) are bounded to `1..8` items with string type check on index 0, and `hasAll` + `hasOnly` reject ghost/shadow fields.
5. **Server Timestamps Only**: `createdAt == request.time` is strictly enforced on create.
6. **Scoped List Queries**: `allow list` enforces `resource.data.authorUid == request.auth.uid` so clients cannot scrape other users' documents.

## 2. The Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Write**: Creating `/rag_documents/doc-1` with `auth = null`.
2. **Unverified Email Write**: Creating `/rag_documents/doc-2` with `email_verified = false`.
3. **Identity Spoofing**: Creating `/rag_documents/doc-3` with `authorUid = "other-user-uid"`.
4. **Shadow Field Injection**: Creating `/rag_documents/doc-4` with extra field `isAdmin: true`.
5. **ID Poisoning**: Creating `/rag_documents/../../bad$id` or 200-char document ID.
6. **Oversized String DoW**: Creating `/rag_documents/doc-5` with `content` length > 12,000 chars.
7. **Forged Client Timestamp**: Creating `/rag_documents/doc-6` with a client-supplied `createdAt` not equal to `request.time`.
8. **Invalid Enum Value**: Creating `/rag_incidents/inc-1` with `severity: "SUPER_CRITICAL"`.
9. **Unbounded Tag Array**: Creating `/rag_incidents/inc-2` with 20 tags or non-string `tags[0]`.
10. **Immutable Field Tampering**: Updating `/rag_documents/doc-1` attempting to alter `authorUid` or `createdAt`.
11. **Cross-User Read/Delete**: Reading or deleting another user's `/rag_incidents/inc-other`.
12. **Blanket Collection Scrape**: Running `list` on `/rag_documents` without filtering to `authorUid == request.auth.uid`.
