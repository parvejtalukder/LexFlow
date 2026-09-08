import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

function loadServiceAccount() {
  // 1. Full JSON in a single env var (best for Vercel / CI).
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  // 2. Individual env fields.
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
    process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  // 3. Local service-account file (git-ignored).
  const filePath = path.join(
    process.cwd(),
    'src',
    'lib',
    'lawFirebaseAdmin.json'
  );
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  throw new Error(
    'Firebase Admin credentials are missing. Provide FIREBASE_SERVICE_ACCOUNT ' +
      '(full JSON), the FIREBASE_* fields, or src/lib/lawFirebaseAdmin.json.'
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
}

export default admin;

