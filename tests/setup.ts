import { randomBytes, randomUUID } from 'node:crypto';
process.env.APP_MODE = 'local';
process.env.DATA_DIR = `.local/vitest-${randomUUID()}`;
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.TOKEN_SECRET = randomBytes(32).toString('base64');
process.env.DOCUMENTS_ENABLED = 'false';
process.env.SIGNATURE_ENABLED = 'false';

process.env.MASAK_INTAKE_ENABLED = 'true';
