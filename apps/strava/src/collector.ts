#!/usr/bin/env tsx

import CSVExporter from './services/csvExporter';
import DatabaseService from './services/database';
import { adapterRegistry } from './services/adapters/registry';

const COMMANDS = {
  sync: 'Sync all activities from the private Strava adapter',
  'sync --recent': 'Sync only recent activities (last 7 days)',
  'sync --no-streams': 'Sync activities without GPS/heartrate streams',
  'sync --segments': 'Include segment efforts when syncing all activities',
  backfill: 'Backfill streams for activities (incremental)',
  'backfill --limit=N': 'Backfill N activities (default: 200)',
  'backfill-segments': 'Backfill segment efforts (incremental)',
  'backfill-segments --limit=N': 'Backfill segment efforts for N activities (default: 200)',
  'download-photos': 'Download activity photos to local storage',
  'download-photos --limit=N': 'Download N photos (default: 100)',
  export: 'Export data to CSV files',
  stats: 'Show database statistics',
  help: 'Show this help message',
};

const createSyncClient = () => {
  const syncClient = adapterRegistry.createSyncClient();
  if (syncClient) return syncClient;

  throw new Error(
    'Strava sync adapter unavailable. Install the private adapter and enable ADAPTER_STRAVA_ENABLED=true.'
  );
};

async function showStats(): Promise<void> {
  const db = new DatabaseService();
  try {
    const stats = await db.getStats();
    console.log('📊 Database Statistics:\n');
    console.log(`   Total activities: ${stats.total_activities}`);
    console.log(`   Total distance: ${stats.total_distance_km} km`);
    console.log('\n   By type:');
    for (const row of stats.by_type || []) {
      console.log(`   - ${row.type}: ${row.count} activities, ${row.total_distance_km} km`);
    }
  } finally {
    await db.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = args.slice(1);

  let syncClient: ReturnType<typeof adapterRegistry.createSyncClient> | null = null;

  try {
    switch (command) {
      case 'sync': {
        syncClient = createSyncClient();
        if (flags.includes('--recent')) {
          const days = parseInt(flags.find(f => f.startsWith('--days='))?.split('=')[1] || '7', 10);
          const includeStreams = !flags.includes('--no-streams');
          const includeSegments = !flags.includes('--no-segments');
          await syncClient.syncRecentActivities(days, includeStreams, includeSegments);
        } else {
          const includeStreams = !flags.includes('--no-streams');
          const includeSegments = flags.includes('--segments');
          await syncClient.syncRecentActivities(3650, includeStreams, includeSegments);
        }
        break;
      }

      case 'backfill': {
        syncClient = createSyncClient();
        const backfillLimit = parseInt(flags.find(f => f.startsWith('--limit='))?.split('=')[1] || '200', 10);
        await syncClient.backfillStreams(backfillLimit);
        break;
      }

      case 'backfill-segments': {
        syncClient = createSyncClient();
        const segmentLimit = parseInt(flags.find(f => f.startsWith('--limit='))?.split('=')[1] || '200', 10);
        const result = await syncClient.backfillSegments(segmentLimit);
        console.log(
          `✅ Segment backfill summary: activities=${result.processed}, efforts=${result.efforts}, errors=${result.errors}${result.rateLimited ? ' (rate limit reached)' : ''}`
        );
        break;
      }

      case 'download-photos': {
        syncClient = createSyncClient();
        const photoLimit = parseInt(flags.find(f => f.startsWith('--limit='))?.split('=')[1] || '100', 10);
        await syncClient.downloadPhotos(photoLimit);
        break;
      }

      case 'export': {
        const exporter = new CSVExporter();
        await exporter.exportAll();
        await exporter.close();
        break;
      }

      case 'stats':
        await showStats();
        break;

      case 'help':
      case '--help':
      case '-h':
      case undefined:
        showHelp();
        break;

      default:
        console.error(`❌ Unknown command: ${command}\n`);
        showHelp();
        process.exit(1);
    }

    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  } finally {
    if (syncClient) {
      await syncClient.close();
    }
  }
}

function showHelp() {
  console.log('🏃 PWRX Private Strava CLI\n');
  console.log('Usage: npm run collect <command> [options]\n');
  console.log('Note: sync-related commands require the private Strava adapter.\n');
  console.log('Commands:');

  Object.entries(COMMANDS).forEach(([cmd, desc]) => {
    console.log(`   ${cmd.padEnd(25)} ${desc}`);
  });

  console.log('\nExamples:');
  console.log('   npm run collect sync                  # Sync activities using the private adapter');
  console.log('   npm run collect sync --recent         # Sync last 7 days');
  console.log('   npm run collect sync --recent --days=14  # Sync last 14 days');
  console.log('   npm run collect sync --no-streams     # Sync without GPS data');
  console.log('   npm run collect sync --segments       # Include segment efforts');
  console.log('   npm run collect backfill              # Backfill streams (200 activities)');
  console.log('   npm run collect backfill --limit=100  # Backfill 100 activities');
  console.log('   npm run collect backfill-segments     # Backfill segments (200 activities)');
  console.log('   npm run collect backfill-segments --limit=100  # Backfill 100 activities');
  console.log('   npm run collect download-photos       # Download photos locally (100)');
  console.log('   npm run collect download-photos --limit=500  # Download 500 photos');
  console.log('   npm run collect export                # Export to CSV files');
  console.log('   npm run collect stats                 # Show statistics');
  console.log('');
}

main();
