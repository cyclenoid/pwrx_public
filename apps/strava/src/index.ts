import express from 'express';
import cors from 'cors';
import compression from 'compression';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as cron from 'node-cron';
import apiRoutes, {
  clearTrainingLoadCache,
  refreshTechStatsCache,
  scheduleHeatmapCachePrewarm,
  schedulePerformanceCachePrewarm,
} from './api/routes';
import DatabaseService from './services/database';
import { loadSyncSettings, SyncSettings } from './services/syncSettings';
import { checkPendingMigrations, runMigrations } from './services/migrations';
import { watchFolderService } from './services/import/watchFolder';
import { importQueueAlertMonitor, importQueueWorker } from './services/import/service';
import { adapterRegistry } from './services/adapters/registry';
import { loadStravaRoutesFactory } from './services/adapters/stravaModuleLoader';
import { backfillManualSegments } from './services/localSegments';

// Load .env from project root (apps/strava) - override existing env vars
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

const app = express();
const PORT = process.env.API_PORT || 3001;
let activityTask: cron.ScheduledTask | null = null;
let backfillTask: cron.ScheduledTask | null = null;
let clubExportTask: cron.ScheduledTask | null = null;
let syncConfigPoller: NodeJS.Timeout | null = null;
let syncConfigFingerprint = '';
let startupSyncChecked = false;
let initialSyncChecked = false;
let syncCapabilityDisabledLogged = false;

const hasSyncCapability = (): boolean =>
  Boolean(adapterRegistry.getCapabilities().capabilities.supportsSync);

const hasClubCapability = (): boolean =>
  Boolean(adapterRegistry.getCapabilities().capabilities.supportsClubs);

const notifyAnalyticsDataChanged = (reason: string): void => {
  refreshTechStatsCache();
  scheduleHeatmapCachePrewarm(reason);
  clearTrainingLoadCache(reason);
  schedulePerformanceCachePrewarm(reason);
};

function formatSyncError(error: any): string {
  const status = error?.response?.status;
  if (status === 429) {
    return 'API_LIMIT_REACHED: Strava API limit reached. Please try again later.';
  }
  if (status === 401) {
    return 'AUTH_ERROR: Strava authorization failed. Please re-connect your account.';
  }
  if (status === 403) {
    return 'FORBIDDEN: Strava API access denied. Check app scopes and permissions.';
  }
  if (status && status >= 500) {
    return 'STRAVA_ERROR: Strava API is unavailable. Please try again later.';
  }
  const code = error?.code;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENETUNREACH') {
    return 'NETWORK_ERROR: Unable to reach Strava API. Check network connectivity.';
  }
  return error?.message || 'Unknown error';
}

// Middleware
app.use(compression()); // Enable gzip compression for all responses
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);
const stravaAdapterEnabled = Boolean(adapterRegistry.getAdapter('strava')?.enabled);
if (stravaAdapterEnabled) {
  const createStravaRoutes = loadStravaRoutesFactory();
  if (createStravaRoutes) {
    app.use('/api', createStravaRoutes({ onDataChanged: () => notifyAnalyticsDataChanged('adapter_data_changed') }));
  } else {
    console.warn('Strava adapter enabled but Strava routes are unavailable; skipping Strava route mount.');
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Strava Tracker API',
    version: '1.0.0',
    endpoints: {
      capabilities: '/api/capabilities',
      activities: '/api/activities',
      activity: '/api/activities/:id',
      map: '/api/activities/:id/map',
      stats: '/api/stats',
      monthlyStats: '/api/stats/monthly',
      typeStats: '/api/stats/by-type',
      importFile: '/api/import/file',
      importBatch: '/api/import/batch',
      imports: '/api/imports',
      importQueueStatus: '/api/import/queue/status',
      importQueueFailed: '/api/import/queue/failed',
      importQueueRequeue: '/api/import/queue/jobs/:jobId/requeue',
      importQueueRequeueBulk: '/api/import/queue/requeue-failed',
      importRetryFailed: '/api/imports/:id/retry-failed',
      watchFolderStatus: '/api/import/watch/status',
      watchFolderRescan: '/api/import/watch/rescan',
      gear: '/api/gear',
      health: '/api/health',
    },
  });
});

