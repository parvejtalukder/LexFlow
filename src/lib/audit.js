import { COLLECTIONS, getCollection } from '@/lib/collections';

/**
 * Append an entry to the audit history collection.
 * Keep it fire-and-forget: failures must never break the main operation.
 */
export async function writeAudit(entry) {
  try {
    const auditCollection = await getCollection(COLLECTIONS.AUDIT_LOGS);
    await auditCollection.insertOne({
      ...entry,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('writeAudit error:', error);
  }
}
