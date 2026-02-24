import { Router, Request, Response, NextFunction } from 'express';
import DatabaseService from '../services/database';
import { loadSyncSettings } from '../services/syncSettings';
import { adapterRegistry } from '../services/adapters/registry';
import type { AdapterCapabilities, AdapterSyncClient, AdapterUserClient } from '../services/adapters/types';

export interface StravaRoutesOptions {
  onDataChanged?: () => void;
}

const formatSyncError = (error: any): string => {
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
};

const hasCapability = (capability: keyof AdapterCapabilities): boolean =>
  Boolean(adapterRegistry.getCapabilities().capabilities[capability]);

const requireCapabilities = (
  capabilities: Array<keyof AdapterCapabilities>,
  featureName: string
) => (req: Request, res: Response, next: NextFunction) => {
  const missing = capabilities.filter((capability) => !hasCapability(capability));
  if (missing.length === 0) return next();

  return res.status(501).json({
    error: `Feature unavailable: ${featureName}`,
    missing_capabilities: missing,
  });
};

export default function createStravaRoutes(options: StravaRoutesOptions = {}): Router {
  const router = Router();
  const getUserClient = (): AdapterUserClient | null => adapterRegistry.createUserClient();

  /**
   * GET /api/users
   * Get all user profiles
   */
  router.get('/users', requireCapabilities(['supportsOAuth'], 'user management'), async (req: Request, res: Response) => {
    try {
      const userClient = getUserClient();
      if (!userClient) {
        return res.status(501).json({
          error: 'Feature unavailable: user management',
          missing_capabilities: ['supportsOAuth'],
        });
      }

      const users = await userClient.getAllUserProfiles();
      res.json(users);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  /**
   * POST /api/users
   * Create a new user profile
   */
  router.post('/users', requireCapabilities(['supportsOAuth'], 'user management'), async (req: Request, res: Response) => {
    try {
      const userClient = getUserClient();
      if (!userClient) {
        return res.status(501).json({
          error: 'Feature unavailable: user management',
          missing_capabilities: ['supportsOAuth'],
        });
      }

      const userData = req.body;

      if (!userData.strava_athlete_id || !userData.strava_refresh_token) {
        res.status(400).json({ error: 'strava_athlete_id and strava_refresh_token are required' });
        return;
      }

      const newUser = await userClient.createUserProfile(userData);
      res.status(201).json(newUser);
    } catch (error: any) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  /**
   * DELETE /api/users/:id
   * Delete a user profile
   */
  router.delete('/users/:id', requireCapabilities(['supportsOAuth'], 'user management'), async (req: Request, res: Response) => {
    try {
      const userClient = getUserClient();
      if (!userClient) {
        return res.status(501).json({
          error: 'Feature unavailable: user management',
          missing_capabilities: ['supportsOAuth'],
        });
      }

      const userId = parseInt(req.params.id, 10);

      if (Number.isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const deleted = await userClient.deleteUserProfile(userId);
      if (!deleted) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  /**
   * PUT /api/users/:id/activate
   * Set a user as active (deactivates all others)
   */
  router.put('/users/:id/activate', requireCapabilities(['supportsOAuth'], 'user management'), async (req: Request, res: Response) => {
    try {
      const userClient = getUserClient();
      if (!userClient) {
        return res.status(501).json({
          error: 'Feature unavailable: user management',
          missing_capabilities: ['supportsOAuth'],
        });
      }

      const userId = parseInt(req.params.id, 10);

      if (Number.isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      await userClient.setActiveUser(userId);
      const updatedUser = await userClient.getUserProfile(userId);

      if (!updatedUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(updatedUser);
    } catch (error: any) {
      console.error('Error activating user:', error);
      res.status(500).json({ error: 'Failed to activate user' });
    }
  });

  async function handleManualFullSync(req: Request, res: Response) {
    const syncDb = new DatabaseService();
    let lockClient: any | null = null;

    try {
      lockClient = await syncDb.acquireSyncLock();
      if (!lockClient) {
        await syncDb.close();
        return res.status(409).json({
          message: 'A sync is already running',
          status: 'running',
        });
      }

      const settings = await loadSyncSettings(syncDb);
      const syncAdapter = adapterRegistry.createSyncClient();
      if (!syncAdapter) {
        if (lockClient) {
          await syncDb.releaseSyncLock(lockClient);
        }
        await syncDb.close();
        return res.status(501).json({
          error: 'Feature unavailable: sync client',
          missing_capabilities: ['supportsSync'],
        });
      }

      (async () => {
        let syncLogId: number | null = null;
        let itemsProcessed = 0;
        const summary: string[] = [];

        try {
          syncLogId = await syncDb.startSyncLog();

          const recentCount = await syncAdapter.syncRecentActivities(
            settings.activity.recentDays,
            settings.activity.includeStreams,
            settings.activity.includeSegments
          );
          itemsProcessed += recentCount;
          summary.push('manual full sync');
          summary.push(`recent=${recentCount}`);
          summary.push(`days=${settings.activity.recentDays}`);
          summary.push(`streams=${settings.activity.includeStreams ? 'on' : 'off'}`);
          summary.push(`segments=${settings.activity.includeSegments ? 'on' : 'off'}`);

          if (settings.backfill.streamsLimit > 0) {
            const streamsCount = await syncAdapter.backfillStreams(settings.backfill.streamsLimit);
            itemsProcessed += streamsCount;
            summary.push(`backfill_streams=${streamsCount}`);
          } else {
            summary.push('backfill_streams=off');
          }

          if (settings.backfill.segmentsLimit > 0) {
            const segmentsResult = await syncAdapter.backfillSegments(settings.backfill.segmentsLimit);
            itemsProcessed += segmentsResult.efforts;
            summary.push(`backfill_segments_activities=${segmentsResult.processed}`);
            summary.push(`backfill_segments_efforts=${segmentsResult.efforts}`);
            if (segmentsResult.rateLimited) {
              summary.push('warning=rate_limit_reached');
            }
            if (segmentsResult.errors > 0) {
              summary.push(`segment_errors=${segmentsResult.errors}`);
            }
          } else {
            summary.push('backfill_segments=off');
          }

          if (settings.backfill.photosLimit > 0) {
            const photosCount = await syncAdapter.syncPhotos(settings.backfill.photosLimit);
            itemsProcessed += photosCount;
            summary.push(`backfill_photos=${photosCount}`);
          } else {
            summary.push('backfill_photos=off');
          }

          if (settings.backfill.downloadsLimit > 0) {
            const downloadsCount = await syncAdapter.downloadPhotos(settings.backfill.downloadsLimit);
            itemsProcessed += downloadsCount;
            summary.push(`backfill_downloads=${downloadsCount}`);
          } else {
            summary.push('backfill_downloads=off');
          }

          try {
            const axios = require('axios');
            const apiPort = process.env.PORT || 3001;
            await axios.post(`http://localhost:${apiPort}/api/power-curve/calculate`);
            summary.push('power_curve=ok');
          } catch (cacheError: any) {
            summary.push('power_curve=failed');
            console.warn('   ⚠️  Power curve cache update failed:', cacheError.message);
          }

          const message = summary.join(' | ');
          await syncDb.completeSyncLog(syncLogId, itemsProcessed, undefined, message);
          console.log(`✅ Manual full sync completed: ${message}`);
          options.onDataChanged?.();
        } catch (error: any) {
          const message = ['manual full sync', ...summary, formatSyncError(error)].join(' | ');
          console.error('❌ Manual full sync failed:', message);
          if (syncLogId) {
            await syncDb.completeSyncLog(syncLogId, itemsProcessed, message);
          }
        } finally {
          await syncAdapter.close();
          if (lockClient) {
            await syncDb.releaseSyncLock(lockClient);
          }
          await syncDb.close();
        }
      })().catch((error: any) => console.error('Background full sync error:', error));

      res.json({
        message: `Manual full sync started (${settings.activity.recentDays} days)`,
        status: 'running',
      });
    } catch (error: any) {
      console.error('Error starting full sync:', error);
      if (lockClient) {
        await syncDb.releaseSyncLock(lockClient);
      }
      await syncDb.close();
      res.status(500).json({ error: 'Failed to start full sync' });
    }
  }

  /**
   * POST /api/sync
   * Manually trigger a full sync using configured sync settings
   */
  router.post('/sync', requireCapabilities(['supportsSync'], 'manual sync'), handleManualFullSync);

  /**
   * POST /api/sync/full
   * Manually trigger a full sync (activity + backfill) using configured settings
   */
  router.post('/sync/full', requireCapabilities(['supportsSync'], 'manual sync'), handleManualFullSync);

  /**
   * POST /api/sync/backfill
   * Manually trigger a backfill sync using configured settings
   */
  router.post('/sync/backfill', requireCapabilities(['supportsSync'], 'manual sync'), async (req: Request, res: Response) => {
    const syncDb = new DatabaseService();
    let lockClient: any | null = null;

    try {
      lockClient = await syncDb.acquireSyncLock();
      if (!lockClient) {
        await syncDb.close();
        return res.status(409).json({
          message: 'A sync is already running',
          status: 'running',
        });
      }

      const settings = await loadSyncSettings(syncDb);
      const syncAdapter = adapterRegistry.createSyncClient();
      if (!syncAdapter) {
        if (lockClient) {
          await syncDb.releaseSyncLock(lockClient);
        }
        await syncDb.close();
        return res.status(501).json({
          error: 'Feature unavailable: sync client',
          missing_capabilities: ['supportsSync'],
        });
      }

      (async () => {
        let syncLogId: number | null = null;
        let itemsProcessed = 0;
        const summary: string[] = [];

        try {
          syncLogId = await syncDb.startSyncLog();

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

          const message = ['manual backfill sync', ...summary].join(' | ');
          await syncDb.completeSyncLog(syncLogId, itemsProcessed, undefined, message);
          console.log(`✅ Manual backfill sync completed: ${message}`);
          options.onDataChanged?.();
        } catch (error: any) {
          const message = ['manual backfill sync', ...summary, formatSyncError(error)].join(' | ');
          console.error('❌ Manual backfill sync failed:', message);
          if (syncLogId) {
            await syncDb.completeSyncLog(syncLogId, itemsProcessed, message);
          }
        } finally {
          await syncAdapter.close();
          if (lockClient) {
            await syncDb.releaseSyncLock(lockClient);
          }
          await syncDb.close();
        }
      })().catch((error: any) => console.error('Background backfill sync error:', error));

      res.json({
        message: 'Manual backfill sync started',
        status: 'running',
      });
    } catch (error: any) {
      console.error('Error starting backfill sync:', error);
      if (lockClient) {
        await syncDb.releaseSyncLock(lockClient);
      }
      await syncDb.close();
      res.status(500).json({ error: 'Failed to start backfill sync' });
    }
  });

  /**
   * POST /api/sync/initial
   * Manually trigger the initial sync (first-time setup)
   */
  router.post('/sync/initial', requireCapabilities(['supportsSync', 'supportsOAuth'], 'initial sync'), async (req: Request, res: Response) => {
    const syncDb = new DatabaseService();
    let lockClient: any | null = null;

    try {
      lockClient = await syncDb.acquireSyncLock();
      if (!lockClient) {
        await syncDb.close();
        return res.status(409).json({
          message: 'A sync is already running',
          status: 'running',
        });
      }

      const userClient = getUserClient();
      if (!userClient) {
        await syncDb.releaseSyncLock(lockClient);
        await syncDb.close();
        return res.status(501).json({
          error: 'Feature unavailable: user management',
          missing_capabilities: ['supportsOAuth'],
        });
      }

      const profile = await userClient.getDefaultUserProfile();
      if (!profile) {
        await syncDb.releaseSyncLock(lockClient);
        await syncDb.close();
        return res.status(404).json({ error: 'User profile not found' });
      }

      const refreshToken = profile.strava_refresh_token || process.env.STRAVA_REFRESH_TOKEN;
      if (!refreshToken) {
        await syncDb.releaseSyncLock(lockClient);
        await syncDb.close();
        return res.status(400).json({ error: 'Strava refresh token not set' });
      }

      const userSettings = await userClient.getUserSettings(profile.id);
      const daysRaw = userSettings.sync_initial_days;
      const daysParsed = daysRaw ? Number(daysRaw) : NaN;
      const initialDays = Number.isFinite(daysParsed) && daysParsed > 0 ? Math.round(daysParsed) : 180;

      const settings = await loadSyncSettings(syncDb);
      const boundedDays = Math.min(Math.max(initialDays, 7), 365);
      const syncAdapter = adapterRegistry.createSyncClient();
      if (!syncAdapter) {
        if (lockClient) {
          await syncDb.releaseSyncLock(lockClient);
        }
        await syncDb.close();
        return res.status(501).json({
          error: 'Feature unavailable: sync client',
          missing_capabilities: ['supportsSync'],
        });
      }

      (async () => {
        let syncLogId: number | null = null;
        let itemsProcessed = 0;
        const summary = [
          'manual initial sync',
          `days=${boundedDays}`,
          `streams=${settings.activity.includeStreams ? 'on' : 'off'}`,
          `segments=${settings.activity.includeSegments ? 'on' : 'off'}`,
        ];

        try {
          await userClient.updateUserSetting(profile.id, 'sync_initial_status', 'running');
          await userClient.updateUserSetting(profile.id, 'sync_initial_started_at', new Date().toISOString());

          syncLogId = await syncDb.startSyncLog();
          const recentCount = await syncAdapter.syncInitialActivities(
            boundedDays,
            settings.activity.includeStreams,
            settings.activity.includeSegments
          );
          itemsProcessed += recentCount;
          summary.splice(1, 0, `recent=${recentCount}`);

          await syncDb.completeSyncLog(syncLogId, itemsProcessed, undefined, summary.join(' | '));
          await userClient.updateUserSetting(profile.id, 'sync_initial_done_at', new Date().toISOString());
          await userClient.updateUserSetting(profile.id, 'sync_initial_status', 'completed');
          await userClient.updateUserSetting(profile.id, 'sync_initial_last_error', '');
          console.log(`✅ Manual initial sync completed: ${summary.join(' | ')}`);
          options.onDataChanged?.();
        } catch (error: any) {
          const message = [...summary, formatSyncError(error)].join(' | ');
          console.error('❌ Manual initial sync failed:', message);
          if (syncLogId) {
            await syncDb.completeSyncLog(syncLogId, itemsProcessed, message);
          }
          await userClient.updateUserSetting(profile.id, 'sync_initial_status', 'failed');
          await userClient.updateUserSetting(profile.id, 'sync_initial_last_error', message);
        } finally {
          await syncAdapter.close();
          if (lockClient) {
            await syncDb.releaseSyncLock(lockClient);
          }
          await syncDb.close();
        }
      })().catch((error: any) => console.error('Background initial sync error:', error));

      res.json({
        message: `Initial sync started (${boundedDays} days)`,
        status: 'running',
      });
    } catch (error: any) {
      console.error('Error starting initial sync:', error);
      if (lockClient) {
        await syncDb.releaseSyncLock(lockClient);
      }
      await syncDb.close();
      res.status(500).json({ error: 'Failed to start initial sync' });
    }
  });

  return router;
}