const destroyTask = (task: cron.ScheduledTask | null) => {
  if (!task) return;
  task.stop();
};

async function shouldRunStartupSync(db: DatabaseService, staleHours: number): Promise<boolean> {
  const result = await db.query(`
    SELECT MAX(completed_at) AS last_sync
    FROM strava.sync_log
    WHERE status = 'completed'
  `);

  const lastSync = result.rows[0]?.last_sync;
  if (!lastSync) return true;

  const ageMs = Date.now() - new Date(lastSync).getTime();
  const thresholdMs = staleHours * 60 * 60 * 1000;
  return ageMs >= thresholdMs;
}

async function getActiveUserId(db: DatabaseService): Promise<number | null> {
  const result = await db.query(`
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

async function getUserSetting(db: DatabaseService, userId: number, key: string): Promise<string | null> {
  const result = await db.query(
    `SELECT value FROM strava.user_settings WHERE user_id = $1 AND key = $2`,
    [userId, key]
  );
  return result.rows[0]?.value ?? null;
}

async function setUserSetting(db: DatabaseService, userId: number, key: string, value: string): Promise<void> {
  await db.query(
    `
    INSERT INTO strava.user_settings (user_id, key, value, updated_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    ON CONFLICT (key, user_id)
    DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `,
    [userId, key, value]
  );
}

async function runSyncPipeline(
  mode: 'activity' | 'backfill',
  reason: string,
  settings: SyncSettings
): Promise<void> {
  if (!hasSyncCapability()) {
    console.log(`⏭️  Skip ${reason}: sync capability disabled`);
    return;
  }

  const db = new DatabaseService();
  let lockClient: any | null = null;
  const summary: string[] = [];

  try {
    lockClient = await db.acquireSyncLock();
    if (!lockClient) {
      console.log(`⏭️  Skip ${reason}: another sync is still running`);
      return;
    }

    console.log(`\n🔄 Starting ${reason}...`);
    const syncAdapter = adapterRegistry.createSyncClient();
    if (!syncAdapter) {
      console.log(`⏭️  Skip ${reason}: no sync adapter client available`);
      return;
    }
    let syncLogId: number | null = null;
    let itemsProcessed = 0;

    try {
      syncLogId = await db.startSyncLog();

      if (mode === 'activity') {
        const recentCount = await syncAdapter.syncRecentActivities(
          settings.activity.recentDays,
          settings.activity.includeStreams,
          settings.activity.includeSegments
        );
        itemsProcessed += recentCount;
        summary.push(`recent=${recentCount}`);
        summary.push(`days=${settings.activity.recentDays}`);
        summary.push(`streams=${settings.activity.includeStreams ? 'on' : 'off'}`);
        summary.push(`segments=${settings.activity.includeSegments ? 'on' : 'off'}`);
      }

      if (mode === 'backfill') {
        if (settings.backfill.streamsLimit > 0) {
          const streamsCount = await syncAdapter.backfillStreams(settings.backfill.streamsLimit);
          itemsProcessed += streamsCount;
          summary.push(`streams=${streamsCount}`);
        } else {
          summary.push('streams=off');
        }

        if (settings.backfill.segmentsLimit > 0) {
          const segmentsResult = await syncAdapter.backfillSegments(settings.backfill.segmentsLimit);
          itemsProcessed += segmentsResult.efforts;
          summary.push(`segments_activities=${segmentsResult.processed}`);
          summary.push(`segments_efforts=${segmentsResult.efforts}`);
          if (segmentsResult.rateLimited) {
            summary.push('warning=rate_limit_reached');
          }
          if (segmentsResult.errors > 0) {
            summary.push(`segment_errors=${segmentsResult.errors}`);
          }
        } else {
          summary.push('segments=off');
        }

        if (settings.backfill.photosLimit > 0) {
          const photosCount = await syncAdapter.syncPhotos(settings.backfill.photosLimit);
          itemsProcessed += photosCount;
          summary.push(`photos=${photosCount}`);
        } else {
          summary.push('photos=off');
        }

        if (settings.backfill.downloadsLimit > 0) {
          const downloadsCount = await syncAdapter.downloadPhotos(settings.backfill.downloadsLimit);
          itemsProcessed += downloadsCount;
          summary.push(`downloads=${downloadsCount}`);
        } else {
          summary.push('downloads=off');
        }
      }

      if (mode === 'activity' || mode === 'backfill') {
        const manualSegmentLimit = mode === 'activity'
          ? Math.max(50, Math.min(settings.activity.recentDays * 20, 1000))
          : Math.max(50, Math.min(
            Math.max(
              settings.backfill.streamsLimit,
              settings.backfill.segmentsLimit,
              200
            ),
            1000
          ));

        const manualSegmentResult = await backfillManualSegments(db, manualSegmentLimit, {
          includeStrava: true,
          includeImported: true,
          includeRide: true,
          includeRun: true,
          recentDays: mode === 'activity' ? settings.activity.recentDays : undefined,
        });
        summary.push(`manual_segments_activities=${manualSegmentResult.activitiesWithMatches}`);
        summary.push(`manual_segments_efforts=${manualSegmentResult.persistedEfforts}`);
        if (manualSegmentResult.errors.length > 0) {
          summary.push(`manual_segment_errors=${manualSegmentResult.errors.length}`);
        }
      }

      if (mode === 'activity' || mode === 'backfill') {
        console.log('\n⚡ Updating power curve cache...');
        try {
          const axios = require('axios');
          await axios.post(`http://localhost:${PORT}/api/power-curve/calculate`);
          summary.push('power_curve=ok');
        } catch (cacheError: any) {
          summary.push('power_curve=failed');
          console.warn('   ⚠️  Power curve cache update failed:', cacheError.message);
        }
      }

      await db.completeSyncLog(syncLogId, itemsProcessed, undefined, `${reason}: ${summary.join(' | ')}`);
      console.log(`✅ ${reason} completed (${itemsProcessed} items processed)\n`);
      notifyAnalyticsDataChanged(`sync_pipeline:${reason}`);
    } catch (error: any) {
      const message = [reason, ...summary, formatSyncError(error)].join(' | ');
      console.error(`❌ ${reason} failed:`, message);
      if (syncLogId) {
        await db.completeSyncLog(syncLogId, itemsProcessed, message);
      }
    } finally {
      await syncAdapter.close();
    }
  } finally {
    if (lockClient) {
      await db.releaseSyncLock(lockClient);
    }
    await db.close();
  }
}

