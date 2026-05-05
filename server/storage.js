import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE_KEY = 'main';

export class StateConflictError extends Error {
  constructor(message = 'State revision conflict.') {
    super(message);
    this.name = 'StateConflictError';
    this.statusCode = 409;
  }
}

function stateKey() {
  return process.env.APP_STATE_KEY || DEFAULT_STATE_KEY;
}

export function createMemoryStore() {
  const states = new Map();
  return {
    async getState() {
      return states.get(stateKey()) ?? null;
    },
    async saveState(state, expectedRevision = 0) {
      const key = stateKey();
      const current = states.get(key);
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== expectedRevision) throw new StateConflictError();
      const nextRevision = currentRevision + 1;
      states.set(key, { state, revision: nextRevision });
      return nextRevision;
    },
    async close() {},
  };
}

export function createFileStore() {
  const filePath = process.env.STATE_FILE || path.resolve(process.cwd(), '.data', 'state.json');
  return {
    async getState() {
      try {
        const file = JSON.parse(await readFile(filePath, 'utf8'));
        if (file && typeof file === 'object' && 'state' in file && 'revision' in file) return file;
        return { state: file, revision: 1 };
      } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
      }
    },
    async saveState(state, expectedRevision = 0) {
      const current = await this.getState();
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== expectedRevision) throw new StateConflictError();
      await mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({ state, revision: currentRevision + 1 }, null, 2));
      await rename(temporaryPath, filePath);
      return currentRevision + 1;
    },
    async close() {},
  };
}

export async function createPostgresStore() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when DATABASE_DRIVER=postgres.');
  }

  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 5000),
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      key text PRIMARY KEY,
      state jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query('ALTER TABLE app_state ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0');

  return {
    async getState() {
      const result = await pool.query('SELECT state, revision FROM app_state WHERE key = $1', [stateKey()]);
      const row = result.rows[0];
      return row ? { state: row.state, revision: row.revision } : null;
    },
    async saveState(state, expectedRevision = 0) {
      const key = stateKey();
      const nextRevision = expectedRevision + 1;
      const update = await pool.query(
        `UPDATE app_state
         SET state = $2::jsonb, revision = $3, updated_at = now()
         WHERE key = $1 AND revision = $4`,
        [key, JSON.stringify(state), nextRevision, expectedRevision],
      );
      if (update.rowCount === 1) return nextRevision;

      if (expectedRevision === 0) {
        const insert = await pool.query(
          `INSERT INTO app_state (key, state, revision, updated_at)
           VALUES ($1, $2::jsonb, 1, now())
           ON CONFLICT DO NOTHING`,
          [key, JSON.stringify(state)],
        );
        if (insert.rowCount === 1) return 1;
      }

      throw new StateConflictError();
    },
    async close() {
      await pool.end();
    },
  };
}

export async function createStateStore() {
  const driver = process.env.DATABASE_DRIVER || (process.env.DATABASE_URL ? 'postgres' : 'file');
  if (driver === 'postgres') return createPostgresStore();
  if (driver === 'memory') return createMemoryStore();
  if (driver === 'file') return createFileStore();
  throw new Error(`Unsupported DATABASE_DRIVER "${driver}". Use postgres, file, or memory.`);
}
