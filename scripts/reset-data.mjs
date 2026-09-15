#!/usr/bin/env node
/**
 * reset-data.mjs — clears every transactional record while keeping the people
 * and their uploaded documents.
 *
 * DELETES: cases, payments, profitDistributions, withdrawals, auditLogs, plus any
 *          file attached to a case (`associatedType: 'Case'`) and its GridFS bytes.
 * KEEPS:   users, practices, every file that is not attached to a case, and all
 *          media bytes (avatars, ID/licence documents).
 *
 * Usage from the repo root:
 *   npm run reset:data          # dry run — prints exactly what would be removed
 *   npm run reset:data:apply    # writes a backup, then removes it
 *
 * Flags:
 *   --yes          perform the deletion (omitted => report only, nothing written)
 *   --out=<dir>    backup directory (default: backups/<timestamp>)
 *   --db=<name>    override the database name (default: MONGODB_NAME || 'lawapp')
 *   --help         show this text
 *
 * Wallet balances are derived, never stored: computeWalletBalance() in
 * src/lib/wallet.js sums profitDistributions.handlerAmount and the withdrawals, so
 * emptying those collections drops every wallet — and the HQ/EL figures from
 * computeCompanyBalance() — to £0.00 with no extra bookkeeping.
 *
 * Collection names mirror src/lib/collections.js; this script cannot import that
 * module because it resolves '@/' path aliases that plain Node does not know.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { MongoClient, GridFSBucket, BSON } from 'mongodb';

const DEFAULT_DB = 'lawapp';
const MEDIA_BUCKET = 'media';

/** Collections emptied in full. */
const WIPE_ALL = ['cases', 'payments', 'profitDistributions', 'withdrawals', 'auditLogs'];

/**
 * Files are pruned only when they hang off a record that is being deleted. Case
 * creation stamps `associatedType: 'Case'` on every document it attaches
 * (src/app/api/cases/route.js), so that — plus an exact `associatedId` match on a
 * case being deleted — is the only attachment this script drops.
 */
const CASE_ATTACHMENT_TYPE = 'Case';

/** Collections that must survive untouched; re-counted afterwards as proof. */
const PRESERVED_COLLECTIONS = ['users', 'practices', 'media.files', 'media.chunks'];

function usage() {
  console.log(`Usage: node --env-file=.env scripts/reset-data.mjs [--yes] [--out=<dir>] [--db=<name>]

  (no flags)   Dry run: connects, prints the counts and every document that would
               be deleted, then exits without writing anything.
  --yes        Performs the deletion after dumping a backup of everything removed.
  --out=<dir>  Backup directory (default: backups/<ISO timestamp>).
  --db=<name>  Database to target. Defaults to MONGODB_NAME, then 'lawapp'.

Targets ${WIPE_ALL.join(', ')}.
Preserves ${PRESERVED_COLLECTIONS.join(', ')}, files not attached to a case, and media bytes.`);
}

function parseArgs(argv) {
  const args = { execute: false, out: null, db: null, help: false };

  for (const raw of argv) {
    if (raw === '--yes') args.execute = true;
    else if (raw === '--help' || raw === '-h') args.help = true;
    else if (raw.startsWith('--out=')) args.out = raw.slice('--out='.length);
    else if (raw.startsWith('--db=')) args.db = raw.slice('--db='.length);
    else {
      console.error(`Unknown argument: ${raw}\n`);
      usage();
      process.exit(2);
    }
  }

  return args;
}

const money = (value) => `£${(Number(value) || 0).toFixed(2)}`;

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const objectIdOf = (value) => (value ? String(value) : null);

function heading(text) {
  console.log(`\n${text}\n${'-'.repeat(text.length)}`);
}

function abort(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(2);
}

/** Host portion of the connection string, credentials stripped, for the report. */
function safeTarget(uri) {
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '(unparsed connection string)';
  }
}

async function countRows(db, name) {
  return db.collection(name).countDocuments();
}

/**
 * Every media id any user points at (avatar fields), as strings, so the script can
 * never delete bytes that are still rendering somewhere.
 */
