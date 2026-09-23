import { COLLECTIONS, getCollection } from '@/lib/collections';
import { writeAudit } from '@/lib/audit';
import { sendEmail } from './mailer';
import { formatDateTime, formatMoney, renderEmail } from './templates';

/**
 * LexFlow transactional notifications.
 *
 * Every function here is fire-safe: it resolves recipients from the existing user
 * records, sends, records the outcome in the audit log, and never throws. A mail
 * problem must never turn a committed payment, withdrawal or case change into a
 * failed request.
 *
 * Auth email (password reset) is deliberately absent - Firebase Auth owns that.
 *
 * CONFIDENTIALITY: the rows handed to the template are the only facts a recipient
 * sees. Caseworkers never receive HQ / East London figures, and nobody receives
 * another person's earnings.
 */

/** Look up a user record, returning null instead of throwing. */
async function findUser(uid) {
  if (!uid) return null;
  try {
    const users = await getCollection(COLLECTIONS.USERS);
    return await users.findOne({ uid });
  } catch (error) {
    console.error('[email] recipient lookup failed:', error?.message || error);
    return null;
  }
}

/**
 * Account statuses that mean an administrator should no longer be emailed.
 *
 * Deliberately a deny-list rather than "must be ACTIVE": the app tolerates admin
 * records that still carry the legacy 'APPROVED' status (see `isValidHandler`),
 * so whitelisting would silently stop notifying working administrators.
 */
const INACTIVE_ACCOUNT_STATUSES = ['DEACTIVATED', 'SUSPENDED', 'REJECTED'];

/**
 * Every administrator's email, minus anyone who should not be told: the acting
 * admin, and any account that is no longer in service.
 */
async function adminEmails({ excludeUids = [] } = {}) {
  try {
    const users = await getCollection(COLLECTIONS.USERS);
    const admins = await users.find({ role: 'admin' }).toArray();
    return admins
      .filter((u) => u.email && !INACTIVE_ACCOUNT_STATUSES.includes(u.accountStatus))
      .filter((u) => !excludeUids.includes(u.uid))
      .map((u) => u.email);
  } catch (error) {
    console.error('[email] admin lookup failed:', error?.message || error);
    return [];
  }
}

/** Record a notification that was deliberately not sent, so the gap is visible. */
async function traceSkipped({ event, subjectId, reason }) {
  await writeAudit({
    action: 'EMAIL_SKIPPED',
    event,
    subjectId: subjectId ? String(subjectId) : null,
    recipients: [],
    sent: 0,
    reason,
  });
}

/**
 * The single funnel every notification goes through.
 *
 * Recipients are de-duplicated and blanks dropped; each address is emailed
 * separately so nobody sees another recipient's address. The outcome - including
 * "nothing was sent" - is recorded in the audit log, which is what makes a
 * missing notification visible later.
 *
 * This function NEVER throws. It runs after the caller's database write, so an
 * exception escaping here would report a failed payment, withdrawal or approval
 * for an operation that had already succeeded.
 */
async function deliver({ event, subjectId, recipients, subject, template }) {
  const to = [...new Set((recipients || []).filter(Boolean))];

  try {
    if (to.length === 0) {
      console.log(`[email] ${event}: no recipient with an email address - skipped.`);
      await traceSkipped({ event, subjectId, reason: 'no-recipient' });
      return { sent: 0, skipped: 'no-recipient' };
    }

    const { html, text } = renderEmail(template);
    let sent = 0;
    const failures = [];

    for (const address of to) {
      const result = await sendEmail({ to: address, subject, html, text });
      if (result.sent) sent += 1;
      else failures.push(`${address}: ${result.reason}`);
    }

    // Without credentials every attempt reports "not-configured". That is still
    // recorded, because a notification that never left must not be invisible.
    const allUnconfigured =
      failures.length > 0 && failures.every((entry) => entry.endsWith('not-configured'));

    await writeAudit({
      action: allUnconfigured ? 'EMAIL_SKIPPED' : sent > 0 ? 'EMAIL_SENT' : 'EMAIL_FAILED',
      event,
      subjectId: subjectId ? String(subjectId) : null,
      recipients: to,
      sent,
      reason: allUnconfigured ? 'not-configured' : null,
      failures: failures.length ? failures : null,
    });

    return { sent, failures };
  } catch (error) {
    // Nothing thrown here may reach the caller's business logic.
    console.error(`[email] ${event}: notification failed -`, error?.message || error);
    await writeAudit({
      action: 'EMAIL_FAILED',
      event,
      subjectId: subjectId ? String(subjectId) : null,
      recipients: to,
      sent: 0,
      reason: 'notification-error',
      failures: [String(error?.message || error)],
    });
    return { sent: 0, error: error?.message || String(error) };
  }
}

