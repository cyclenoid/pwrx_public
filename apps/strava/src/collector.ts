#!/usr/bin/env tsx

/**
 * Strava Tracker CLI
 *
 * Commands:
 *   sync              - Sync all activities from Strava
 *   sync --recent     - Sync only recent activities (last 7 days)
 *   stats             - Show database statistics
 *   help              - Show this help message
 */

import StravaCollector from './services/collector';
import CSVExporter from './services/csvExporter';

const COMMANDS = {
  sync: 'Sync all activities from Strava to database',
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

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = args.slice(1);

  const collector = new StravaCollector();

  try {
    switch (command) {
      case 'sync':
        if (flags.includes('--recent')) {
          const days = parseInt(flags.find(f => f.startsWith('--days='))?.split('=')[1] || '7');
          const includeStreams = !flags.includes('--no-streams');
          const includeSegments = !flags.includes('--no-segments');
          await collector.syncRecentActivities(days, includeStreams, includeSegments);
        } else {
          const includeStreams = !flags.includes('--no-streams');
          const includeSegments = flags.includes('--segments');
          await collector.syncActivities(includeStreams, includeSegments);
        }
        break;

      case 'backfill':
        const backfillLimit = parseInt(flags.find(f => f.startsWith('--limit='))?.split('=')[1] || '200');
        await collector.backfillStreams(backfillLimit);
        break;

      case 'backfill-segments':
        const segmentLimit = parseInt(flags.find(f => f.startsWith('--limit='))?.split('=')[1] || '200');
        {
          const result = await collector.backfillSegments(segmentLimit);
          console.log(`✅ Segment backfill summary: activities=${result.processed}, efforts=${result.efforts}, errors=${result.errors}${result.rateLimited ? ' (rate limit reached)' : ''}`);
        }
        break;

      case 'download-photos':
        const photoLimit = parseInt(flags.find(f => f.startsWith('--limit='))?.split('=')[1] || '100');
        await collector.downloadPhotos(photoLimit);
        break;

      case 'export':
        const exporter = new CSVExporter();
        await exporter.exportAll();
        await exporter.close();
        break;

      case 'stats':
        await collector.showStats();
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        console.error(`❌ Unknown command: ${command}\n`);
        showHelp();
        process.exit(1);
    }

    await collector.close();
    process.exit(0);

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    await collector.close();
    process.exit(1);
  }
}

function showHelp() {
  console.log('🏃 Strava Tracker CLI\n');
  console.log('Usage: npm run collect <command> [options]\n');
  console.log('Commands:');

  Object.entries(COMMANDS).forEach(([cmd, desc]) => {
    console.log(`   ${cmd.padEnd(25)} ${desc}`);
  });

  console.log('\nExamples:');
  console.log('   npm run collect sync                  # Sync all activities');
  console.log('   npm run collect sync --recent         # Sync last 7 days');
  console.log('   npm run collect sync --recent --days=14  # Sync last 14 days');
  console.log('   npm run collect sync --no-streams     # Sync without GPS data');
  console.log('   npm run collect sync --segments       # Include segment efforts (full sync)');
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
