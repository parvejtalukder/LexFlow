import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';

// The only accountStatus that makes a caseworker eligible to receive a case.
// SUSPENDED (paused), DEACTIVATED (offboarded) and REJECTED (never accepted)
// accounts all keep `role: 'caseworker'` in MongoDB — every lifecycle action in
// /api/admin/* only rewrites `accountStatus` — so the role alone must never be
// trusted when assigning work.
export const ASSIGNABLE_CASEWORKER_STATUS = 'ACTIVE';

export const CASE_STATUSES = {
  PENDING: 'PENDING',
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED: 'CLOSED',
  REJECTED: 'REJECTED',
};

export function serializeCase(c) {
  // Documents are stored as a lightweight snapshot on the case itself; legacy
  // cases created before attachments existed simply have none.
  const documents = (c.documents || []).map((d) => {
    const id = d.id?.toString?.() || d.id || null;
    return {
      id,
      fileName: d.fileName || 'document',
      mimeType: d.mimeType || '',
      sizeBytes: d.sizeBytes || 0,
      url: id ? `/api/media/${id}` : null,
    };
  });

  return {
    id: c._id.toString(),
    caseNumber: c.caseNumber,
    title: c.title,
    category: c.category || null,
    priority: c.priority || null,
    helperName: c.helperName || null,
    description: c.description || null,
    client: c.client || null,
    documents,
    documentCount: documents.length,
    dealPrice: c.dealPrice,
    handlerId: c.handlerId || null,
    handlerName: c.handlerName || null,
    handlerType: c.handlerType || null,
    status: c.status || 'OPEN',
    isVat: !!c.isVat,
    vatAmount: c.vatAmount || 0,
    totalAmount: c.totalAmount != null ? c.totalAmount : c.dealPrice,
    rejectionReason: c.rejectionReason || null,
    approvedAt: c.approvedAt || null,
    approvedBy: c.approvedBy || null,
    createdBy: c.createdBy || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function findCase(id) {
  const casesCollection = await getCollection(COLLECTIONS.CASES);
  try {
    return await casesCollection.findOne({ _id: new ObjectId(id) });
  } catch {
    return null;
  }
}

export async function nextCaseNumber() {
  const casesCollection = await getCollection(COLLECTIONS.CASES);
  const count = await casesCollection.countDocuments();
  return `CASE-${String(count + 1).padStart(4, '0')}`;
}

export async function findHandlerByUid(uid) {
  const usersCollection = await getCollection(COLLECTIONS.USERS);
  return usersCollection.findOne({ uid });
}

export async function isAdmin(uid) {
  const u = await findHandlerByUid(uid);
  return u?.role === 'admin';
}

/**
 * Can this user record be handed a case?
 *
 * - `admin` — always, regardless of `accountStatus` (`resolveDashboardAccess` in
 *   `src/lib/routeAccess.js`, used by `PrivateRoute`, grants admins full access
 *   whatever the status is, so gating them here would
 *   wrongly drop working admins whose record carries the legacy 'APPROVED'
 *   status instead of 'ACTIVE').
 * - `caseworker` — only when approved and currently working, i.e.
 *   `accountStatus === 'ACTIVE'`. Suspended, deactivated, rejected, pending and
 *   legacy-approved accounts are all refused.
 *
 * @param {object|null|undefined} userDoc a raw `users` collection document
 * @returns {boolean}
 */
export function isValidHandler(userDoc) {
  if (!userDoc) return false;
  if (userDoc.role === 'admin') return true;
  return (
    userDoc.role === 'caseworker' &&
    userDoc.accountStatus === ASSIGNABLE_CASEWORKER_STATUS
  );
}