/**
 * A caseworker has submitted their application (first submission only).
 * Notifies the applicant, and tells the administrators there is work to review.
 */
export async function notifyApplicationSubmitted({ applicantUid }) {
  const applicant = await findUser(applicantUid);
  const name = applicant?.fullName || 'An applicant';
  const now = new Date();

  await deliver({
    event: 'APPLICATION_SUBMITTED',
    subjectId: applicantUid,
    recipients: [applicant?.email],
    subject: 'LexFlow — Application received',
    template: {
      heading: 'Your application has been received',
      intro: `Thank you, ${name}. Your application is with the administrators for review.`,
      rows: [
        { label: 'Submitted', value: formatDateTime(now) },
        { label: 'Status', value: 'Pending review' },
      ],
      outro:
        'You will receive another email once a decision has been made. Until then you can still edit your application in LexFlow.',
      cta: { label: 'Open LexFlow', path: '/dashboard/application' },
    },
  });

  await deliver({
    event: 'APPLICATION_SUBMITTED_ADMIN',
    subjectId: applicantUid,
    recipients: await adminEmails(),
    subject: 'LexFlow — New caseworker application to review',
    template: {
      heading: 'A new application is waiting for review',
      intro: `${name} has applied for caseworker access.`,
      rows: [
        { label: 'Applicant', value: name },
        { label: 'Submitted', value: formatDateTime(now) },
      ],
      cta: { label: 'Review applications', path: '/dashboard/requests' },
    },
  });
}

/** The administrators have approved or rejected an application. */
export async function notifyApplicationDecision({
  applicantUid,
  approved,
  practiceName,
  rejectionReason,
}) {
  const applicant = await findUser(applicantUid);

  await deliver({
    event: approved ? 'APPLICATION_APPROVED' : 'APPLICATION_REJECTED',
    subjectId: applicantUid,
    recipients: [applicant?.email],
    subject: approved
      ? 'LexFlow — Your application has been approved'
      : 'LexFlow — Your application was not approved',
    template: {
      heading: approved
        ? 'Your application has been approved'
        : 'Your application was not approved',
      intro: approved
        ? 'Welcome aboard — you now have caseworker access to LexFlow.'
        : 'The administrators have reviewed your application and decided not to approve it.',
      rows: [
        { label: 'Decision', value: approved ? 'Approved' : 'Not approved' },
        { label: 'Practice', value: approved ? practiceName : '' },
        { label: 'Decision date', value: formatDateTime(new Date()) },
        { label: 'Reason', value: approved ? '' : rejectionReason || 'No reason was given.' },
      ],
      outro: approved
        ? 'Cases assigned to you appear on your dashboard, along with your earnings and wallet.'
        : 'If you believe this decision was made in error please contact the administrators.',
      cta: approved ? { label: 'Open LexFlow', path: '/dashboard' } : undefined,
    },
  });
}

