import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

// Global singleton to prevent pool/connection exhaustion across HMR reloads
interface GlobalDB {
  pgPool?: pg.Pool;
  pglite?: PGlite;
  mode?: 'REMOTE' | 'LOCAL-PGLITE';
}

const globalForDB = globalThis as unknown as GlobalDB;

function getRemoteUrl(): string | null {
  return process.env.DATABASE_URL || process.env.DIRECT_URL || null;
}

function maskCredentials(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/postgresql:\/\/([^:]+):([^@]+)@/g, 'postgresql://$1:****@')
    .replace(/:([^:@]{3,})@/g, ':****@');
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) || Boolean(process.env.CRON);
}

export async function getDBClient() {
  const remoteUrl = getRemoteUrl();
  const isProd = isProductionEnv();

  // Fail-Fast: In production / Vercel / Cron environments, remote URL is strictly required.
  if (isProd && !remoteUrl) {
    throw new Error('[DB Client] [Fail-Fast] Production environment detected (NODE_ENV=production, VERCEL, or CRON), but no DATABASE_URL or DIRECT_URL is configured. PGlite fallback is strictly forbidden.');
  }

  // Try Remote Supabase Pool if URL exists
  if (remoteUrl && !globalForDB.pgPool && globalForDB.mode !== 'LOCAL-PGLITE') {
    try {
      const pool = new pg.Pool({
        connectionString: remoteUrl,
        ssl: remoteUrl.includes('localhost') ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
        max: 10
      });

      // Quick probe to test connection
      const client = await pool.connect();
      client.release();
      globalForDB.pgPool = pool;
      globalForDB.mode = 'REMOTE';
      return {
        query: async (text: string, params: any[] = []) => {
          return await globalForDB.pgPool!.query(text, params);
        },
        mode: 'REMOTE' as const
      };
    } catch (err: any) {
      const safeErr = maskCredentials(err.message);
      if (isProd) {
        throw new Error(`[DB Client] [Fail-Fast] Remote connection to Supabase failed in production environment (${safeErr}). PGlite fallback is strictly forbidden.`);
      }
      console.warn(`[DB Client] Remote connection to Supabase failed (${safeErr}). Falling back to local PGlite.`);
      globalForDB.mode = 'LOCAL-PGLITE';
    }
  }

  if (globalForDB.pgPool && globalForDB.mode === 'REMOTE') {
    return {
      query: async (text: string, params: any[] = []) => {
        return await globalForDB.pgPool!.query(text, params);
      },
      mode: 'REMOTE' as const
    };
  }

  // Fail-Fast: Never fall back to PGlite in production
  if (isProd) {
    throw new Error('[DB Client] [Fail-Fast] Remote DB pool unavailable in production environment. PGlite fallback is strictly forbidden.');
  }

  // Local PGlite Fallback
  if (!globalForDB.pglite) {
    const dbPath = path.resolve(process.cwd(), 'data/postgres_fresh');
    fs.mkdirSync(dbPath, { recursive: true });

    const pidFile = path.join(dbPath, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try { fs.unlinkSync(pidFile); } catch {}
    }

    globalForDB.pglite = new PGlite(dbPath);
    await globalForDB.pglite.waitReady;
    globalForDB.mode = 'LOCAL-PGLITE';
  }

  return {
    query: async (text: string, params: any[] = []) => {
      return await globalForDB.pglite!.query(text, params);
    },
    mode: 'LOCAL-PGLITE' as const
  };
}

export async function dbQuery<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const db = await getDBClient();
  const res = await db.query(text, params);
  return (res.rows || []) as T[];
}