async function runInitialSync(settings: SyncSettings, userId: number, days: number): Promise<void> {
  if (!hasSyncCapability()) {
    console.log('⏭️  Skip initial sync: sync capability disabled');
    return;
  }

  const db = new DatabaseService();
  let lockClient: any | null = null;

  try {
    lockClient = await db.acquireSyncLock();
    if (!lockClient) {
      console.log('⏭️  Skip initial sync: another sync is still running');
      return;
    }

    console.log(`\n🚀 Starting initial sync (${days} days)...`);
    const syncAdapter = adapterRegistry.createSyncClient();
    if (!syncAdapter) {
      console.log('⏭️  Skip initial sync: no sync adapter client available');
      return;
    }
    let syncLogId: number | null = null;
    let itemsProcessed = 0;
    const summary = [
      'initial sync',
      `days=${days}`,
      `streams=${settings.activity.includeStreams ? 'on' : 'off'}`,
      `segments=${settings.activity.includeSegments ? 'on' : 'off'}`,
    ];

    try {
      await setUserSetting(db, userId, 'sync_initial_status', 'running');
      await setUserSetting(db, userId, 'sync_initial_started_at', new Date().toISOString());

      syncLogId = await db.startSyncLog();
      const recentCount = await syncAdapter.syncInitialActivities(
        days,
        settings.activity.includeStreams,
        settings.activity.includeSegments
      );
      itemsProcessed += recentCount;
      summary.splice(1, 0, `recent=${recentCount}`);

      await db.completeSyncLog(syncLogId, itemsProcessed, undefined, summary.join(' | '));
      await setUserSetting(db, userId, 'sync_initial_done_at', new Date().toISOString());
      await setUserSetting(db, userId, 'sync_initial_status', 'completed');
      await setUserSetting(db, userId, 'sync_initial_last_error', '');
      console.log(`✅ Initial sync completed (${itemsProcessed} items processed)\n`);
      notifyAnalyticsDataChanged('initial_sync_completed');
    } catch (error: any) {
      const message = [...summary, formatSyncError(error)].join(' | ');
      console.error('❌ Initial sync failed:', message);
      if (syncLogId) {
        await db.completeSyncLog(syncLogId, itemsProcessed, message);
      }
      await setUserSetting(db, userId, 'sync_initial_status', 'failed');
      await setUserSetting(db, userId, 'sync_initial_last_error', message);
    } finally {
      await syncAdapter.close();
    }
  } finally {
    if (lockClient) {
      await db.releaseSyncLock(lockClient);
    }
    await db.close();
  }
}

