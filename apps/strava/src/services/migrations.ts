import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export type MigrationFile = {
  version: string;
  name: string;
  filename: string;
  fullPath: string;
};

const getMigrationDirectory = () => {
  const baseDir = path.join(__dirname, '..', '..');
  return path.join(baseDir, 'migrations');
};

const parseMigrationName = (filename: string): { version: string; name: string } => {
  const base = filename.replace(/\.sql$/i, '');
  const [versionPart, ...rest] = base.split('_');
  if (/^\d+$/.test(versionPart)) {
    return { version: versionPart, name: rest.join('_') || base };
  }
  return { version: base, name: base };
};

export const listMigrationFiles = (): MigrationFile[] => {
  const dir = getMigrationDirectory();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
  return files.map((filename) => {
    const parsed = parseMigrationName(filename);
    return {
      version: parsed.version,
      name: parsed.name,
      filename,
      fullPath: path.join(dir, filename),
    };
  });
};

export const createMigrationPool = () => {
  return new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
};

export const ensureMigrationsTable = async (pool: Pool, schema: string) => {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name TEXT,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

export const fetchAppliedMigrations = async (pool: Pool, schema: string) => {
  const result = await pool.query(`SELECT version FROM ${schema}.schema_migrations`);
  return new Set(result.rows.map((row: any) => String(row.version)));
};

export const checkPendingMigrations = async () => {
  const schema = process.env.DB_SCHEMA || 'public';
  const pool = createMigrationPool();
  try {
    await ensureMigrationsTable(pool, schema);
    const migrations = listMigrationFiles();
    if (migrations.length === 0) {
      return { pending: [], applied: [] };
    }
    const applied = await fetchAppliedMigrations(pool, schema);
    const pending = migrations.filter((migration) => !applied.has(migration.version));
    return {
      pending,
      applied: migrations.filter((migration) => applied.has(migration.version)),
    };
  } finally {
    await pool.end();
  }
};

export const runMigrations = async () => {
  const schema = process.env.DB_SCHEMA || 'public';
  const pool = createMigrationPool();
  try {
    await ensureMigrationsTable(pool, schema);
    const migrations = listMigrationFiles();
    if (migrations.length === 0) {
      return { applied: [], skipped: [] };
    }
    const applied = await fetchAppliedMigrations(pool, schema);
    const pending = migrations.filter((migration) => !applied.has(migration.version));
    const appliedNow: MigrationFile[] = [];
    const skipped = migrations.filter((migration) => applied.has(migration.version));

    for (const migration of pending) {
      const sql = fs.readFileSync(migration.fullPath, 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET search_path TO ${schema}, public`);
        if (sql.trim().length > 0) {
          await client.query(sql);
        }
        await client.query(
          `INSERT INTO ${schema}.schema_migrations (version, name) VALUES ($1, $2)`,
          [migration.version, migration.name]
        );
        await client.query('COMMIT');
        appliedNow.push(migration);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    return { applied: appliedNow, skipped };
  } finally {
    await pool.end();
  }
};