async function photoMediaIds(db) {
  const ids = new Set();
  const users = await db.collection('users').find({}).toArray();

  for (const user of users) {
    for (const value of [user.photoFileId, user.photoURL]) {
      if (!value) continue;
      const text = String(value);
      const embedded = text.match(/\/api\/media\/([a-f0-9]{24})/i);
      ids.add(embedded ? embedded[1] : text);
    }
  }

  return ids;
}

async function buildPlan(db) {
  const caseIds = new Set(
    (await db.collection('cases').find({}).project({ _id: 1 }).toArray()).map((doc) => String(doc._id))
  );

  const wipe = [];
  for (const name of WIPE_ALL) {
    wipe.push({ name, count: await countRows(db, name) });
  }

  const allFiles = await db.collection('files').find({}).toArray();
  const isCaseAttachment = (file) =>
    file.associatedType === CASE_ATTACHMENT_TYPE ||
    (file.associatedId != null && caseIds.has(String(file.associatedId)));

  const pruneFiles = allFiles.filter(isCaseAttachment);
  const keptFiles = allFiles.filter((file) => !isCaseAttachment(file));

  const preserved = [];
  for (const name of PRESERVED_COLLECTIONS) {
    preserved.push({ name, count: await countRows(db, name) });
  }
  preserved.push({ name: 'files (kept)', collection: 'files', count: keptFiles.length });

  // Media bytes of files we keep must survive, and so must every avatar.
  const keptMediaIds = new Set(keptFiles.filter((file) => file.fileId).map((file) => String(file.fileId)));
  const avatarIds = await photoMediaIds(db);

  const pruneMediaIds = pruneFiles.filter((file) => file.fileId).map((file) => file.fileId);
  const conflicts = [];
  for (const id of pruneMediaIds) {
    if (keptMediaIds.has(String(id))) {
      conflicts.push(`${objectIdOf(id)} is still referenced by a file that is being kept`);
    } else if (avatarIds.has(String(id))) {
      conflicts.push(`${objectIdOf(id)} is used as a user's profile photo`);
    }
  }

  return {
    wipe,
    wipeTotal: wipe.reduce((sum, entry) => sum + entry.count, 0),
    pruneFiles,
    keptFiles,
    pruneMediaIds,
    preserved,
    conflicts,
  };
}

function reportPlan(plan, dbName, target) {
  heading(`Database: ${dbName} (${target})`);

  console.log('Will be deleted:');
  for (const { name, count } of plan.wipe) {
    console.log(`  ${name.padEnd(24)} ${String(count).padStart(6)} document(s)`);
  }
  console.log(
    `  ${'files (case attachments)'.padEnd(24)} ${String(plan.pruneFiles.length).padStart(6)} document(s)` +
      ` + ${plan.pruneMediaIds.length} media blob(s)`
  );
  console.log(`  ${'TOTAL'.padEnd(24)} ${String(plan.wipeTotal + plan.pruneFiles.length).padStart(6)} document(s)`);

  console.log('\nWill be kept:');
  for (const { name, count } of plan.preserved) {
    console.log(`  ${name.padEnd(24)} ${String(count).padStart(6)} document(s)`);
  }

  if (plan.pruneFiles.length > 0) {
    console.log('\nCase attachments to remove:');
    for (const file of plan.pruneFiles) {
      const bytes = file.fileId ? `gridfs:${objectIdOf(file.fileId)}` : 'remote url only';
      console.log(
        `  - ${objectIdOf(file._id)} | ${file.fileName || '(no name)'} | ${file.associatedType || 'untyped'} | ${bytes}`
      );
    }
  }

  if (plan.wipeTotal + plan.pruneFiles.length === 0) {
    console.log('\nNothing matches the reset scope — the database is already clean.');
  }
}