async function runClubStatsExport(reason: string, days: number = 30): Promise<void> {
  if (!hasClubCapability()) {
    console.log(`⏭️  Skip ${reason}: club capability disabled`);
    return;
  }

  try {
    const configResponse = await fetch(`http://127.0.0.1:${PORT}/api/club/config`);
    if (!configResponse.ok) {
      console.log(`⏭️  Skip ${reason}: club config unavailable (${configResponse.status})`);
      return;
    }

    const config: any = await configResponse.json();
    if (!config?.exportEnabled) {
      console.log(`⏭️  Skip ${reason}: club export disabled`);
      return;
    }
    if (!config?.clubId || !config?.exportUrl || !config?.exportTokenConfigured) {
      console.log(`⏭️  Skip ${reason}: club export not fully configured`);
      return;
    }

    console.log(`📤 Starting ${reason}...`);
    const response = await fetch(`http://127.0.0.1:${PORT}/api/club/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ days }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.error(`❌ ${reason} failed: ${message || response.statusText}`);
      return;
    }

    const payload: any = await response.json().catch(() => ({}));
    console.log(`✅ ${reason} completed (${String(payload?.exportedAt || 'ok')})`);
  } catch (error: any) {
    console.error(`❌ ${reason} failed:`, error?.message || error);
  }
}

function scheduleSyncTasks(settings: SyncSettings): void {
  destroyTask(activityTask);
  destroyTask(backfillTask);
  destroyTask(clubExportTask);
  activityTask = null;
  backfillTask = null;
  clubExportTask = null;

  if (!hasSyncCapability()) {
    if (!syncCapabilityDisabledLogged) {
      console.log('⏸️  Sync schedules disabled: supportsSync capability is off');
      syncCapabilityDisabledLogged = true;
    }
    return;
  }

  const timezone = settings.timezone || 'UTC';

  if (settings.activity.enabled) {
    if (cron.validate(settings.activity.cron)) {
      activityTask = cron.schedule(
        settings.activity.cron,
        () => runSyncPipeline('activity', 'scheduled activity sync', settings),
        { timezone }
      );
      console.log(`⏰ Activity sync schedule: ${settings.activity.cron} (${timezone})`);
    } else {
      console.warn(`⚠️  Invalid activity cron expression: ${settings.activity.cron}`);
    }
  } else {
    console.log('⏸️  Activity sync schedule disabled');
  }

  if (settings.backfill.enabled) {
    if (cron.validate(settings.backfill.cron)) {
      backfillTask = cron.schedule(
        settings.backfill.cron,
        () => runSyncPipeline('backfill', 'scheduled backfill sync', settings),
        { timezone }
      );
      console.log(`⏰ Backfill sync schedule: ${settings.backfill.cron} (${timezone})`);
    } else {
      console.warn(`⚠️  Invalid backfill cron expression: ${settings.backfill.cron}`);
    }
  } else {
    console.log('⏸️  Backfill sync schedule disabled');
  }

  if (hasClubCapability()) {
    const clubExportCron = String(process.env.CLUB_STATS_EXPORT_CRON || '15 4 * * *').trim();
    if (cron.validate(clubExportCron)) {
      clubExportTask = cron.schedule(
        clubExportCron,
        () => runClubStatsExport('scheduled club stats export', 30),
        { timezone }
      );
      console.log(`⏰ Club stats export schedule: ${clubExportCron} (${timezone})`);
    } else {
      console.warn(`⚠️  Invalid club export cron expression: ${clubExportCron}`);
    }
  } else {
    console.log('⏸️  Club stats export schedule disabled');
  }
}

async function refreshSyncSchedules(force: boolean = false): Promise<void> {
  if (!hasSyncCapability()) {
    destroyTask(activityTask);
    destroyTask(backfillTask);
    destroyTask(clubExportTask);
    activityTask = null;
    backfillTask = null;
    clubExportTask = null;
    return;
  }

  const db = new DatabaseService();
  try {
    const settings = await loadSyncSettings(db);
    const fingerprint = JSON.stringify(settings);

    if (force || fingerprint !== syncConfigFingerprint) {
      syncConfigFingerprint = fingerprint;
      scheduleSyncTasks(settings);
    }

    let ranInitialSync = false;
    if (!initialSyncChecked) {
      initialSyncChecked = true;
      const userId = await getActiveUserId(db);
      if (userId) {
        const userClient = adapterRegistry.createUserClient();
        const refreshToken = userClient
          ? ((await userClient.getRefreshToken(userId)) || process.env.STRAVA_REFRESH_TOKEN)
          : process.env.STRAVA_REFRESH_TOKEN;
        const initialStatus = await getUserSetting(db, userId, 'sync_initial_status');
        const initialDoneAt = await getUserSetting(db, userId, 'sync_initial_done_at');
        const initialDaysRaw = await getUserSetting(db, userId, 'sync_initial_days');
        const initialDaysParsed = initialDaysRaw ? Number(initialDaysRaw) : NaN;
        const initialDays = Number.isFinite(initialDaysParsed) && initialDaysParsed > 0 ? Math.round(initialDaysParsed) : 180;

        if (!initialDoneAt && initialStatus !== 'running' && refreshToken) {
          await runInitialSync(settings, userId, Math.min(Math.max(initialDays, 7), 365));
          ranInitialSync = true;
          startupSyncChecked = true;
        } else if (!refreshToken) {
          console.log('⏸️  Initial sync skipped: no Strava refresh token set');
        }
      }
    }

    if (!startupSyncChecked && !ranInitialSync) {
      startupSyncChecked = true;
      if (settings.startup.enabled) {
        const stale = await shouldRunStartupSync(db, settings.startup.staleHours);
        if (stale) {
          console.log(`🚀 Startup catch-up enabled (stale >= ${settings.startup.staleHours}h)`);
          if (settings.activity.enabled) {
            await runSyncPipeline('activity', 'startup activity sync', settings);
          }
          if (settings.backfill.enabled) {
            await runSyncPipeline('backfill', 'startup backfill sync', settings);
          }
        } else {
          console.log('✅ Startup catch-up not needed (recent sync found)');
        }
      } else {
        console.log('⏸️  Startup catch-up disabled');
      }
    }

    if (force && hasClubCapability()) {
      await runClubStatsExport('startup club stats export', 30);
    }
  } catch (error: any) {
    console.error('❌ Failed to refresh sync schedules:', error.message);
  } finally {
    await db.close();
  }
}

async function isSyncCurrentlyRunning(): Promise<boolean> {
  const db = new DatabaseService();
  let lockClient: any | null = null;
  try {
    lockClient = await db.acquireSyncLock();
    return !lockClient;
  } finally {
    if (lockClient) {
      await db.releaseSyncLock(lockClient);
    }
    await db.close();
  }
}

async function ensureManualSyncReady(res: express.Response): Promise<boolean> {
  if (!hasSyncCapability()) {
    res.status(503).json({
      message: 'Sync capability is disabled',
      status: 'disabled',
    });
    return false;
  }

  const running = await isSyncCurrentlyRunning();
  if (running) {
    res.status(409).json({
      message: 'A sync is already running',
      status: 'running',
    });
    return false;
  }

  return true;
}

const clampInitialSyncDays = (value: string | null): number => {
  if (!value) return 180;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 180;
  return Math.min(Math.max(Math.round(parsed), 7), 365);
};

// Manual sync fallback routes (used when adapter routes do not expose /api/sync endpoints).
app.post('/api/sync', async (_req, res) => {
  try {
    if (!(await ensureManualSyncReady(res))) return;

    const db = new DatabaseService();
    let settings: SyncSettings;
    try {
      settings = await loadSyncSettings(db);
    } finally {
      await db.close();
    }

    res.status(202).json({ message: 'Sync started', status: 'started' });
    void runSyncPipeline('activity', 'manual activity sync', settings)
      .catch((error: any) => {
        console.error('❌ Manual activity sync failed:', error?.message || error);
      });
  } catch (error: any) {
    console.error('❌ Failed to start manual sync:', error?.message || error);
    res.status(500).json({ message: 'Failed to start sync', status: 'error' });
  }
});

app.post('/api/sync/full', async (_req, res) => {
  try {
    if (!(await ensureManualSyncReady(res))) return;

    const db = new DatabaseService();
    let settings: SyncSettings;
    try {
      settings = await loadSyncSettings(db);
    } finally {
      await db.close();
    }

    res.status(202).json({ message: 'Full sync started', status: 'started' });
    void (async () => {
      await runSyncPipeline('activity', 'manual full sync', settings);
      await runSyncPipeline('backfill', 'manual full sync', settings);
    })().catch((error: any) => {
      console.error('❌ Manual full sync failed:', error?.message || error);
    });
  } catch (error: any) {
    console.error('❌ Failed to start manual full sync:', error?.message || error);
    res.status(500).json({ message: 'Failed to start full sync', status: 'error' });
  }
});

app.post('/api/sync/backfill', async (_req, res) => {
  try {
    if (!(await ensureManualSyncReady(res))) return;

    const db = new DatabaseService();
    let settings: SyncSettings;
    try {
      settings = await loadSyncSettings(db);
    } finally {
      await db.close();
    }

    res.status(202).json({ message: 'Backfill sync started', status: 'started' });
    void runSyncPipeline('backfill', 'manual backfill sync', settings)
      .catch((error: any) => {
        console.error('❌ Manual backfill sync failed:', error?.message || error);
      });
  } catch (error: any) {
    console.error('❌ Failed to start manual backfill sync:', error?.message || error);
    res.status(500).json({ message: 'Failed to start backfill sync', status: 'error' });
  }
});

app.post('/api/sync/initial', async (_req, res) => {
  try {
    if (!(await ensureManualSyncReady(res))) return;

    const db = new DatabaseService();
    let context: { settings: SyncSettings; userId: number; initialDays: number; hasRefreshToken: boolean } | null = null;

    try {
      const settings = await loadSyncSettings(db);
      const userId = await getActiveUserId(db);
      if (!userId) {
        res.status(400).json({ message: 'No user profile available for initial sync', status: 'error' });
        return;
      }

      const initialDaysRaw = await getUserSetting(db, userId, 'sync_initial_days');
      const initialDays = clampInitialSyncDays(initialDaysRaw);

      const userClient = adapterRegistry.createUserClient();
      const refreshToken = userClient
        ? ((await userClient.getRefreshToken(userId)) || process.env.STRAVA_REFRESH_TOKEN)
        : process.env.STRAVA_REFRESH_TOKEN;
      context = {
        settings,
        userId,
        initialDays,
        hasRefreshToken: Boolean(refreshToken),
      };
    } finally {
      await db.close();
    }

    if (!context) return;

    if (!context.hasRefreshToken) {
      res.status(400).json({ message: 'No Strava refresh token configured', status: 'error' });
      return;
    }

    res.status(202).json({ message: 'Initial sync started', status: 'started' });
    void runInitialSync(context.settings, context.userId, context.initialDays)
      .catch((error: any) => {
        console.error('❌ Manual initial sync failed:', error?.message || error);
      });
  } catch (error: any) {
    console.error('❌ Failed to start manual initial sync:', error?.message || error);
    res.status(500).json({ message: 'Failed to start initial sync', status: 'error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Strava Tracker API running on port ${PORT}`);
  console.log(`📊 API endpoints: http://localhost:${PORT}/api`);
  console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
  if (stravaAdapterEnabled) {
    console.log('🔌 Strava routes enabled');
  } else {
    console.log('🔌 Strava routes disabled (adapter not enabled)');
  }

  const autoMigrate = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MIGRATE_ON_START || '').trim().toLowerCase()
  );

  (async () => {
    if (autoMigrate) {
      try {
        const result = await runMigrations();
        if (result.applied.length > 0) {
          console.log(`✅ Applied ${result.applied.length} migration(s) on startup.`);
        }
      } catch (error: any) {
        console.warn('⚠️  Auto-migrate failed:', error?.message || error);
      }
    }

    try {
      const result = await checkPendingMigrations();
      if (result.pending.length > 0) {
        console.warn(`⚠️  Database is missing ${result.pending.length} migration(s). Run: npm run db:migrate`);
        console.warn(`   Pending: ${result.pending.map((migration) => migration.filename).join(', ')}`);
      } else {
        console.log('✅ Database migrations up to date.');
      }
    } catch (error: any) {
      console.warn('⚠️  Could not check database migrations:', error?.message || error);
    }
  })();

  // Pre-warm the tech stats cache on startup
  refreshTechStatsCache();
  scheduleHeatmapCachePrewarm('startup');
  schedulePerformanceCachePrewarm('startup');
  refreshSyncSchedules(true);
  watchFolderService.start().catch((error: any) => {
    console.error('❌ Failed to start watch-folder service:', error?.message || error);
  });
  importQueueWorker.start();
  importQueueAlertMonitor.start();
  if (hasSyncCapability()) {
    syncConfigPoller = setInterval(() => {
      refreshSyncSchedules(false);
    }, 60 * 1000);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  destroyTask(activityTask);
  destroyTask(backfillTask);
  destroyTask(clubExportTask);
  watchFolderService.stop();
  importQueueWorker.stop();
  importQueueAlertMonitor.stop();
  if (syncConfigPoller) clearInterval(syncConfigPoller);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  destroyTask(activityTask);
  destroyTask(backfillTask);
  destroyTask(clubExportTask);
  watchFolderService.stop();
  importQueueWorker.stop();
  importQueueAlertMonitor.stop();
  if (syncConfigPoller) clearInterval(syncConfigPoller);
  process.exit(0);
});