/** A caseworker has opened a case; the administrators need to review it. */
export async function notifyCaseSubmittedForReview({ caseDoc }) {
  await deliver({
    event: 'CASE_SUBMITTED_ADMIN',
    subjectId: caseDoc._id?.toString?.() || caseDoc.caseNumber,
    recipients: await adminEmails(),
    subject: `LexFlow — Case ${caseDoc.caseNumber} is waiting for review`,
    template: {
      heading: `Case ${caseDoc.caseNumber} needs approval`,
      intro: `${caseDoc.handlerName || 'A caseworker'} has opened a new case. It becomes active once approved.`,
      rows: [
        { label: 'Case number', value: caseDoc.caseNumber },
        { label: 'Opened by', value: caseDoc.handlerName || '' },
        { label: 'Opened', value: formatDateTime(caseDoc.createdAt) },
      ],
      cta: { label: 'Review case', path: `/dashboard/cases/${caseDoc._id}` },
    },
  });
}

/**
 * A case has been handed to a caseworker (at creation, or by reassignment).
 * The previous handler is told the case has left their list.
 */
export async function notifyCaseAssigned({ caseDoc, previousHandlerUid, actorUid }) {
  const caseId = caseDoc._id?.toString?.() || caseDoc._id;

  // Never tell someone about their own action: a caseworker who opened a case
  // for themselves does not need an email about it.
  if (caseDoc.handlerId && caseDoc.handlerId !== actorUid) {
    const handler = await findUser(caseDoc.handlerId);
    await deliver({
      event: 'CASE_ASSIGNED',
      subjectId: caseId,
      recipients: [handler?.email],
      subject: `LexFlow — Case ${caseDoc.caseNumber} has been assigned to you`,
      template: {
        heading: `Case ${caseDoc.caseNumber} is now yours`,
        intro: 'This case has been assigned to you and appears in your case list.',
        rows: [
          { label: 'Case number', value: caseDoc.caseNumber },
          { label: 'Assigned', value: formatDateTime(new Date()) },
          { label: 'Status', value: caseDoc.status },
        ],
        cta: { label: 'View case', path: `/dashboard/cases/${caseId}` },
      },
    });
  }

  const reassignedAway =
    previousHandlerUid && previousHandlerUid !== caseDoc.handlerId && previousHandlerUid !== actorUid;

  if (reassignedAway) {
    const previous = await findUser(previousHandlerUid);
    await deliver({
      event: 'CASE_REASSIGNED_FROM',
      subjectId: caseId,
      recipients: [previous?.email],
      subject: `LexFlow — Case ${caseDoc.caseNumber} has been reassigned`,
      template: {
        heading: `Case ${caseDoc.caseNumber} has moved to another caseworker`,
        intro: 'This case is no longer assigned to you.',
        rows: [
          { label: 'Case number', value: caseDoc.caseNumber },
          { label: 'Reassigned', value: formatDateTime(new Date()) },
        ],
        outro:
          'It has left your active case list. Any earnings already credited to you are unaffected.',
      },
    });
  }
}

/** An administrator has approved or rejected a caseworker's case. */
export async function notifyCaseReviewed({ caseDoc, approved, rejectionReason }) {
  const handler = await findUser(caseDoc.handlerId);

  await deliver({
    event: approved ? 'CASE_APPROVED_HANDLER' : 'CASE_REJECTED_HANDLER',
    subjectId: caseDoc._id?.toString?.() || caseDoc.caseNumber,
    recipients: [handler?.email],
    subject: approved
      ? `LexFlow — Case ${caseDoc.caseNumber} has been approved`
      : `LexFlow — Case ${caseDoc.caseNumber} was not approved`,
    template: {
      heading: approved
        ? `Case ${caseDoc.caseNumber} has been approved`
        : `Case ${caseDoc.caseNumber} was not approved`,
      intro: approved
        ? 'The administrators have approved your case. You can carry on working on it.'
        : 'The administrators have reviewed your case and not approved it.',
      rows: [
        { label: 'Case number', value: caseDoc.caseNumber },
        { label: 'Decision', value: approved ? 'Approved' : 'Not approved' },
        { label: 'Decision date', value: formatDateTime(new Date()) },
        { label: 'Reason', value: approved ? '' : rejectionReason || 'No reason was given.' },
      ],
      cta: { label: 'View case', path: `/dashboard/cases/${caseDoc._id}` },
    },
  });
}

