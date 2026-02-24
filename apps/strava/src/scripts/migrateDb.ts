#!/usr/bin/env tsx

import * as path from 'path';
import * as dotenv from 'dotenv';
import { listMigrationFiles, runMigrations } from '../services/migrations';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

async function migrateDatabase() {
  const migrations = listMigrationFiles();
  if (migrations.length === 0) {
    console.log('ℹ️  No migration files found.');
    return;
  }

  console.log(`📦 Found ${migrations.length} migration file(s).`);
  const result = await runMigrations();

  if (result.applied.length === 0) {
    console.log('✅ No pending migrations. Database is up to date.');
    return;
  }

  console.log(`✅ Applied ${result.applied.length} migration(s):`);
  result.applied.forEach((migration) => {
    console.log(`   - ${migration.filename}`);
  });
}

migrateDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
