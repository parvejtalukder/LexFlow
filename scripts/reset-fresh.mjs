#!/usr/bin/env node
/**
 * reset-fresh.mjs — returns the application to a brand-new state, keeping a
 * single administrator.
 *
 * DELETES: every user except the kept admin, all cases, payments, profit
 *          distributions, withdrawals, audit logs, complaints and files, the
 *          bytes of every uploaded document (GridFS bucket `media`), and every
 *          other Firebase Auth account.
 * KEEPS:   the admin user document (untouched) and the practices collection,
 *          which is firm configuration the approval flow requires.
 *
 * Wallet balances are derived, never stored (computeWalletBalance in
 * src/lib/wallet.js), so emptying the distributions and withdrawals drops every
 * wallet - personal and HQ/EL - to £0.00 with no extra bookkeeping.
 *
 * Usage from the repo root:
 *   npm run reset:fresh                    # dry run - prints exactly what goes
 *   npm run reset:fresh -- --yes           # backs everything up, then deletes
 *   npm run reset:fresh -- --keep=other@example.com --yes
 *
 * Flags:
 *   --yes              perform the deletion (omitted => report only)
 *   --keep=<email>     administrator to preserve (default pht.cse@gmail.com)
 *   --out=<dir>        backup directory (default backups/<timestamp>)
 *   --db=<name>        database name (default lawapp)
 *   --skip-firebase    leave Firebase Auth accounts alone
 *   --help             show this text
 *
 * The dry run is always safe: it connects, reads, prints, and writes nothing.
 */

import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { MongoClient, GridFSBucket, ObjectId, BSON } from 'mongodb';
import fbAdmin from 'firebase-admin';

const DEFAULT_DB = 'lawapp';
const MEDIA_BUCKET = 'media';
const DEFAULT_KEEP = 'pht.cse@gmail.com';

/** Collections emptied in full. */
const WIPE_ALL = [
  'cases',
  'payments',
  'profitDistributions',
  'withdrawals',
  'auditLogs',
  'complaints',
  'files',
];

/** Collections that must survive untouched; re-counted afterwards as proof. */
const PRESERVED = ['practices'];

function usage() {
  const line = (flag, text) => `  ${String(flag).padEnd(16)}${text}`;
  const cont = (text) => `  ${''.padEnd(16)}${text}`;

  console.log(`Usage: node --env-file=.env scripts/reset-fresh.mjs [--yes] [--keep=<email>] [--out=<dir>] [--db=<name>] [--skip-firebase]

${line('(no flags)', 'Dry run: prints every count and what would be removed, writes nothing.')}
${line('--yes', 'Applies the reset, after dumping a backup of everything it removes.')}
${line('--keep=<email>', `Admin to keep. Default ${DEFAULT_KEEP}. The run aborts if`)}
${cont('that account does not exist, so wiping every user cannot')}
${cont('happen through a typo.')}
${line('--out=<dir>', 'Backup directory. Default backups/<timestamp>.')}
${line('--db=<name>', `Database name. Default ${DEFAULT_DB}.`)}
${line('--skip-firebase', 'Leave Firebase Auth accounts alone.')}
${line('--help', 'Show this text.')}

Empties ${WIPE_ALL.join(', ')}, the media bytes, and every user except the kept admin.
Preserves ${PRESERVED.join(', ')} and the admin document.`);
}