/**
 * A payment on the caseworker's case has been approved, so their share has been
 * credited to their wallet. Only the recipient's own figure is ever disclosed:
 * the Head Office and East London shares are never emailed to a caseworker.
 */
export async function notifyPaymentApproved({ caseDoc, handlerAmount, actorUid }) {
  const caseId = caseDoc._id?.toString?.() || caseDoc._id;

  // An admin who also handles the case would otherwise email themselves.
  if (caseDoc.handlerId === actorUid) return;

  const handler = await findUser(caseDoc.handlerId);
  await deliver({
    event: 'PAYMENT_APPROVED_HANDLER',
    subjectId: caseId,
    recipients: [handler?.email],
    subject: `LexFlow — A payment on case ${caseDoc.caseNumber} has been approved`,
    template: {
      heading: 'Your payment has been approved',
      intro: `A payment on case ${caseDoc.caseNumber} has been approved and credited to your wallet.`,
      rows: [
        { label: 'Case number', value: caseDoc.caseNumber },
        { label: 'Your share', value: formatMoney(handlerAmount) },
        { label: 'Approved', value: formatDateTime(new Date()) },
      ],
      cta: { label: 'View earnings', path: '/dashboard/my-earnings' },
    },
  });
}

/**
 * An approved payment has been voided, which removes the earnings it created.
 * Only sent when a distribution existed, i.e. money really was taken back.
 */
export async function notifyPaymentVoided({ caseDoc, removedHandlerAmount, actorUid }) {
  const caseId = caseDoc._id?.toString?.() || caseDoc._id;

  if (caseDoc.handlerId === actorUid) return;

  const handler = await findUser(caseDoc.handlerId);
  await deliver({
    event: 'PAYMENT_VOIDED_HANDLER',
    subjectId: caseId,
    recipients: [handler?.email],
    subject: `LexFlow — A payment on case ${caseDoc.caseNumber} was voided`,
    template: {
      heading: 'A payment on your case was voided',
      intro: `A previously approved payment on case ${caseDoc.caseNumber} has been voided, so the earnings it created have been removed.`,
      rows: [
        { label: 'Case number', value: caseDoc.caseNumber },
        { label: 'Removed from wallet', value: formatMoney(removedHandlerAmount) },
        { label: 'Voided', value: formatDateTime(new Date()) },
      ],
      outro: 'If your balance now looks wrong, contact the administrators.',
      cta: { label: 'View wallet', path: '/dashboard/wallet' },
    },
  });
}

/** A caseworker has requested a withdrawal, so the payout desk has work to do. */
export async function notifyWithdrawalRequested({ withdrawal, actorUid }) {
  await deliver({
    event: 'WITHDRAWAL_REQUESTED_ADMIN',
    subjectId: withdrawal._id?.toString?.(),
    // An admin may draw from the same personal wallet, and nobody should be told
    // about their own request.
    recipients: await adminEmails({ excludeUids: [actorUid] }),
    subject: `LexFlow — Withdrawal request from ${withdrawal.caseworkerName || 'a caseworker'}`,
    template: {
      heading: 'A withdrawal request is waiting',
      intro: `${withdrawal.caseworkerName || 'A caseworker'} has requested a withdrawal.`,
      rows: [
        { label: 'Caseworker', value: withdrawal.caseworkerName || '' },
        { label: 'Amount', value: formatMoney(withdrawal.amount) },
        { label: 'Requested', value: formatDateTime(withdrawal.requestedAt) },
      ],
      cta: { label: 'Review request', path: '/dashboard/withdrawal-requests' },
    },
  });
}