async function writeManifest(outDir, data) {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(data, null, 2)}\n`);
}

/** One EJSON document per line, so ObjectIds survive a round-trip by hand. */
function ejsonLines(docs) {
  if (docs.length === 0) return '';
  return `${docs.map((doc) => BSON.EJSON.stringify(doc, { relaxed: false })).join('\n')}\n`;
}

/** Dump every document this run removes, so the wipe can be replayed by hand. */
async function writeBackup(db, plan, outDir) {
  await fs.mkdir(outDir, { recursive: true });

  const dumped = {};
  for (const { name } of plan.wipe) {
    const docs = await db.collection(name).find({}).toArray();
    if (docs.length > 0) {
      await fs.writeFile(path.join(outDir, `${name}.jsonl`), ejsonLines(docs));
    }
    dumped[name] = docs.length;
  }

  if (plan.pruneFiles.length > 0) {
    await fs.writeFile(path.join(outDir, 'files-pruned.jsonl'), ejsonLines(plan.pruneFiles));
  }

  return dumped;
}

/**
 * Bytes go before metadata: interrupting this at any point can only leave orphaned
 * blobs, never a document whose bytes are gone.
 */
async function applyWipe(db, plan) {
  const bucket = new GridFSBucket(db, { bucketName: MEDIA_BUCKET });

  let mediaDeleted = 0;
  for (const fileId of plan.pruneMediaIds) {
    try {
      await bucket.delete(fileId);
      mediaDeleted += 1;
    } catch (error) {
      if (error?.code !== 'FILE_NOT_FOUND') throw error;
      console.warn(`  ! media ${objectIdOf(fileId)} had no bytes left (already removed)`);
    }
  }

  let filesDeleted = 0;
  if (plan.pruneFiles.length > 0) {
    const ids = plan.pruneFiles.map((file) => file._id);
    filesDeleted = (await db.collection('files').deleteMany({ _id: { $in: ids } })).deletedCount;
  }

  const deleted = {};
  for (const { name } of plan.wipe) {
    deleted[name] = (await db.collection(name).deleteMany({})).deletedCount;
  }

  return { mediaDeleted, filesDeleted, deleted };
}

/** Re-count everything afterwards and prove the preserved data is still there. */
async function verify(db, plan, result) {
  const problems = [];

  for (const { name, collection, count } of plan.preserved) {
    if (name === 'media.files' || name === 'media.chunks') continue;
    const actual = await countRows(db, collection || name);
    // Users and practices only ever grow concurrently, so a shortfall means data
    // loss; `files` has an exact expected value because we know what we pruned.
    const concurrentOnly = name === 'users' || name === 'practices';
    const intact = concurrentOnly ? actual >= count : actual === count;
    if (!intact) problems.push(`${name}: expected ${concurrentOnly ? 'at least ' : ''}${count}, found ${actual}`);
  }

  // Kept files must all survive; case attachments are the only intended loss.
  const filesAfter = await countRows(db, 'files');
  if (filesAfter !== plan.keptFiles.length) {
    problems.push(`files: expected ${plan.keptFiles.length}, found ${filesAfter}`);
  }

  const mediaFilesBefore = plan.preserved.find((entry) => entry.name === 'media.files')?.count ?? 0;
  const chunksBefore = plan.preserved.find((entry) => entry.name === 'media.chunks')?.count ?? 0;
  const mediaFilesAfter = await countRows(db, 'media.files');
  const chunksAfter = await countRows(db, 'media.chunks');

  if (mediaFilesAfter !== mediaFilesBefore - result.mediaDeleted) {
    problems.push(
      `media.files: expected ${mediaFilesBefore - result.mediaDeleted}, found ${mediaFilesAfter}`
    );
  }
  if (chunksAfter > chunksBefore) {
    problems.push(`media.chunks grew unexpectedly (${chunksBefore} -> ${chunksAfter})`);
  }

  const survivors = {};
  for (const name of WIPE_ALL) {
    const left = await countRows(db, name);
    survivors[name] = left;
    if (left !== 0) problems.push(`${name}: ${left} document(s) survived the wipe`);
  }

  const distributions = await db.collection('profitDistributions').find({}).toArray();
  const earned = distributions.reduce((sum, doc) => sum + (Number(doc.handlerAmount) || 0), 0);

  return { problems, survivors, earned, files: filesAfter, mediaFiles: mediaFilesAfter, chunks: chunksAfter };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    abort(
      'MONGODB_URI is not set. Run via npm (npm run reset:data), which passes --env-file=.env, or use:\n' +
        '  node --env-file=.env scripts/reset-data.mjs'
    );
  }

  const dbName = args.db || process.env.MONGODB_NAME || DEFAULT_DB;
  if (!process.env.MONGODB_NAME && !args.db) {
    console.warn(`! MONGODB_NAME is not set — defaulting to "${DEFAULT_DB}", the name the app hardcodes.`);
  }
  if (dbName !== DEFAULT_DB && !args.db) {
    abort(
      `Resolved database is "${dbName}", but the app always reads and writes "${DEFAULT_DB}".\n` +
        `  Re-run with --db=${dbName} if that is genuinely the database you mean.`
    );
  }

  const outDir = args.out || path.join('backups', timestamp());
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });

    const plan = await buildPlan(db);
    reportPlan(plan, dbName, safeTarget(uri));

    if (plan.conflicts.length > 0) {
      console.error('\n✖ Refusing to continue — media that is still in use would be deleted:');
      for (const conflict of plan.conflicts) console.error(`  - ${conflict}`);
      process.exitCode = 1;
      return;
    }

    if (!args.execute) {
      heading('Dry run');
      console.log('Nothing was deleted. Apply it with:  npm run reset:data:apply');
      return;
    }

    if (plan.wipeTotal + plan.pruneFiles.length === 0) {
      heading('Nothing to do');
      console.log('Every target collection is already empty; no backup was written.');
      return;
    }

    const manifest = {
      database: dbName,
      target: safeTarget(uri),
      backupDir: path.resolve(outDir),
      startedAt: new Date().toISOString(),
      status: 'in-progress',
      planned: {
        documents: await writeBackup(db, plan, outDir),
        caseAttachments: plan.pruneFiles.length,
        mediaBlobs: plan.pruneMediaIds.length,
      },
      preserved: Object.fromEntries(plan.preserved.map((entry) => [entry.name, entry.count])),
    };

    heading('Backup');
    await writeManifest(outDir, manifest);
    console.log(`Backup written to ${path.resolve(outDir)}`);
    for (const [name, count] of Object.entries(manifest.planned.documents)) {
      console.log(`  ${name.padEnd(24)} ${String(count).padStart(6)} document(s)`);
    }

    heading('Deleting');
    const result = await applyWipe(db, plan);
    console.log(`  ${'media blobs'.padEnd(24)} ${String(result.mediaDeleted).padStart(6)} removed`);
    console.log(`  ${'files'.padEnd(24)} ${String(result.filesDeleted).padStart(6)} document(s)`);
    for (const name of WIPE_ALL) {
      console.log(`  ${name.padEnd(24)} ${String(result.deleted[name] || 0).padStart(6)} document(s)`);
    }

    const check = await verify(db, plan, result);

    heading('Verification');
    for (const [name, count] of Object.entries(check.survivors)) {
      console.log(`  ${name.padEnd(24)} ${String(count).padStart(6)} remaining`);
    }
    console.log(`  ${'files'.padEnd(24)} ${String(check.files).padStart(6)} kept`);
    console.log(`  ${'media.files'.padEnd(24)} ${String(check.mediaFiles).padStart(6)} kept`);
    console.log(`  ${'media.chunks'.padEnd(24)} ${String(check.chunks).padStart(6)} kept`);
    console.log(`  ${'wallet totalEarned'.padEnd(24)} ${money(check.earned)} across all users`);

    manifest.status = check.problems.length === 0 ? 'complete' : 'complete-with-problems';
    manifest.finishedAt = new Date().toISOString();
    manifest.deleted = result;
    manifest.remaining = check.survivors;
    manifest.walletTotalEarned = check.earned;
    manifest.problems = check.problems;
    await writeManifest(outDir, manifest);

    if (check.problems.length > 0) {
      console.error('\n✖ Verification found problems:');
      for (const problem of check.problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
      return;
    }

    heading('Done');
    console.log('Transactional data cleared; users, practices and their files are intact.');
    console.log(`Manifest: ${path.join(path.resolve(outDir), 'manifest.json')}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`);
  process.exitCode = 1;
});