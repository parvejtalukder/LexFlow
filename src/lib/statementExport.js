/**
 * Statement rendering for Transaction History (client-side only).
 *
 * Both formats are produced from the SAME role-scoped payload returned by
 * /api/wallet/statement, so a statement can never contain more than the user is
 * allowed to see: the server decides which rows and which columns exist, and
 * `statementColumns()` only picks from the fields the server sent.
 *
 * CSV is written by hand (no dependency). The PDF is generated with jsPDF +
 * jspdf-autotable, imported lazily on click so the library never reaches the
 * initial bundle.
 */

/** Human labels for the derived transaction types. */
const TYPE_LABELS = {
  EARNED: 'Earned',
  WITHDRAWAL: 'Withdrawal',
  PAYOUT: 'Branch payout',
  PAYMENT: 'Payment (gross)',
};

const ACCOUNT_LABELS = { HANDLER: 'Caseworker', HQ: 'Head Office', EL: 'East London' };

export function typeLabel(type) {
  return TYPE_LABELS[type] || type || '';
}

export function accountLabelOf(account) {
  return ACCOUNT_LABELS[account] || account || '';
}

/** Signed amount: money that has left the wallet is negative, everything else positive. */
export function signedAmount(row) {
  const value = Number(row.amount) || 0;
  return row.direction === 'out' ? -value : value;
}

const csvNumber = (v) => (v == null || v === '' ? '' : (Number(v) || 0).toFixed(2));
const money = (v) => (v == null ? '—' : `£${(Number(v) || 0).toFixed(2)}`);
const pct = (v) => (v == null ? '—' : `${v}%`);
const dateOnly = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-GB') : '—');

/**
 * Column set for the statement. `firm` is only ever requested by an admin, and
 * the extra columns read fields the server only includes for admins.
 */
export function statementColumns(scope) {
  const shared = [
    { label: 'Date', value: (r) => dateOnly(r.date), pdf: (r) => dateOnly(r.date) },
    { label: 'Type', value: (r) => typeLabel(r.type), pdf: (r) => typeLabel(r.type) },
    {
      label: 'Description',
      value: (r) => r.label || r.description || '',
      pdf: (r) => r.label || r.description || '',
    },
    { label: 'Status', value: (r) => r.status || '', pdf: (r) => r.status || '' },
    { label: 'Reference', value: (r) => r.reference || r.paymentReference || '', pdf: (r) => r.reference || r.paymentReference || '' },
  ];

  if (scope !== 'firm') {
    return [
      ...shared,
      { label: 'Amount (GBP)', value: (r) => csvNumber(signedAmount(r)), pdf: (r) => money(signedAmount(r)) },
      // The frozen handler percentage recorded with this transaction, never the
      // caseworker's current configuration.
      { label: 'Your rate', value: (r) => (r.type === 'EARNED' ? pct(r.handlerParcentage) : ''), pdf: (r) => (r.type === 'EARNED' ? pct(r.handlerParcentage) : '') },
      { label: 'Net', value: (r) => (r.net == null ? '' : csvNumber(r.net)), pdf: (r) => (r.net == null ? '' : money(r.net)) },
    ];
  }

  return [
    ...shared,
    { label: 'Ledger', value: (r) => accountLabelOf(r.account), pdf: (r) => accountLabelOf(r.account) },
    { label: 'Handler', value: (r) => r.handlerName || r.caseworkerName || '', pdf: (r) => r.handlerName || r.caseworkerName || '' },
    { label: 'Amount (GBP)', value: (r) => csvNumber(signedAmount(r)), pdf: (r) => money(signedAmount(r)) },
    { label: 'Net', value: (r) => (r.net == null ? '' : csvNumber(r.net)), pdf: (r) => (r.net == null ? '' : money(r.net)) },
    { label: 'VAT', value: (r) => (r.vat == null ? '' : csvNumber(r.vat)), pdf: (r) => (r.vat == null ? '' : money(r.vat)) },
    {
      label: 'Split % (H/HQ/EL)',
      value: (r) =>
        r.type === 'EARNED' && r.handlerParcentage != null
          ? `${r.handlerParcentage}/${r.hqParcentage ?? '—'}/${r.elParcentage ?? '—'}`
          : '',
      pdf: (r) =>
        r.type === 'EARNED' && r.handlerParcentage != null
          ? `${r.handlerParcentage}/${r.hqParcentage ?? '—'}/${r.elParcentage ?? '—'}`
          : '',
    },
  ];
}


/** RFC-4180 escaping: quote anything containing a delimiter, quote or newline. */
function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  }
  // The BOM keeps Excel from mangling the £ sign; CRLF is the RFC default.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Let the download start before the object URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function statementFilename(scope, from, to, extension) {
  return `lexflow-statement-${scope}-${dateOnly(from) || 'from'}-${dateOnly(to) || 'to'}.${extension}`;
}

export function exportStatementCsv({ scope, rows, from, to }) {
  const columns = statementColumns(scope);
  downloadBlob(
    statementFilename(scope, from, to, 'csv'),
    toCsv(columns, rows),
    'text/csv;charset=utf-8'
  );
}

/**
 * Build and download the PDF. jsPDF and jspdf-autotable are imported here so
 * they are only fetched when the user actually asks for a PDF.
 */
export async function exportStatementPdf({ scope, rows, from, to, owner, totals }) {
  const [jspdfModule, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const { jsPDF } = jspdfModule;
  const autoTable = autoTableModule.default || autoTableModule.autoTable;

  const columns = statementColumns(scope);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(16);
  doc.text('LexFlow — Statement', 40, 42);

  doc.setFontSize(10);
  doc.text(
    [
      `Account: ${owner?.name || '—'}`,
      `Scope: ${scope === 'firm' ? 'Firm-wide' : 'Personal'}`,
      `Period: ${dateOnly(from)} to ${dateOnly(to)}`,
      `Generated: ${dateTime(new Date())}`,
    ].join('   ·   '),
    40,
    62
  );

  // Totals describe the whole period, so they are printed above the table
  // rather than after the rows that happen to fit on the last page.
  doc.setFontSize(9);
  doc.text(
    `Earned ${money(totals?.earned)}   ·   Reserved ${money(totals?.reserved)}   ·   Paid out ${money(totals?.paidOut)}` +
      (scope === 'firm'
        ? `   ·   Client payments (gross) ${money(totals?.paymentGross)}   ·   VAT recorded ${money(totals?.paymentVat)}`
        : ''),
    40,
    78
  );

  autoTable(doc, {
    startY: 92,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => c.pdf(row))),
    styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [8, 11, 26], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.text(
        `Page ${doc.internal.getNumberOfPages()} · LexFlow statement · generated ${dateTime(new Date())}`,
        40,
        doc.internal.pageSize.getHeight() - 20
      );
    },
  });

  doc.save(statementFilename(scope, from, to, 'pdf'));
}
