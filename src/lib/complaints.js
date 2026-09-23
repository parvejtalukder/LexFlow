/**
 * Complaint model helpers.
 *
 * A complaint belongs to the person who filed it: `submittedBy` (a Firebase uid)
 * is the ownership key, and it is the *only* thing that permits an edit — there
 * is no admin path to rewrite someone else's words. Admins review and delete.
 *
 * Every edit stamps `editedAt` and bumps `editCount`, so any reader can tell
 * that a complaint was changed after it was filed, and when. A decided
 * complaint (resolved / dismissed) is locked rather than editable, so a ruling
 * cannot be rewritten underneath.
 */

export const COMPLAINT_STATUSES = {
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
};

export const COMPLAINT_STATUS_ORDER = [
  COMPLAINT_STATUSES.PENDING,
  COMPLAINT_STATUSES.IN_REVIEW,
  COMPLAINT_STATUSES.RESOLVED,
  COMPLAINT_STATUSES.DISMISSED,
];

/** A decided complaint can no longer be edited, only read. */
export const CLOSED_STATUSES = [COMPLAINT_STATUSES.RESOLVED, COMPLAINT_STATUSES.DISMISSED];

export const SUBJECT_MAX = 120;
export const MESSAGE_MAX = 4000;

export function serializeComplaint(c) {
  return {
    id: c._id.toString(),
    subject: c.subject || '',
    message: c.message || '',
    status: c.status || COMPLAINT_STATUSES.PENDING,
    submittedBy: c.submittedBy || null,
    submittedByName: c.submittedByName || null,
    submittedByRole: c.submittedByRole || null,
    // The "edited" marker shown to both the owner and the admin.
    editedAt: c.editedAt || null,
    editCount: Number(c.editCount) || 0,
    reviewedAt: c.reviewedAt || null,
    reviewedBy: c.reviewedBy || null,
    resolutionNote: c.resolutionNote || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt || c.createdAt,
  };
}

/** Only the person who filed it owns it. */
export function isOwner(complaint, uid) {
  return Boolean(uid) && complaint?.submittedBy === uid;
}

export function isClosed(complaint) {
  return CLOSED_STATUSES.includes(complaint?.status || COMPLAINT_STATUSES.PENDING);
}

/** Editable by its owner while the complaint is still open. */
export function canEdit(complaint, uid) {
  return isOwner(complaint, uid) && !isClosed(complaint);
}

/**
 * Validate and normalise the two fields a submitter controls.
 * @returns {{ error?: string, subject?: string, message?: string }}
 */
export function validateComplaintInput({ subject, message } = {}) {
  const cleanSubject = String(subject ?? '').trim();
  const cleanMessage = String(message ?? '').trim();

  if (!cleanSubject) return { error: 'A short subject is required.' };
  if (cleanSubject.length > SUBJECT_MAX) {
    return { error: `Subject must be ${SUBJECT_MAX} characters or fewer.` };
  }
  if (!cleanMessage) return { error: 'Please describe your complaint.' };
  if (cleanMessage.length > MESSAGE_MAX) {
    return { error: `Message must be ${MESSAGE_MAX} characters or fewer.` };
  }

  return { subject: cleanSubject, message: cleanMessage };
}
