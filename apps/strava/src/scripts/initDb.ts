#!/usr/bin/env tsx

/**
 * Initialize Strava database schema
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from project root (apps/strava) - override existing env vars
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

async function initDatabase() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    console.log('🗄️  Initializing Strava database schema...');
    console.log(`   Database: ${process.env.DB_NAME}`);
    console.log(`   Schema: ${process.env.DB_SCHEMA}`);

    // Read schema SQL file
    const schemaPath = path.join(__dirname, '../models/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    await pool.query(schemaSql);

    console.log('✅ Database schema initialized successfully!');
    console.log('\nCreated schema: strava');
    console.log('Created tables:');
    console.log('  - activities');
    console.log('  - activity_streams');
    console.log('  - athlete_stats');
    console.log('  - gear');
    console.log('  - gear_maintenance');
    console.log('  - sync_log');
    console.log('\nCreated views:');
    console.log('  - recent_activities');
    console.log('  - activity_summary_by_type');
    console.log('  - activity_summary_by_month');
    console.log('  - gear_usage');
    console.log('  - personal_records');

  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

initDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