function parseArgs(argv) {
  const args = { execute: false, keep: DEFAULT_KEEP, out: null, db: null, help: false, firebase: true };

  for (const raw of argv) {
    if (raw === '--yes') args.execute = true;
    else if (raw === '--help' || raw === '-h') args.help = true;
    else if (raw === '--skip-firebase') args.firebase = false;
    else if (raw.startsWith('--keep=')) args.keep = raw.slice('--keep='.length).trim();
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

/** Extended JSON, one document per line - mongosh can read this back directly. */
function ejsonLines(docs) {
  return `${docs.map((doc) => BSON.EJSON.stringify(doc)).join('\n')}\n`;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function countRows(db, name) {
  try {
    return await db.collection(name).countDocuments();
  } catch {
    return 0;
  }
}

/** One aligned `label  value` row, so columns line up for every name length. */
function row(name, value, note = '') {
  console.log(`  ${String(name).padEnd(19)} ${value}${note ? `  ${note}` : ''}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is missing. Run it as: node --env-file=.env scripts/reset-fresh.mjs');
    process.exit(1);
  }

  const dbName = args.db || process.env.MONGODB_NAME || DEFAULT_DB;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(dbName);

  console.log(`Database      : ${dbName}`);
  console.log(`Keeping admin : ${args.keep}\n`);

  const users = await db.collection('users').find({}).toArray();
  const kept = users.find((u) => String(u.email || '').toLowerCase() === args.keep.toLowerCase());

  // Never continue without a surviving administrator: a full user wipe must not
  // be possible through a typo in --keep.
  if (!kept) {
    console.error(`ABORT: no user with the email ${args.keep} exists, so nothing was touched.`);
    console.error(`Users present: ${users.map((u) => u.email || '(no email)').join(', ')}`);
    await client.close();
    process.exit(1);
  }

  const doomedUsers = users.filter((u) => u._id.toString() !== kept._id.toString());
  const files = await db.collection('files').find({}).toArray();

  console.log('Would remove:');
  row('users', doomedUsers.length);
  for (const name of WIPE_ALL) {
    row(name, await countRows(db, name));
  }
  row('media.files', await countRows(db, 'media.files'), '(uploaded bytes + metadata)');
  if (args.firebase) row('firebase accounts', `all except ${kept.email}`);
  else row('firebase accounts', '(skipped by --skip-firebase)');

  console.log('\nWould keep:');
  row('users', kept.email, `(${kept.role} / ${kept.accountStatus})`);
  for (const name of PRESERVED) {
    row(name, await countRows(db, name), '(firm configuration)');
  }

  if (!args.execute) {
    console.log('\nDry run - nothing was written. Re-run with --yes to apply.');
    await client.close();
    return;
  }

  // ---------------------------------------------------------------- backup --
  const outDir = args.out || path.join('backups', stamp());
  await fs.mkdir(path.join(outDir, 'media'), { recursive: true });

  for (const name of WIPE_ALL) {
    const docs = await db.collection(name).find({}).toArray();
    if (docs.length > 0) await fs.writeFile(path.join(outDir, `${name}.jsonl`), ejsonLines(docs));
  }
  await fs.writeFile(path.join(outDir, 'users-removed.jsonl'), ejsonLines(doomedUsers));

  // The bytes themselves, so the backup is restorable rather than only metadata.
  //
  // Driven by the GridFS metadata (`media.files`) rather than the app's `files`
  // collection: a blob whose record is missing would otherwise survive the reset as
  // an invisible leftover, which is the opposite of a clean slate. Uploads that were
  // de-duplicated share one stored file, so the app records supply a friendly name.
  const bucket = new GridFSBucket(db, { bucketName: MEDIA_BUCKET });
  const nameByFileId = new Map();
  for (const file of files) {
    const id = file.fileId?.toString?.();
    if (id && !nameByFileId.has(id)) nameByFileId.set(id, file.fileName);
  }

  const stored = await db.collection(`${MEDIA_BUCKET}.files`).find({}).toArray();
  const mediaIds = [];
  for (const blob of stored) {
    const id = blob._id;
    mediaIds.push(id);

    const friendly = nameByFileId.get(id.toString()) || blob.filename || 'orphan';
    const safeName = String(friendly).replace(/[^\w.\- ]+/g, '_');
    try {
      await new Promise((resolve, reject) => {
        bucket
          .openDownloadStream(id)
          .pipe(createWriteStream(path.join(outDir, 'media', `${id}-${safeName}`)))
          .on('error', reject)
          .on('finish', resolve);
      });
    } catch (error) {
      console.warn(`  ! could not back up media ${id}: ${error.message}`);
    }
  }

  console.log(`\nBackup written to ${outDir} (${mediaIds.length} media file(s))`);
  console.log('Applying the reset...\n');

  // ----------------------------------------------------------------- apply --
  // Bytes before metadata: an interruption can only leave orphaned blobs, never a
  // record whose bytes are already gone.
  let mediaDeleted = 0;
  for (const id of mediaIds) {
    try {
      await bucket.delete(id);
      mediaDeleted += 1;
    } catch (error) {
      if (error?.code !== 'FILE_NOT_FOUND') throw error;
    }
  }

  const deleted = {};
  for (const name of WIPE_ALL) {
    deleted[name] = (await db.collection(name).deleteMany({})).deletedCount;
  }
  deleted.users = (
    await db.collection('users').deleteMany({ _id: { $in: doomedUsers.map((u) => u._id) } })
  ).deletedCount;

  // Sweep the bucket: anything still there (a blob whose metadata row had already
  // gone, or one whose delete failed above) would leave the media store not actually
  // empty, which is the whole point of this run.
  const strays = await db.collection(`${MEDIA_BUCKET}.files`).countDocuments();
  if (strays > 0) {
    deleted.mediaLeftovers = (
      await db.collection(`${MEDIA_BUCKET}.files`).deleteMany({})
    ).deletedCount;
    await db.collection(`${MEDIA_BUCKET}.chunks`).deleteMany({});
  }

  // -------------------------------------------------------------- firebase --
  let fbDeleted = 0;
  if (args.firebase) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.warn('  ! FIREBASE_SERVICE_ACCOUNT is not set - Firebase accounts were left alone.');
    } else {
      if (!fbAdmin.apps.length) {
        fbAdmin.initializeApp({
          credential: fbAdmin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        });
      }
      const list = await fbAdmin.auth().listUsers(1000);
      for (const account of list.users) {
        if (account.uid === kept.uid) continue;
        try {
          await fbAdmin.auth().deleteUser(account.uid);
          fbDeleted += 1;
          console.log(`  firebase deleted: ${account.email || account.uid}`);
        } catch (error) {
          console.warn(`  ! firebase: could not delete ${account.email || account.uid}: ${error.message}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------- verify --
  console.log('\nAfter the reset:');
  row('users', await countRows(db, 'users'), '(expected 1)');
  for (const name of WIPE_ALL) {
    row(name, await countRows(db, name), '(expected 0)');
  }
  row('media.files', await countRows(db, 'media.files'), '(expected 0)');
  row('media.chunks', await countRows(db, 'media.chunks'), '(expected 0)');
  for (const name of PRESERVED) {
    row(name, await countRows(db, name), '(kept)');
  }

  const survivor = await db.collection('users').findOne({ _id: kept._id });
  if (!survivor) {
    console.error('\nPROBLEM: the kept admin document is missing. Restore it from the backup above.');
    process.exitCode = 1;
  } else {
    console.log(
      `\nSurviving admin: ${survivor.email} | ${survivor.role} / ${survivor.accountStatus} | uid ${survivor.uid}`
    );
  }

  console.log(`Deleted: ${JSON.stringify(deleted)}`);
  console.log(`Media bytes removed: ${mediaDeleted} | Firebase accounts removed: ${fbDeleted}`);
  console.log(`Backup: ${outDir}`);

  await client.close();
}

main().catch((error) => {
  console.error('\nreset-fresh failed:', error);
  process.exit(1);
});


