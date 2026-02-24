import StravaAPIService, { StravaActivity, StravaAthlete, StravaStream, StravaSegmentEffort } from './stravaAPI';
import DatabaseService from './database';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Photo storage directory
const PHOTO_STORAGE_PATH = process.env.PHOTO_STORAGE_PATH || '/app/photos';
const SEGMENT_ELIGIBLE_TYPES = new Set(['Ride', 'VirtualRide', 'Run', 'TrailRun']);

export class StravaCollector {
  private strava: StravaAPIService;
  private db: DatabaseService;

  constructor() {
    this.strava = new StravaAPIService();
    this.db = new DatabaseService();
  }

  private inferGearType(gear: { id?: string; type?: string }) {
    const rawType = (gear.type || '').toLowerCase();
    if (rawType.includes('bike')) return 'bike';
    if (rawType.includes('shoe')) return 'shoes';

    const id = (gear.id || '').toLowerCase();
    if (id.startsWith('b')) return 'bike';
    if (id.startsWith('g')) return 'shoes';
    return undefined;
  }

  /**
   * Sync all activities from Strava to database
   */
  async syncActivities(includeStreams: boolean = true, includeSegments: boolean = false): Promise<void> {
    console.log('🔄 Starting Strava sync...\n');

    const syncLogId = await this.db.startSyncLog();
    let itemsProcessed = 0;
    let errors: string[] = [];

    try {
      // Test database connection
      console.log('📡 Testing database connection...');
      const dbConnected = await this.db.testConnection();
      if (!dbConnected) {
        throw new Error('Database connection failed');
      }
      console.log('✅ Database connected\n');

      // Fetch all activities from Strava
      console.log('📥 Fetching all activities from Strava...');
      const activities = await this.strava.getAllActivities();
      console.log(`✅ Fetched ${activities.length} activities\n`);

      // Save each activity to database
      console.log('💾 Saving activities to database...');
      for (let i = 0; i < activities.length; i++) {
        const activity = activities[i];

        try {
          // Save activity
          await this.db.upsertActivity({
            strava_activity_id: activity.id,
            name: activity.name,
            type: activity.type,
            sport_type: activity.sport_type,
            start_date: new Date(activity.start_date),
            distance: activity.distance,
            moving_time: activity.moving_time,
            elapsed_time: activity.elapsed_time,
            total_elevation_gain: activity.total_elevation_gain,
            average_speed: activity.average_speed,
            max_speed: activity.max_speed,
            average_heartrate: activity.average_heartrate,
            max_heartrate: activity.max_heartrate,
            average_watts: activity.average_watts,
            max_watts: activity.max_watts,
            average_cadence: activity.average_cadence,
            kilojoules: activity.kilojoules,
            calories: activity.calories,
            gear_id: activity.gear_id,
            device_name: activity.device_name,
            kudos_count: activity.kudos_count,
            comment_count: activity.comment_count,
            achievement_count: activity.achievement_count,
            photo_count: activity.total_photo_count || 0,
          });

          itemsProcessed++;

          // Progress indicator
          if (itemsProcessed % 50 === 0) {
            console.log(`   Processed ${itemsProcessed}/${activities.length} activities...`);
          }

          // Fetch and save streams (GPS, heartrate, etc.) if requested
          if (includeStreams && !activity.manual) {
            try {
              const streams = await this.strava.getActivityStreams(activity.id);

              if (streams.length > 0) {
                for (const stream of streams) {
                  await this.db.insertActivityStream({
                    activity_id: activity.id,
                    stream_type: stream.type,
                    data: stream.data,
                  });
                }
              }
            } catch (streamError: any) {
              // Streams might not be available for all activities - this is OK
              if (streamError.response?.status !== 404) {
                console.warn(`   ⚠️  Could not fetch streams for activity ${activity.id}: ${streamError.message}`);
              }
            }
          }

          // Fetch and save segment efforts if requested
          if (includeSegments && !activity.manual && SEGMENT_ELIGIBLE_TYPES.has(activity.type)) {
            try {
              await this.syncSegmentsForActivity(activity.id);
            } catch (segmentError: any) {
              if (segmentError.response?.status !== 404) {
                console.warn(`   ⚠️  Could not fetch segments for activity ${activity.id}: ${segmentError.message}`);
              }
            }
          }

        } catch (activityError: any) {
          const errorMsg = `Error processing activity ${activity.id}: ${activityError.message}`;
          console.error(`   ❌ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      console.log(`\n✅ Saved ${itemsProcessed} activities to database\n`);

      // Sync athlete stats
      console.log('📊 Syncing athlete statistics...');
      const athlete = await this.strava.getAthlete();
      const stats = await this.strava.getAthleteStats(athlete.id);

      await this.db.upsertAthleteStats({
        recent_ride_totals_count: stats.recent_ride_totals.count,
        recent_ride_totals_distance: stats.recent_ride_totals.distance,
        recent_ride_totals_time: stats.recent_ride_totals.moving_time,
        recent_run_totals_count: stats.recent_run_totals.count,
        recent_run_totals_distance: stats.recent_run_totals.distance,
        recent_run_totals_time: stats.recent_run_totals.moving_time,
        ytd_ride_totals_count: stats.ytd_ride_totals.count,
        ytd_ride_totals_distance: stats.ytd_ride_totals.distance,
        ytd_run_totals_count: stats.ytd_run_totals.count,
        ytd_run_totals_distance: stats.ytd_run_totals.distance,
        all_ride_totals_count: stats.all_ride_totals.count,
        all_ride_totals_distance: stats.all_ride_totals.distance,
        all_run_totals_count: stats.all_run_totals.count,
        all_run_totals_distance: stats.all_run_totals.distance,
      });

      console.log('✅ Athlete statistics saved\n');

      // Sync gear (bikes, shoes)
      console.log('🚲 Syncing gear...');
      let gearCount = 0;

      // Get unique gear IDs from activities
      const gearIds = [...new Set(
        activities
          .filter(a => a.gear_id)
          .map(a => a.gear_id as string)
      )];

      for (const gearId of gearIds) {
        try {
          const gear = await this.strava.getGear(gearId);
          if (gear) {
            await this.db.upsertGear({
              id: gear.id,
              name: gear.name,
              brand_name: gear.brand_name,
              model_name: gear.model_name,
              type: this.inferGearType(gear),
              distance: gear.distance,
              retired: gear.retired,
            });
            gearCount++;
          }
        } catch (gearError: any) {
          console.warn(`   ⚠️  Could not fetch gear ${gearId}: ${gearError.message}`);
        }
      }

      console.log(`✅ Synced ${gearCount} gear items\n`);

      // Sync photos for activities that have them
      console.log('📷 Syncing activity photos...');
      let photoCount = 0;
      const activitiesWithPhotos = activities.filter(a => a.total_photo_count > 0);

      for (const activity of activitiesWithPhotos) {
        try {
          const photos = await this.strava.getActivityPhotos(activity.id);

          if (photos.length > 0) {
            for (let i = 0; i < photos.length; i++) {
              const photo = photos[i];
              const urlSmall = photo.urls?.['100'] || photo.urls?.['128'] || Object.values(photo.urls || {})[0];
              const urlMedium = photo.urls?.['600'] || photo.urls?.['540'] || urlSmall;
              const urlLarge = photo.urls?.['2048'] || photo.urls?.['1800'] || urlMedium;

              await this.db.upsertActivityPhoto({
                activity_id: activity.id,
                unique_id: photo.unique_id,
                caption: photo.caption,
                source: photo.source,
                url_small: urlSmall,
                url_medium: urlMedium,
                url_large: urlLarge,
                is_primary: photo.default_photo || i === 0,
                location: photo.location,
                uploaded_at: photo.uploaded_at ? new Date(photo.uploaded_at) : undefined,
              });

              photoCount++;
            }
          }

          // Update photo_count in activities table
          await this.db.query(
            'UPDATE strava.activities SET photo_count = $1 WHERE strava_activity_id = $2',
            [photos.length, activity.id]
          );

        } catch (photoError: any) {
          console.warn(`   ⚠️  Could not fetch photos for activity ${activity.id}: ${photoError.message}`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log(`✅ Synced ${photoCount} photos from ${activitiesWithPhotos.length} activities\n`);

      // Print summary
      console.log('📈 Sync Summary:');
      console.log(`   Activities: ${itemsProcessed}`);
      console.log(`   Gear items: ${gearCount}`);
      console.log(`   Photos: ${photoCount}`);

      if (errors.length > 0) {
        console.log(`   Errors: ${errors.length}`);
      }

      // Show database stats
      const dbStats = await this.db.getStats();
      console.log('\n📊 Database Statistics:');
      console.log(`   Total activities: ${dbStats.total_activities}`);
      console.log(`   Total distance: ${dbStats.total_distance_km} km`);
      console.log('\n   By type:');
      dbStats.by_type.forEach((type: any) => {
        console.log(`      ${type.type}: ${type.count} activities, ${parseFloat(type.total_km).toFixed(2)} km`);
      });

      // Complete sync log
      await this.db.completeSyncLog(
        syncLogId,
        itemsProcessed,
        errors.length > 0 ? errors.join('; ') : undefined
      );

      console.log('\n✅ Sync completed successfully! 🎉\n');

    } catch (error: any) {
      console.error('\n❌ Sync failed:', error.message);
      await this.db.completeSyncLog(syncLogId, itemsProcessed, error.message);
      throw error;
    }
  }

  /**
   * Backfill streams for activities that don't have them yet
   * Loads streams incrementally from newest to oldest
   * @returns Number of activities processed
   */
  async backfillStreams(limit: number = 200): Promise<number> {
    console.log(`🔄 Backfilling streams for activities (limit: ${limit})...\n`);

    try {
      // Get activities that need streams:
      // 1. Activities without any streams, OR
      // 2. Activities with power data (average_watts) but no watts stream
      console.log('📊 Finding activities without complete streams...');
      const activitiesWithoutStreams = await this.db.query(`
        SELECT a.strava_activity_id, a.name, a.start_date, a.type
        FROM activities a
        WHERE a.distance > 0  -- Skip activities without distance
        AND (
          -- No streams at all
          NOT EXISTS (
            SELECT 1 FROM activity_streams s
            WHERE s.activity_id = a.strava_activity_id
          )
          OR
          -- Has power data but no watts stream
          (
            a.average_watts IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM activity_streams s
              WHERE s.activity_id = a.strava_activity_id
              AND s.stream_type = 'watts'
            )
          )
        )
        ORDER BY a.start_date DESC
        LIMIT $1
      `, [limit]);

      const total = activitiesWithoutStreams.rows.length;

      if (total === 0) {
        console.log('✅ All activities already have streams!\n');
        return 0;
      }

      console.log(`📥 Found ${total} activities without streams`);
      console.log(`⏳ This will take approximately ${Math.ceil(total / 60)} minutes (rate limiting)\n`);

      let processed = 0;
      let streamsAdded = 0;
      let errors = 0;

      for (const row of activitiesWithoutStreams.rows) {
        const activityId = row.strava_activity_id;
        const activityDate = new Date(row.start_date).toISOString().split('T')[0];

        try {
          console.log(`[${processed + 1}/${total}] Loading streams for: ${row.name} (${activityDate})`);

          // Fetch streams from Strava
          const streams = await this.strava.getActivityStreams(activityId);

          if (streams.length > 0) {
            // Save each stream type
            for (const stream of streams) {
              await this.db.insertActivityStream({
                activity_id: activityId,
                stream_type: stream.type,
                data: stream.data,
              });
            }

            streamsAdded++;
            console.log(`   ✅ Added ${streams.length} stream types`);
          } else {
            console.log(`   ⚠️  No streams available`);
          }

        } catch (error: any) {
          errors++;
          if (error.response?.status === 404) {
            console.log(`   ⚠️  Streams not available (404)`);
          } else if (error.response?.status === 429) {
            console.log(`   ⚠️  Rate limit reached! Stop here and try again later.`);
            break;
          } else {
            console.error(`   ❌ Error: ${error.message}`);
          }
        }

        processed++;

        // Progress update every 20 activities
        if (processed % 20 === 0) {
          const remaining = total - processed;
          console.log(`\n   Progress: ${processed}/${total} (${streamsAdded} successful, ${errors} errors, ${remaining} remaining)\n`);
        }
      }

      // Final summary
      console.log(`\n✅ Backfill completed!`);
      console.log(`   Processed: ${processed} activities`);
      console.log(`   Streams added: ${streamsAdded}`);
      console.log(`   Errors: ${errors}`);

      // Check how many activities still need streams
      const stillMissing = await this.db.query(`
        SELECT COUNT(*) as count
        FROM activities a
        WHERE NOT EXISTS (
          SELECT 1 FROM activity_streams s
          WHERE s.activity_id = a.strava_activity_id
        )
        AND a.distance > 0
      `);

      const remaining = parseInt(stillMissing.rows[0].count);
      if (remaining > 0) {
        console.log(`\n📊 ${remaining} activities still need streams`);
        console.log(`   Run this command again tomorrow to continue!\n`);
      } else {
        console.log(`\n🎉 All activities now have streams!\n`);
      }

      return streamsAdded;

    } catch (error: any) {
      console.error('\n❌ Backfill failed:', error.message);
      throw error;
    }
  }

  /**
   * Backfill segment efforts for activities that don't have them yet
   * @returns Number of activities processed
   */
  async backfillSegments(limit: number = 200): Promise<{ processed: number; efforts: number; errors: number; rateLimited: boolean }> {
    console.log(`🔄 Backfilling segment efforts (limit: ${limit})...\n`);

    try {
      console.log('📊 Finding activities without segment efforts...');
      const activitiesWithoutSegments = await this.db.query(`
        SELECT a.strava_activity_id, a.name, a.start_date
        FROM activities a
        WHERE a.distance > 0
        AND a.type IN ('Ride', 'VirtualRide', 'Run', 'TrailRun')
        AND NOT EXISTS (
          SELECT 1 FROM segment_efforts se
          WHERE se.activity_id = a.strava_activity_id
        )
        ORDER BY a.start_date DESC
        LIMIT $1
      `, [limit]);

      const total = activitiesWithoutSegments.rows.length;

      if (total === 0) {
        console.log('✅ All activities already have segment efforts!\n');
        return { processed: 0, efforts: 0, errors: 0, rateLimited: false };
      }

      console.log(`📥 Found ${total} activities without segment efforts`);
      console.log(`⏳ This will take approximately ${Math.ceil(total / 60)} minutes (rate limiting)\n`);

      let processed = 0;
      let effortsAdded = 0;
      let errors = 0;
      let rateLimited = false;

      for (const row of activitiesWithoutSegments.rows) {
        const activityId = row.strava_activity_id;
        const activityDate = new Date(row.start_date).toISOString().split('T')[0];

        try {
          console.log(`[${processed + 1}/${total}] Loading segments for: ${row.name} (${activityDate})`);
          const count = await this.syncSegmentsForActivity(activityId);
          effortsAdded += count;
          console.log(`   ✅ Added ${count} segment efforts`);
        } catch (error: any) {
          errors++;
          if (error.response?.status === 404) {
            console.log(`   ⚠️  Segments not available (404)`);
          } else if (error.response?.status === 429) {
            console.log(`   ⚠️  Rate limit reached! Stop here and try again later.`);
            rateLimited = true;
            break;
          } else {
            console.error(`   ❌ Error: ${error.message}`);
          }
        }

        processed++;

        if (processed % 20 === 0) {
          const remaining = total - processed;
          console.log(`\n   Progress: ${processed}/${total} (${effortsAdded} efforts, ${errors} errors, ${remaining} remaining)\n`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      console.log(`\n✅ Segment backfill completed!`);
      console.log(`   Processed: ${processed} activities`);
      console.log(`   Efforts added: ${effortsAdded}`);
      console.log(`   Errors: ${errors}`);

      return { processed, efforts: effortsAdded, errors, rateLimited };

    } catch (error: any) {
      console.error('\n❌ Segment backfill failed:', error.message);
      throw error;
    }
  }

  /**
   * Sync only recent activities (last N days)
   * @param days Number of days to look back
   * @param includeStreams Whether to fetch GPS/power/HR streams (takes longer)
   * @returns Number of activities synced
   */
  async syncRecentActivities(days: number = 7, includeStreams: boolean = true, includeSegments: boolean = true): Promise<number> {
    console.log(`🔄 Syncing activities from last ${days} days...\n`);

    try {
      const after = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
      const activities = await this.strava.getActivitiesSince(after);
      const recentActivities = activities.filter(a =>
        new Date(a.start_date).getTime() / 1000 > after
      );

      console.log(`📥 Found ${recentActivities.length} recent activities\n`);

      for (const activity of recentActivities) {
        await this.upsertActivityFromStrava(activity);

        if (includeStreams && !activity.manual) {
          try {
            const streams = await this.strava.getActivityStreams(activity.id);

            if (streams.length > 0) {
              for (const stream of streams) {
                await this.db.insertActivityStream({
                  activity_id: activity.id,
                  stream_type: stream.type,
                  data: stream.data,
                });
              }
            }
          } catch (streamError: any) {
            if (streamError.response?.status !== 404) {
              console.warn(`   ⚠️  Could not fetch streams for activity ${activity.id}: ${streamError.message}`);
            }
          }
        }

        if (includeSegments && !activity.manual && SEGMENT_ELIGIBLE_TYPES.has(activity.type)) {
          try {
            await this.syncSegmentsForActivity(activity.id);
          } catch (segmentError: any) {
            if (segmentError.response?.status !== 404) {
              console.warn(`   ⚠️  Could not fetch segments for activity ${activity.id}: ${segmentError.message}`);
            }
          }
        }
      }

      await this.syncAthleteProfileData();
      await this.syncGearForActivities(recentActivities);

      console.log('✅ Recent activities synced successfully!\n');

      await this.db.query(
        'UPDATE strava.user_profile SET last_sync_at = CURRENT_TIMESTAMP WHERE is_active = true'
      );

      return recentActivities.length;

    } catch (error: any) {
      console.error('❌ Sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Initial sync for first-time setup (last N days)
   */
  async syncInitialActivities(days: number = 180, includeStreams: boolean = true, includeSegments: boolean = true): Promise<number> {
    console.log(`🚀 Running initial sync for last ${days} days...\n`);
    return this.syncRecentActivities(days, includeStreams, includeSegments);
  }

  /**
   * Sync photos for activities that have photos on Strava
   * @returns Number of photos synced
   */
  async syncPhotos(limit: number = 100): Promise<number> {
    console.log(`📷 Syncing photos for activities (limit: ${limit})...\n`);

    try {
      // Get activities from Strava that have photos
      console.log('📊 Finding activities with photos...');
      const activities = await this.strava.getAllActivities();
      const activitiesWithPhotos = activities.filter(a => a.total_photo_count > 0);

      console.log(`📥 Found ${activitiesWithPhotos.length} activities with photos`);

      let processed = 0;
      let photosAdded = 0;
      const toProcess = activitiesWithPhotos.slice(0, limit);

      for (const activity of toProcess) {
        try {
          console.log(`[${processed + 1}/${toProcess.length}] Fetching photos for: ${activity.name}`);

          const photos = await this.strava.getActivityPhotos(activity.id);

          if (photos.length > 0) {
            for (let i = 0; i < photos.length; i++) {
              const photo = photos[i];
              // Get URLs for different sizes
              const urlSmall = photo.urls?.['100'] || photo.urls?.['128'] || Object.values(photo.urls || {})[0];
              const urlMedium = photo.urls?.['600'] || photo.urls?.['540'] || urlSmall;
              const urlLarge = photo.urls?.['2048'] || photo.urls?.['1800'] || urlMedium;

              await this.db.upsertActivityPhoto({
                activity_id: activity.id,
                unique_id: photo.unique_id,
                caption: photo.caption,
                source: photo.source,
                url_small: urlSmall,
                url_medium: urlMedium,
                url_large: urlLarge,
                is_primary: photo.default_photo || i === 0,
                location: photo.location,
                uploaded_at: photo.uploaded_at ? new Date(photo.uploaded_at) : undefined,
              });

              photosAdded++;
            }
            console.log(`   ✅ Added ${photos.length} photos`);
          } else {
            console.log(`   ⚠️  No photos returned`);
          }

          // Update photo_count in activities table
          await this.db.query(
            'UPDATE activities SET photo_count = $1 WHERE strava_activity_id = $2',
            [photos.length, activity.id]
          );

        } catch (error: any) {
          console.error(`   ❌ Error: ${error.message}`);
        }

        processed++;

        // Rate limiting - Strava API limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`\n✅ Photo sync completed!`);
      console.log(`   Activities processed: ${processed}`);
      console.log(`   Photos added: ${photosAdded}`);

      return photosAdded;

    } catch (error: any) {
      console.error('\n❌ Photo sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Show current statistics
   */
  async showStats(): Promise<void> {
    console.log('📊 Strava Tracker Statistics\n');

    try {
      const stats = await this.db.getStats();

      console.log(`Total activities: ${stats.total_activities}`);
      console.log(`Total distance: ${stats.total_distance_km} km\n`);

      console.log('By type:');
      stats.by_type.forEach((type: any) => {
        console.log(`   ${type.type.padEnd(15)} ${type.count.toString().padStart(5)} activities, ${parseFloat(type.total_km).toFixed(2).padStart(10)} km`);
      });

      console.log('');

    } catch (error: any) {
      console.error('❌ Error fetching stats:', error.message);
      throw error;
    }
  }

  /**
   * Download photos that haven't been downloaded yet
   * Downloads to local storage and updates database with local paths
   * @returns Number of photos downloaded
   */
  async downloadPhotos(limit: number = 100): Promise<number> {
    console.log(`📥 Downloading photos (limit: ${limit})...\n`);

    try {
      // Ensure storage directory exists
      if (!fs.existsSync(PHOTO_STORAGE_PATH)) {
        fs.mkdirSync(PHOTO_STORAGE_PATH, { recursive: true });
        console.log(`📁 Created photo storage directory: ${PHOTO_STORAGE_PATH}`);
      }

      // Get photos without local path
      const photos = await this.db.getPhotosWithoutLocalPath(limit);

      if (photos.length === 0) {
        console.log('✅ All photos already downloaded!\n');
        return 0;
      }

      console.log(`📊 Found ${photos.length} photos to download\n`);

      let downloaded = 0;
      let errors = 0;

      for (const photo of photos) {
        try {
          // Use url_medium as primary source (good quality, reasonable size)
          const sourceUrl = photo.url_medium || photo.url_large || photo.url_small;
          if (!sourceUrl) {
            console.log(`   ⚠️  No URL for photo ${photo.unique_id}`);
            continue;
          }

          // Create activity subfolder
          const activityDir = path.join(PHOTO_STORAGE_PATH, String(photo.activity_id));
          if (!fs.existsSync(activityDir)) {
            fs.mkdirSync(activityDir, { recursive: true });
          }

          // Determine file extension from URL or default to jpg
          const urlPath = new URL(sourceUrl).pathname;
          const ext = path.extname(urlPath) || '.jpg';
          const filename = `${photo.unique_id}${ext}`;
          const localPath = path.join(activityDir, filename);
          const relativePath = `${photo.activity_id}/${filename}`;

          // Download the image
          const response = await axios.get(sourceUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
          });

          // Save to disk
          fs.writeFileSync(localPath, response.data);

          // Update database with local path
          await this.db.updatePhotoLocalPath(photo.unique_id, relativePath);

          downloaded++;
          console.log(`   ✅ [${downloaded}/${photos.length}] Downloaded: ${relativePath}`);

          // Small delay to be nice to Strava's CDN
          await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error: any) {
          errors++;
          console.error(`   ❌ Error downloading ${photo.unique_id}: ${error.message}`);
        }
      }

      console.log(`\n✅ Photo download completed!`);
      console.log(`   Downloaded: ${downloaded}`);
      console.log(`   Errors: ${errors}`);

      // Check remaining
      const remaining = await this.db.getPhotosWithoutLocalPath(1);
      if (remaining.length > 0) {
        const totalRemaining = await this.db.query(
          'SELECT COUNT(*) as count FROM activity_photos WHERE local_path IS NULL AND url_medium IS NOT NULL'
        );
        console.log(`   Remaining: ${totalRemaining.rows[0].count} photos still need downloading\n`);
      } else {
        console.log(`\n🎉 All photos have been downloaded!\n`);
      }

      return downloaded;

    } catch (error: any) {
      console.error('\n❌ Photo download failed:', error.message);
      throw error;
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.db.close();
  }

  private async getActiveUserId(): Promise<number | null> {
    const result = await this.db.query(`
      WITH active_user AS (
        SELECT id FROM strava.user_profile WHERE is_active = true ORDER BY id LIMIT 1
      ),
      fallback_user AS (
        SELECT id FROM strava.user_profile ORDER BY id LIMIT 1
      )
      SELECT COALESCE((SELECT id FROM active_user), (SELECT id FROM fallback_user)) AS id
    `);

    const userId = result.rows[0]?.id;
    if (!userId || !Number.isFinite(Number(userId))) return null;
    return Number(userId);
  }

  private async upsertActivityFromStrava(activity: StravaActivity): Promise<void> {
    await this.db.upsertActivity({
      strava_activity_id: activity.id,
      name: activity.name,
      type: activity.type,
      sport_type: activity.sport_type,
      start_date: new Date(activity.start_date),
      distance: activity.distance,
      moving_time: activity.moving_time,
      elapsed_time: activity.elapsed_time,
      total_elevation_gain: activity.total_elevation_gain,
      average_speed: activity.average_speed,
      max_speed: activity.max_speed,
      average_heartrate: activity.average_heartrate,
      max_heartrate: activity.max_heartrate,
      average_watts: activity.average_watts,
      max_watts: activity.max_watts,
      average_cadence: activity.average_cadence,
      kilojoules: activity.kilojoules,
      calories: activity.calories,
      gear_id: activity.gear_id,
      device_name: activity.device_name,
      kudos_count: activity.kudos_count,
      comment_count: activity.comment_count,
      achievement_count: activity.achievement_count,
      photo_count: activity.total_photo_count || 0,
    });
  }

  private async syncAthleteProfileData(): Promise<void> {
    try {
      const athlete = await this.strava.getAthlete();
      await this.syncAthleteStats(athlete);
      await this.updateUserProfileFromAthlete(athlete);
      await this.updateAthleteWeightIfMissing(athlete);
    } catch (error: any) {
      console.warn(`⚠️  Could not sync athlete profile: ${error.message}`);
    }
  }

  private async syncAthleteStats(athlete: StravaAthlete): Promise<void> {
    const stats = await this.strava.getAthleteStats(athlete.id);

    await this.db.upsertAthleteStats({
      recent_ride_totals_count: stats.recent_ride_totals.count,
      recent_ride_totals_distance: stats.recent_ride_totals.distance,
      recent_ride_totals_time: stats.recent_ride_totals.moving_time,
      recent_run_totals_count: stats.recent_run_totals.count,
      recent_run_totals_distance: stats.recent_run_totals.distance,
      recent_run_totals_time: stats.recent_run_totals.moving_time,
      ytd_ride_totals_count: stats.ytd_ride_totals.count,
      ytd_ride_totals_distance: stats.ytd_ride_totals.distance,
      ytd_run_totals_count: stats.ytd_run_totals.count,
      ytd_run_totals_distance: stats.ytd_run_totals.distance,
      all_ride_totals_count: stats.all_ride_totals.count,
      all_ride_totals_distance: stats.all_ride_totals.distance,
      all_run_totals_count: stats.all_run_totals.count,
      all_run_totals_distance: stats.all_run_totals.distance,
    });
  }

  private async updateUserProfileFromAthlete(athlete: StravaAthlete): Promise<void> {
    const userId = await this.getActiveUserId();
    if (!userId) return;

    await this.db.query(`
      UPDATE strava.user_profile
      SET
        strava_athlete_id = COALESCE(NULLIF($1, 0), strava_athlete_id),
        username = COALESCE(NULLIF($2, ''), username),
        firstname = COALESCE(NULLIF($3, ''), firstname),
        lastname = COALESCE(NULLIF($4, ''), lastname),
        city = COALESCE(NULLIF($5, ''), city),
        country = COALESCE(NULLIF($6, ''), country),
        profile_photo = COALESCE(NULLIF($7, ''), profile_photo),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [
      athlete.id,
      athlete.username,
      athlete.firstname,
      athlete.lastname,
      athlete.city,
      athlete.country,
      athlete.profile || athlete.profile_medium || null,
      userId,
    ]);
  }

  private async updateAthleteWeightIfMissing(athlete: StravaAthlete): Promise<void> {
    const userId = await this.getActiveUserId();
    if (!userId) return;
    if (!athlete.weight || athlete.weight <= 0) return;

    const existing = await this.db.query(
      `SELECT value FROM strava.user_settings WHERE user_id = $1 AND key = 'athlete_weight'`,
      [userId]
    );
    const currentValue = existing.rows[0]?.value;
    const currentWeight = currentValue ? parseFloat(currentValue) : 0;
    if (Number.isFinite(currentWeight) && currentWeight > 0) return;

    await this.db.query(
      `
      INSERT INTO strava.user_settings (user_id, key, value, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (key, user_id)
      DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `,
      [userId, 'athlete_weight', String(athlete.weight)]
    );
  }

  private async syncGearForActivities(activities: StravaActivity[]): Promise<number> {
    const gearIds = [...new Set(
      activities
        .filter(a => a.gear_id)
        .map(a => a.gear_id as string)
    )];

    if (gearIds.length === 0) {
      return 0;
    }

    let gearCount = 0;
    for (const gearId of gearIds) {
      try {
      const gear = await this.strava.getGear(gearId);
      if (gear) {
        await this.db.upsertGear({
          id: gear.id,
          name: gear.name,
          brand_name: gear.brand_name,
          model_name: gear.model_name,
          type: this.inferGearType(gear),
          distance: gear.distance,
          retired: gear.retired,
        });
        gearCount++;
      }
      } catch (gearError: any) {
        console.warn(`   ⚠️  Could not fetch gear ${gearId}: ${gearError.message}`);
      }
    }

    return gearCount;
  }

  /**
   * Fetch segment efforts for a single activity and persist them
   */
  private async syncSegmentsForActivity(activityId: number): Promise<number> {
    const activityDetail = await this.strava.getActivityWithSegments(activityId, true);
    const efforts: StravaSegmentEffort[] = activityDetail.segment_efforts || [];

    if (efforts.length === 0) {
      return 0;
    }

    const activityRow = await this.db.getActivityByStravaId(activityId);
    const userId = activityRow?.user_id;

    await this.db.deleteSegmentEffortsForActivity(activityId, 'strava');

    for (const effort of efforts) {
      if (!effort.segment?.id) continue;

      await this.db.upsertSegment({
        id: effort.segment.id,
        name: effort.segment.name,
        activity_type: effort.segment.activity_type,
        distance: effort.segment.distance,
        average_grade: effort.segment.average_grade,
        maximum_grade: effort.segment.maximum_grade,
        elevation_high: effort.segment.elevation_high,
        elevation_low: effort.segment.elevation_low,
        start_latlng: effort.segment.start_latlng || null,
        end_latlng: effort.segment.end_latlng || null,
        climb_category: effort.segment.climb_category,
        city: effort.segment.city,
        state: effort.segment.state,
        country: effort.segment.country,
        source: 'strava',
        local_fingerprint: null,
        is_auto_climb: false,
      });

      await this.db.upsertSegmentEffort({
        effort_id: effort.id,
        segment_id: effort.segment.id,
        activity_id: activityId,
        user_id: userId,
        name: effort.name || effort.segment.name,
        start_date: effort.start_date ? new Date(effort.start_date) : undefined,
        start_date_local: effort.start_date_local ? new Date(effort.start_date_local) : undefined,
        elapsed_time: effort.elapsed_time,
        moving_time: effort.moving_time,
        distance: effort.distance,
        average_watts: effort.average_watts ?? null,
        average_heartrate: effort.average_heartrate ?? null,
        pr_rank: effort.pr_rank ?? null,
        kom_rank: effort.kom_rank ?? null,
        rank: effort.rank ?? null,
        start_index: effort.start_index ?? null,
        end_index: effort.end_index ?? null,
        device_watts: effort.device_watts ?? null,
        hidden: effort.hidden ?? null,
        source: 'strava',
      });
    }

    return efforts.length;
  }
}

export default StravaCollector;