/** An administrator has approved, rejected or paid a caseworker's withdrawal. */
export async function notifyWithdrawalDecision({
  withdrawal,
  action,
  note,
  paymentMethod,
  paymentReference,
}) {
  const copy = {
    approve: {
      event: 'WITHDRAWAL_APPROVED_HANDLER',
      subject: 'LexFlow — Your withdrawal has been approved',
      heading: 'Your withdrawal has been approved',
      intro:
        'Your request has been approved. The money is released once the payment has been sent.',
    },
    reject: {
      event: 'WITHDRAWAL_REJECTED_HANDLER',
      subject: 'LexFlow — Your withdrawal was not approved',
      heading: 'Your withdrawal was not approved',
      intro:
        'The administrators have reviewed your request and not approved it, so the reserved amount is back in your wallet.',
    },
    pay: {
      event: 'WITHDRAWAL_PAID_HANDLER',
      subject: 'LexFlow — Your withdrawal has been paid',
      heading: 'Your withdrawal has been paid',
      intro: 'The money has been sent, and your wallet has been reduced by the amount below.',
    },
  }[action];

  if (!copy) return;

  const caseworker = await findUser(withdrawal.caseworkerUid);

  await deliver({
    event: copy.event,
    subjectId: withdrawal._id?.toString?.(),
    recipients: [caseworker?.email],
    subject: copy.subject,
    template: {
      heading: copy.heading,
      intro: copy.intro,
      rows: [
        { label: 'Amount', value: formatMoney(withdrawal.amount) },
        { label: action === 'pay' ? 'Paid' : 'Reviewed', value: formatDateTime(new Date()) },
        ...(action === 'pay'
          ? [
              { label: 'Method', value: paymentMethod || withdrawal.paymentMethod || '' },
              { label: 'Reference', value: paymentReference || withdrawal.paymentReference || '' },
            ]
          : []),
        {
          label: 'Note from the administrators',
          value: action === 'approve' ? '' : note || withdrawal.note || '',
        },
      ],
      cta: { label: 'View wallet', path: '/dashboard/wallet' },
    },
  });
}

/**
 * A Head Office / East London payout was recorded or reversed. Admins only, and
 * never the admin who did it - the others need to see large movements in the
 * branch ledgers.
 */
export async function notifyCompanyPayout({ accountLabel, amount, actorUid, reversed, reason }) {
  await deliver({
    event: reversed ? 'COMPANY_WITHDRAWAL_REVERSED_ADMIN' : 'COMPANY_WITHDRAWAL_ADMIN',
    recipients: await adminEmails({ excludeUids: [actorUid] }),
    subject: reversed
      ? `LexFlow — ${accountLabel} payout reversed`
      : `LexFlow — ${accountLabel} payout recorded`,
    template: {
      heading: reversed ? `${accountLabel} payout reversed` : `${accountLabel} payout recorded`,
      intro: reversed
        ? `A payout from the ${accountLabel} account has been reversed, so the amount is available to the branch again.`
        : `A payout has been recorded against the ${accountLabel} account.`,
      rows: [
        { label: 'Account', value: accountLabel },
        { label: 'Amount', value: formatMoney(amount) },
        { label: reversed ? 'Reversed' : 'Recorded', value: formatDateTime(new Date()) },
        { label: 'Reason', value: reversed ? reason || '' : '' },
      ],
      cta: { label: 'Open branch accounts', path: '/dashboard/wallet' },
    },
  });
}

/** A complaint has been filed, so the administrators have something to action. */
export async function notifyComplaintFiled({ complaint, actorUid }) {
  await deliver({
    event: 'COMPLAINT_FILED_ADMIN',
    subjectId: complaint._id?.toString?.(),
    // Every admin who has to act on it - except the one who filed it.
    recipients: await adminEmails({ excludeUids: [actorUid] }),
    subject: 'LexFlow — A new complaint has been filed',
    template: {
      heading: 'A new complaint has been filed',
      intro: `${complaint.submittedByName || 'A team member'} has filed a complaint.`,
      rows: [
        { label: 'Subject', value: complaint.subject },
        { label: 'Filed by', value: complaint.submittedByName || '' },
        { label: 'Filed', value: formatDateTime(complaint.createdAt) },
      ],
      outro: 'Open the complaints queue to read the full message and review it.',
      cta: { label: 'Open complaints', path: '/dashboard/complaints' },
    },
  });
}



