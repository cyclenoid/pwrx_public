#!/usr/bin/env tsx

import * as path from 'path';
import * as dotenv from 'dotenv';
import DatabaseService from '../services/database';
import { checkPendingMigrations } from '../services/migrations';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

async function checkDatabase() {
  const db = new DatabaseService();
  try {
    const connected = await db.testConnection();
    if (!connected) {
      console.error('❌ Database connection failed.');
      process.exit(1);
    }
    console.log('✅ Database connection OK.');
  } finally {
    await db.close();
  }

  const migrations = await checkPendingMigrations();
  if (migrations.pending.length === 0) {
    console.log('✅ No pending migrations.');
  } else {
    console.warn(`⚠️  Pending migrations (${migrations.pending.length}):`);
    migrations.pending.forEach((migration) => {
      console.warn(`   - ${migration.filename}`);
    });
    console.warn('Run: npm run db:migrate');
  }
}

checkDatabase().catch((error) => {
  console.error('❌ DB check failed:', error?.message || error);
  process.exit(1);
});
