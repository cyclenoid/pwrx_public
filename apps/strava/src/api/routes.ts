import { Router, Request, Response, NextFunction } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { createHash, randomUUID } from 'crypto';
import multer from 'multer';
import DatabaseService from '../services/database';
import { loadSyncSettings } from '../services/syncSettings';
import { checkPendingMigrations } from '../services/migrations';
import {
  createUserProfile as createFallbackUserProfile,
  getDefaultUserProfile as getFallbackUserProfile,
  getUserSettings as getFallbackUserSettings,
  updateUserProfile as updateFallbackUserProfile,
  updateUserSetting as updateFallbackUserSetting,
} from '../services/userProfileService';
import {
  buildImportQueueAlerts,
  enqueueBatchFilesImport,
  enqueueSingleFileImport,
  enqueueStravaExportZipImportFromPath,
  enqueueStravaExportZipImportFromPathWithImportId,
  importQueueAlertMonitor,
  importBatchFiles,
  importQueueWorker,
  importSingleFile,
  importStravaExportZipFromPath,
  refreshImportRunFromFiles,
  retryFailedImportFiles,
} from '../services/import/service';
import { watchFolderService, type WatchFolderConfig } from '../services/import/watchFolder';
import { adapterRegistry } from '../services/adapters/registry';
import {
  backfillLocalClimbs,
  createManualLocalSegmentFromActivity,
  renameLocalSegments,
  rebuildLocalClimbsForActivity,
} from '../services/localSegments';
import {
  buildSegmentSourceAndTypeFilters,
  buildSegmentTypeWhereClause,
  parseSegmentSourceFilter,
  parseSegmentTypeFilters,
} from '../services/segments/filters';
import type { LocalSegmentNamingOptions } from '../services/localSegments';
import type { AdapterCapabilities, AdapterUserClient } from '../services/adapters/types';

const router = Router();
const db = new DatabaseService();
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
  },
});
const largeImportUploadTempDir = process.env.IMPORT_UPLOAD_TMP_PATH
  || path.join(process.cwd(), 'storage', 'upload-tmp');
fs.mkdirSync(largeImportUploadTempDir, { recursive: true });
const stravaExportZipUploadMaxBytes = Math.max(
  100 * 1024 * 1024,
  Number(process.env.IMPORT_STRAVA_EXPORT_UPLOAD_MAX_BYTES || (2 * 1024 * 1024 * 1024))
);
const stravaExportChunkUploadMaxChunkBytes = Math.max(
  1024 * 1024,
  Number(process.env.IMPORT_STRAVA_EXPORT_CHUNK_MAX_BYTES || (16 * 1024 * 1024))
);
const stravaExportChunkUploadTempRoot = path.join(largeImportUploadTempDir, 'strava-export-chunked');
fs.mkdirSync(stravaExportChunkUploadTempRoot, { recursive: true });
const importStravaExportZipChunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: stravaExportChunkUploadMaxChunkBytes,
    files: 1,
  },
});
const importStravaExportZipUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, largeImportUploadTempDir),
    filename: (_req, file, cb) => {
      const safeBase = String(file.originalname || 'strava-export.zip')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_');
      cb(null, `${Date.now()}-${randomUUID()}-${safeBase}`);
    },
  }),
  limits: {
    fileSize: stravaExportZipUploadMaxBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const isZip = String(file.originalname || '').toLowerCase().endsWith('.zip');
    if (!isZip) {
      cb(new Error('Only .zip files are allowed for Strava export upload'));
      return;
    }
    cb(null, true);
  },
});
const importQueueApiEnabled = ['1', 'true', 'yes', 'on']
  .includes(String(process.env.IMPORT_QUEUE_API_ENABLED || 'true').trim().toLowerCase());

type StravaExportChunkSessionMeta = {
  uploadId: string;
  clientKeyHash: string;
  originalFilename: string;
  sizeBytes: number;
  chunkSize: number;
  totalChunks: number;
  receivedBytes: number;
  nextChunkIndex: number;
  createdAt: string;
  updatedAt: string;
  processingImportId?: number;
  processingStartedAt?: string | null;
};

const hashClientKey = (clientKey: string): string => createHash('sha1')
  .update(clientKey)
  .digest('hex');

const getStravaExportChunkSessionPaths = (uploadId: string) => {
  const safeId = String(uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const dir = path.join(stravaExportChunkUploadTempRoot, safeId);
  return {
    dir,
    metaPath: path.join(dir, 'meta.json'),
    dataPath: path.join(dir, 'upload.zip'),
  };
};

const readStravaExportChunkSessionMeta = async (uploadId: string): Promise<StravaExportChunkSessionMeta | null> => {
  const { metaPath } = getStravaExportChunkSessionPaths(uploadId);
  try {
    const raw = await fs.promises.readFile(metaPath, 'utf8');
    return JSON.parse(raw) as StravaExportChunkSessionMeta;
  } catch {
    return null;
  }
};

const writeStravaExportChunkSessionMeta = async (meta: StravaExportChunkSessionMeta): Promise<void> => {
  const { dir, metaPath } = getStravaExportChunkSessionPaths(meta.uploadId);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
};

const removeStravaExportChunkSession = async (uploadId: string): Promise<void> => {
  const { dir } = getStravaExportChunkSessionPaths(uploadId);
  await fs.promises.rm(dir, { recursive: true, force: true });
};

const toStravaExportChunkSessionResponse = (meta: StravaExportChunkSessionMeta) => ({
  uploadId: meta.uploadId,
  originalFilename: meta.originalFilename,
  sizeBytes: meta.sizeBytes,
  chunkSize: meta.chunkSize,
  totalChunks: meta.totalChunks,
  receivedBytes: meta.receivedBytes,
  nextChunkIndex: meta.nextChunkIndex,
  complete: meta.nextChunkIndex >= meta.totalChunks && meta.receivedBytes >= meta.sizeBytes,
});

// Photo storage directory
const PHOTO_STORAGE_PATH = process.env.PHOTO_STORAGE_PATH || '/app/photos';

const getBuildInfo = () => {
  const repoFromEnv = process.env.GIT_REPO_URL || null;
  const repoFromGitHub = process.env.GITHUB_REPOSITORY
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}`
    : null;

  return {
    version: process.env.APP_VERSION || process.env.npm_package_version || null,
    commit: process.env.GIT_SHA || process.env.GIT_COMMIT || process.env.GITHUB_SHA || null,
    ref: process.env.GIT_REF || process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || null,
    repo: repoFromEnv || repoFromGitHub,
  };
};

const normalizeComponentKey = (value: string) => {
  const base = (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'component';
};

const ensureUniqueKey = (base: string, used: Set<string>) => {
  let key = base;
  let counter = 2;
  while (used.has(key)) {
    key = `${base}_${counter}`;
    counter += 1;
  }
  used.add(key);
  return key;
};

const parseManualGearType = (value: unknown): 'bike' | 'shoes' | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'bike' || normalized === 'bikes') return 'bike';
  if (normalized === 'shoes' || normalized === 'shoe') return 'shoes';
  return null;
};

const createManualGearId = (type: 'bike' | 'shoes') => {
  const prefix = type === 'bike' ? 'mb' : 'mg';
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
};

// Heatmap cache - stores pre-computed heatmap data
interface HeatmapCache {
  data: any;
  timestamp: number;
  activityCount: number;
}
const heatmapCache: Map<string, HeatmapCache> = new Map();
const HEATMAP_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

const hasCapability = (capability: keyof AdapterCapabilities): boolean =>
  Boolean(adapterRegistry.getCapabilities().capabilities[capability]);
const getUserClient = (): AdapterUserClient | null => adapterRegistry.createUserClient();
const ensureDefaultSingleUserProfile = async () => {
  const bootstrapData = {
    strava_athlete_id: 0,
    strava_refresh_token: '',
    strava_scope: '',
    username: 'local-user',
    firstname: 'PWRX',
    lastname: 'User',
  };

  const userClient = getUserClient();
  if (!userClient) {
    const existing = await getFallbackUserProfile();
    if (existing) return existing;
    return createFallbackUserProfile(bootstrapData);
  }

  const existing = await userClient.getDefaultUserProfile();
  if (existing) return existing;
  return userClient.createUserProfile(bootstrapData);
};
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

const parseAutoClimbOptions = (source: any) => {
  const read = (key: string): number | undefined => {
    const raw = source?.[key];
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  return {
    minDistanceM: read('minDistanceM'),
    minElevationGainM: read('minElevationGainM'),
    minAvgGradePct: read('minAvgGradePct'),
    maxFlatDistanceM: read('maxFlatDistanceM'),
    maxDescentM: read('maxDescentM'),
    maxDistanceM: read('maxDistanceM'),
    maxElapsedTimeSec: read('maxElapsedTimeSec'),
  };
};

const parseBooleanLike = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const readSettingBoolean = (
  settings: Record<string, string>,
  key: string,
  fallback: boolean
): boolean => {
  const parsed = parseBooleanLike(settings[key]);
  return parsed === undefined ? fallback : parsed;
};

const readSettingNumber = (
  settings: Record<string, string>,
  key: string,
  fallback: number
): number => {
  const raw = settings[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readSettingString = (
  settings: Record<string, string>,
  key: string,
  fallback: string
): string => {
  const raw = settings[key];
  const value = raw === undefined || raw === null ? '' : String(raw).trim();
  return value || fallback;
};

const hasSettingValue = (settings: Record<string, string>, key: string): boolean => {
  const raw = settings[key];
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
};

const readSettingBooleanCompat = (
  settings: Record<string, string>,
  primaryKey: string,
  legacyKey: string,
  fallback: boolean
): boolean => {
  if (hasSettingValue(settings, primaryKey)) {
    return readSettingBoolean(settings, primaryKey, fallback);
  }
  return readSettingBoolean(settings, legacyKey, fallback);
};

const readSettingNumberCompat = (
  settings: Record<string, string>,
  primaryKey: string,
  legacyKey: string,
  fallback: number
): number => {
  if (hasSettingValue(settings, primaryKey)) {
    return readSettingNumber(settings, primaryKey, fallback);
  }
  return readSettingNumber(settings, legacyKey, fallback);
};

const readSettingStringCompat = (
  settings: Record<string, string>,
  primaryKey: string,
  legacyKey: string,
  fallback: string
): string => {
  if (hasSettingValue(settings, primaryKey)) {
    return readSettingString(settings, primaryKey, fallback);
  }
  return readSettingString(settings, legacyKey, fallback);
};

const readEnvWithLegacy = (
  primaryKey: string,
  legacyKey: string,
  fallback: string
): string => {
  const primary = String(process.env[primaryKey] ?? '').trim();
  if (primary) return primary;
  const legacy = String(process.env[legacyKey] ?? '').trim();
  if (legacy) return legacy;
  return fallback;
};

const parseLocalClimbNamingOptions = (
  source: any,
  fallback: LocalSegmentNamingOptions
): LocalSegmentNamingOptions => {
  const boolRaw = parseBooleanLike(source?.reverseGeocodeEnabled ?? source?.reverse_geocode_enabled);
  const virtualNameRaw = parseBooleanLike(
    source?.preferVirtualActivityName
    ?? source?.prefer_virtual_activity_name
    ?? source?.virtualNamePreferred
    ?? source?.virtual_name_preferred
  );
  const timeoutRaw = Number(source?.reverseGeocodeTimeoutMs ?? source?.reverse_geocode_timeout_ms);
  const urlRaw = source?.reverseGeocodeUrl ?? source?.reverse_geocode_url;
  const langRaw = source?.reverseGeocodeLanguage ?? source?.reverse_geocode_language;
  const agentRaw = source?.reverseGeocodeUserAgent ?? source?.reverse_geocode_user_agent;

  return {
    reverseGeocodeEnabled: boolRaw === undefined ? fallback.reverseGeocodeEnabled : boolRaw,
    reverseGeocodeUrl: (() => {
      const value = String(urlRaw ?? '').trim();
      return value || fallback.reverseGeocodeUrl;
    })(),
    reverseGeocodeTimeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0
      ? timeoutRaw
      : fallback.reverseGeocodeTimeoutMs,
    reverseGeocodeLanguage: (() => {
      const value = String(langRaw ?? '').trim();
      return value || fallback.reverseGeocodeLanguage;
    })(),
    reverseGeocodeUserAgent: (() => {
      const value = String(agentRaw ?? '').trim();
      return value || fallback.reverseGeocodeUserAgent;
    })(),
    preferVirtualActivityName: virtualNameRaw === undefined
      ? fallback.preferVirtualActivityName
      : virtualNameRaw,
  };
};

const getLocalClimbBackfillDefaults = async (): Promise<{
  includeStrava: boolean;
  includeImported: boolean;
  includeRide: boolean;
  includeRun: boolean;
}> => {
  const fallback = {
    includeStrava: false,
    includeImported: true,
    includeRide: true,
    includeRun: true,
  };

  try {
    const userClient = getUserClient();
    if (userClient) {
      const profile = await userClient.getDefaultUserProfile();
      if (profile) {
        const settings = (await userClient.getUserSettings(profile.id)) as Record<string, string>;
        return {
          includeStrava: readSettingBooleanCompat(
            settings,
            'local_segments_include_strava',
            'local_climbs_include_strava',
            fallback.includeStrava
          ),
          includeImported: readSettingBooleanCompat(
            settings,
            'local_segments_include_imported',
            'local_climbs_include_imported',
            fallback.includeImported
          ),
          includeRide: readSettingBooleanCompat(
            settings,
            'local_segments_include_ride',
            'local_climbs_include_ride',
            fallback.includeRide
          ),
          includeRun: readSettingBooleanCompat(
            settings,
            'local_segments_include_run',
            'local_climbs_include_run',
            fallback.includeRun
          ),
        };
      }
    }

    const fallbackProfile = await getFallbackUserProfile();
    if (!fallbackProfile) return fallback;

    const fallbackSettings = (await getFallbackUserSettings(fallbackProfile.id)) as Record<string, string>;
    return {
      includeStrava: readSettingBooleanCompat(
        fallbackSettings,
        'local_segments_include_strava',
        'local_climbs_include_strava',
        fallback.includeStrava
      ),
      includeImported: readSettingBooleanCompat(
        fallbackSettings,
        'local_segments_include_imported',
        'local_climbs_include_imported',
        fallback.includeImported
      ),
      includeRide: readSettingBooleanCompat(
        fallbackSettings,
        'local_segments_include_ride',
        'local_climbs_include_ride',
        fallback.includeRide
      ),
      includeRun: readSettingBooleanCompat(
        fallbackSettings,
        'local_segments_include_run',
        'local_climbs_include_run',
        fallback.includeRun
      ),
    };
  } catch (error: any) {
    console.warn('Could not load local segment backfill defaults:', error?.message || error);
    return fallback;
  }
};

const getLocalClimbNamingDefaults = async (): Promise<LocalSegmentNamingOptions> => {
  const fallback: LocalSegmentNamingOptions = {
    reverseGeocodeEnabled: ['1', 'true', 'yes', 'on']
      .includes(readEnvWithLegacy('LOCAL_SEGMENTS_REVERSE_GEOCODE_ENABLED', 'LOCAL_CLIMBS_REVERSE_GEOCODE_ENABLED', 'false').toLowerCase()),
    reverseGeocodeUrl: readEnvWithLegacy(
      'LOCAL_SEGMENTS_REVERSE_GEOCODE_URL',
      'LOCAL_CLIMBS_REVERSE_GEOCODE_URL',
      'https://nominatim.openstreetmap.org/reverse'
    ),
    reverseGeocodeTimeoutMs: (() => {
      const parsed = Number(
        readEnvWithLegacy(
          'LOCAL_SEGMENTS_REVERSE_GEOCODE_TIMEOUT_MS',
          'LOCAL_CLIMBS_REVERSE_GEOCODE_TIMEOUT_MS',
          '2200'
        )
      );
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 2200;
    })(),
    reverseGeocodeLanguage: readEnvWithLegacy(
      'LOCAL_SEGMENTS_REVERSE_GEOCODE_LANGUAGE',
      'LOCAL_CLIMBS_REVERSE_GEOCODE_LANGUAGE',
      'de,en'
    ),
    reverseGeocodeUserAgent: readEnvWithLegacy(
      'LOCAL_SEGMENTS_REVERSE_GEOCODE_USER_AGENT',
      'LOCAL_CLIMBS_REVERSE_GEOCODE_USER_AGENT',
      'PWRX/1.0 (local-segments)'
    ),
    preferVirtualActivityName: ['1', 'true', 'yes', 'on']
      .includes(readEnvWithLegacy('LOCAL_SEGMENTS_VIRTUAL_NAME_PREFERRED', 'LOCAL_CLIMBS_VIRTUAL_NAME_PREFERRED', 'true').toLowerCase()),
  };

  const toNaming = (settings: Record<string, string>): LocalSegmentNamingOptions => ({
    reverseGeocodeEnabled: readSettingBooleanCompat(
      settings,
      'local_segments_reverse_geocode_enabled',
      'local_climbs_reverse_geocode_enabled',
      Boolean(fallback.reverseGeocodeEnabled)
    ),
    reverseGeocodeUrl: readSettingStringCompat(
      settings,
      'local_segments_reverse_geocode_url',
      'local_climbs_reverse_geocode_url',
      String(fallback.reverseGeocodeUrl)
    ),
    reverseGeocodeTimeoutMs: readSettingNumberCompat(
      settings,
      'local_segments_reverse_geocode_timeout_ms',
      'local_climbs_reverse_geocode_timeout_ms',
      Number(fallback.reverseGeocodeTimeoutMs)
    ),
    reverseGeocodeLanguage: readSettingStringCompat(
      settings,
      'local_segments_reverse_geocode_language',
      'local_climbs_reverse_geocode_language',
      String(fallback.reverseGeocodeLanguage)
    ),
    reverseGeocodeUserAgent: readSettingStringCompat(
      settings,
      'local_segments_reverse_geocode_user_agent',
      'local_climbs_reverse_geocode_user_agent',
      String(fallback.reverseGeocodeUserAgent)
    ),
    preferVirtualActivityName: readSettingBooleanCompat(
      settings,
      'local_segments_virtual_name_preferred',
      'local_climbs_virtual_name_preferred',
      Boolean(fallback.preferVirtualActivityName)
    ),
  });

  try {
    const userClient = getUserClient();
    if (userClient) {
      const profile = await userClient.getDefaultUserProfile();
      if (profile) {
        const settings = (await userClient.getUserSettings(profile.id)) as Record<string, string>;
        return toNaming(settings);
      }
    }

    const fallbackProfile = await getFallbackUserProfile();
    if (!fallbackProfile) return fallback;

    const fallbackSettings = (await getFallbackUserSettings(fallbackProfile.id)) as Record<string, string>;
    return toNaming(fallbackSettings);
  } catch (error: any) {
    console.warn('Could not load local segment naming defaults:', error?.message || error);
    return fallback;
  }
};

/**
 * GET /api/capabilities
 * Returns enabled adapters and merged capabilities for feature gating.
 */
router.get('/capabilities', async (req: Request, res: Response) => {
  try {
    return res.json(adapterRegistry.getCapabilities());
  } catch (error: any) {
    console.error('Error fetching capabilities:', error);
    return res.status(500).json({ error: 'Failed to fetch capabilities' });
  }
});

/**
 * GET /api/activities
 * List all activities with optional filters
 * Query params: type, from, to, gear_id, limit, offset, include_route (boolean)
 */
router.get('/activities', async (req: Request, res: Response) => {
  try {
    const { type, from, to, gear_id, limit = '50', offset = '0', include_route } = req.query;
    const shouldIncludeRoute = include_route === 'true';

    let query = `
      SELECT
        id,
        a.strava_activity_id,
        name,
        type,
        sport_type,
        start_date,
        distance / 1000 as distance_km,
        moving_time,
        elapsed_time,
        total_elevation_gain,
        average_speed * 3.6 as avg_speed_kmh,
        max_speed * 3.6 as max_speed_kmh,
        average_heartrate,
        max_heartrate,
        average_watts,
        max_watts,
        average_cadence,
        kilojoules,
        calories,
        gear_id,
        device_name,
        kudos_count,
        comment_count,
        achievement_count,
        EXISTS (
          SELECT 1
          FROM strava.segment_efforts se
          WHERE se.activity_id = a.strava_activity_id
            AND COALESCE(se.user_id, a.user_id) = a.user_id
            AND se.elapsed_time IS NOT NULL
            AND se.elapsed_time = (
              SELECT MIN(se2.elapsed_time)
              FROM strava.segment_efforts se2
              WHERE se2.segment_id = se.segment_id
                AND COALESCE(se2.user_id, a.user_id) = a.user_id
                AND se2.elapsed_time IS NOT NULL
            )
        ) as has_segment_pr,
        photo_count,
        (SELECT COALESCE(
          CASE WHEN local_path IS NOT NULL THEN '/api/photos/' || local_path END,
          url_medium
        ) FROM strava.activity_photos p WHERE p.activity_id = a.strava_activity_id AND p.is_primary = true LIMIT 1) as primary_photo_url
        ${shouldIncludeRoute ? `, (SELECT s.data FROM strava.activity_streams s WHERE s.activity_id = a.strava_activity_id AND jsonb_typeof(s.data->0) = 'array' LIMIT 1) as route_data` : ''}
        , (SELECT jsonb_agg(jsonb_build_object(
            'unique_id', p.unique_id,
            'url_small', COALESCE('/api/photos/' || p.local_path, p.url_small),
            'url_medium', COALESCE('/api/photos/' || p.local_path, p.url_medium)
          )) FROM strava.activity_photos p WHERE p.activity_id = a.strava_activity_id LIMIT 3) as photos
      FROM strava.activities a
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (type) {
      query += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (from) {
      query += ` AND start_date >= $${paramIndex}`;
      params.push(from);
      paramIndex++;
    }

    if (to) {
      query += ` AND start_date <= $${paramIndex}`;
      params.push(to);
      paramIndex++;
    }

    if (gear_id) {
      query += ` AND gear_id = $${paramIndex}`;
      params.push(gear_id);
      paramIndex++;
    }

    query += ` ORDER BY start_date DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM strava.activities WHERE 1=1';
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (type) {
      countQuery += ` AND type = $${countParamIndex}`;
      countParams.push(type);
      countParamIndex++;
    }

    if (from) {
      countQuery += ` AND start_date >= $${countParamIndex}`;
      countParams.push(from);
      countParamIndex++;
    }

    if (to) {
      countQuery += ` AND start_date <= $${countParamIndex}`;
      countParams.push(to);
      countParamIndex++;
    }

    if (gear_id) {
      countQuery += ` AND gear_id = $${countParamIndex}`;
      countParams.push(gear_id);
    }

    const countResult = await db.query(countQuery, countParams);

    // Simplify route data if included (for mini-maps)
    let activities = result.rows;
    if (shouldIncludeRoute) {
      activities = result.rows.map((activity: any) => {
        if (!activity.route_data || !Array.isArray(activity.route_data)) {
          return { ...activity, route_data: null };
        }

        const coords = activity.route_data;
        // Keep max 200 points for better mini-map accuracy
        const maxPoints = 200;
        let simplified;

        if (coords.length <= maxPoints) {
          simplified = coords;
        } else {
          const step = Math.ceil(coords.length / maxPoints);
          simplified = coords.filter((_: any, i: number) => i % step === 0);
        }

        // Round coordinates to 4 decimal places
        const rounded = simplified.map((coord: [number, number]) => [
          Math.round(coord[0] * 10000) / 10000,
          Math.round(coord[1] * 10000) / 10000
        ]);

        return { ...activity, route_data: rounded };
      });
    }

    res.json({
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      activities,
    });
  } catch (error: any) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

/**
 * GET /api/activities/heatmap
 * Get all activity GPS coordinates for heatmap
 * NOTE: This route must come BEFORE /activities/:id
 */
router.get('/activities/heatmap', async (req: Request, res: Response) => {
  try {
    const { type, year, refresh } = req.query;
    const cacheKey = `heatmap_${type || 'all'}_${year || 'all'}`;

    // Check cache (unless refresh=true)
    if (refresh !== 'true') {
      const cached = heatmapCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < HEATMAP_CACHE_TTL) {
        console.log(`Heatmap cache hit for ${cacheKey}`);
        return res.json({
          ...cached.data,
          cached: true,
          cache_age_hours: Math.round((Date.now() - cached.timestamp) / 3600000 * 10) / 10
        });
      }
    }

    console.log(`Generating heatmap data for ${cacheKey}...`);
    const startTime = Date.now();

    // GPS coordinates are stored where data->0 is an array (contains [lat, lng] pairs)
    // NO LIMIT - get all activities with GPS data
    let query = `
      SELECT
        a.strava_activity_id,
        a.name,
        a.type,
        a.start_date,
        a.distance / 1000 as distance_km,
        s.data as latlng
      FROM strava.activities a
      JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id
      WHERE jsonb_typeof(s.data->0) = 'array'
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (type) {
      query += ` AND a.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (year) {
      query += ` AND EXTRACT(YEAR FROM a.start_date) = $${paramIndex}`;
      params.push(parseInt(year as string));
      paramIndex++;
    }

    query += ` ORDER BY a.start_date DESC`;

    const result = await db.query(query, params);

    // Simplify coordinates to reduce payload size while maintaining good detail
    const simplifiedActivities = result.rows.map((activity: any) => {
      const coords = activity.latlng;
      if (!coords || coords.length === 0) return activity;

      // Keep max 200 points per activity for detailed heatmap display
      // Good balance between detail and performance
      const maxPoints = 200;
      if (coords.length <= maxPoints) {
        // Round coordinates to 5 decimal places (1.1m precision)
        return {
          ...activity,
          latlng: coords.map((coord: [number, number]) => [
            Math.round(coord[0] * 100000) / 100000,
            Math.round(coord[1] * 100000) / 100000
          ])
        };
      }

      const step = Math.ceil(coords.length / maxPoints);
      const simplified = coords.filter((_: any, i: number) => i % step === 0);

      // Round coordinates to 5 decimal places (1.1m precision)
      const rounded = simplified.map((coord: [number, number]) => [
        Math.round(coord[0] * 100000) / 100000,
        Math.round(coord[1] * 100000) / 100000
      ]);

      return {
        ...activity,
        latlng: rounded
      };
    });

    const responseData = {
      count: result.rows.length,
      activities: simplifiedActivities,
    };

    // Store in cache
    heatmapCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
      activityCount: result.rows.length
    });

    const duration = Date.now() - startTime;
    console.log(`Heatmap data generated in ${duration}ms - ${result.rows.length} activities`);

    res.json({
      ...responseData,
      cached: false,
      generation_time_ms: duration
    });
  } catch (error: any) {
    console.error('Error fetching heatmap data:', error);
    res.status(500).json({ error: 'Failed to fetch heatmap data' });
  }
});

/**
 * GET /api/activities/:id
 * Get single activity with streams
 */
router.get('/activities/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get activity
    const activity = await db.getActivityByStravaId(parseInt(id));

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Get streams
    const streams = await db.getActivityStreams(parseInt(id));

    // Convert streams array to object
    const streamsObj: any = {};
    streams.forEach(stream => {
      streamsObj[stream.stream_type] = stream.data;
    });

    // Get photos
    const photos = await db.getActivityPhotos(parseInt(id));

    res.json({
      ...activity,
      distance_km: (activity.distance || 0) / 1000,
      avg_speed_kmh: (activity.average_speed || 0) * 3.6,
      max_speed_kmh: (activity.max_speed || 0) * 3.6,
      streams: streamsObj,
      photos: photos,
    });
  } catch (error: any) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

/**
 * PATCH /api/activities/:id/gear
 * Assign or clear gear on an activity.
 * Body: { gear_id?: string | null } (alias: gearId)
 */
router.patch('/activities/:id/gear', async (req: Request, res: Response) => {
  try {
    const activityId = Number(req.params.id);
    if (!Number.isInteger(activityId)) {
      return res.status(400).json({ error: 'Invalid activity id' });
    }

    const rawGearId = req.body?.gear_id ?? req.body?.gearId ?? null;
    const gearId = rawGearId === '' ? null : rawGearId;

    const activityResult = await db.query(
      `
      SELECT strava_activity_id
      FROM strava.activities
      WHERE strava_activity_id = $1
      LIMIT 1
      `,
      [activityId]
    );
    if (activityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    if (gearId !== null && gearId !== undefined) {
      const gearResult = await db.query(
        `
        SELECT id
        FROM strava.gear
        WHERE id = $1
        LIMIT 1
        `,
        [gearId]
      );
      if (gearResult.rows.length === 0) {
        return res.status(404).json({ error: 'Gear not found' });
      }
    }

    const updateResult = await db.query(
      `
      UPDATE strava.activities
      SET gear_id = $2, updated_at = CURRENT_TIMESTAMP
      WHERE strava_activity_id = $1
      RETURNING strava_activity_id, gear_id
      `,
      [activityId, gearId ?? null]
    );

    return res.json({
      activity_id: updateResult.rows[0].strava_activity_id,
      gear_id: updateResult.rows[0].gear_id,
    });
  } catch (error: any) {
    console.error('Error updating activity gear:', error);
    return res.status(500).json({ error: 'Failed to update activity gear' });
  }
});

/**
 * DELETE /api/activities/:id
 * Delete a locally imported activity (and local photo files, if present)
 */
router.delete('/activities/:id', async (req: Request, res: Response) => {
  try {
    const activityId = Number(req.params.id);
    if (!Number.isInteger(activityId)) {
      return res.status(400).json({ error: 'Invalid activity id' });
    }

    const activityResult = await db.query(
      `
      SELECT strava_activity_id, name, source
      FROM strava.activities
      WHERE strava_activity_id = $1
      LIMIT 1
      `,
      [activityId]
    );

    if (activityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const activity = activityResult.rows[0];
    const source = activity.source ? String(activity.source) : null;
    const isImportedActivity = activityId < 0 || (source !== null && source !== 'strava');
    if (!isImportedActivity) {
      return res.status(403).json({ error: 'Only imported activities can be deleted' });
    }

    await db.query(
      `
      DELETE FROM strava.activities
      WHERE strava_activity_id = $1
      `,
      [activityId]
    );

    const activityPhotoDir = path.join(PHOTO_STORAGE_PATH, String(activityId));
    let photosDirectoryRemoved = false;
    let photoCleanupWarning: string | null = null;
    try {
      if (fs.existsSync(activityPhotoDir)) {
        fs.rmSync(activityPhotoDir, { recursive: true, force: true });
        photosDirectoryRemoved = true;
      }
    } catch (cleanupError: any) {
      photoCleanupWarning = cleanupError?.message || 'Failed to clean up local photo directory';
      console.error(`Error cleaning local photos for activity ${activityId}:`, cleanupError);
    }

    res.json({
      success: true,
      deleted_activity_id: activityId,
      deleted_activity_name: activity.name,
      source,
      photos_directory_removed: photosDirectoryRemoved,
      warning: photoCleanupWarning,
    });
  } catch (error: any) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

/**
 * GET /api/activities/:id/segments
 * Get segment efforts for an activity (includes local PR flag)
 */
router.get('/activities/:id/segments', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const activityId = parseInt(id);

    if (!Number.isFinite(activityId)) {
      return res.status(400).json({ error: 'Invalid activity id' });
    }

    const query = `
      WITH activity_user AS (
        SELECT user_id FROM strava.activities WHERE strava_activity_id = $1 LIMIT 1
      ),
      best AS (
        SELECT se.segment_id, MIN(se.elapsed_time) AS best_elapsed
        FROM strava.segment_efforts se
        WHERE se.user_id = (SELECT user_id FROM activity_user)
        GROUP BY se.segment_id
      )
      SELECT
        se.effort_id,
        se.segment_id,
        se.activity_id,
        se.name as effort_name,
        se.start_date,
        se.start_date_local,
        se.elapsed_time,
        se.moving_time,
        se.distance as effort_distance,
        se.average_watts,
        se.average_heartrate,
        se.pr_rank,
        se.kom_rank,
        se.rank,
        se.start_index,
        se.end_index,
        se.device_watts,
        se.hidden,
        s.name as segment_name,
        s.activity_type,
        s.distance as segment_distance,
        s.average_grade,
        s.maximum_grade,
        s.elevation_high,
        s.elevation_low,
        s.start_latlng,
        s.end_latlng,
        s.climb_category,
        s.source as segment_source,
        s.is_auto_climb as segment_is_auto_climb,
        s.city,
        s.state,
        s.country,
        best.best_elapsed,
        CASE
          WHEN se.elapsed_time IS NOT NULL
           AND best.best_elapsed IS NOT NULL
           AND se.elapsed_time = best.best_elapsed THEN true
          ELSE false
        END AS is_pr
      FROM strava.segment_efforts se
      JOIN strava.segments s ON s.id = se.segment_id
      LEFT JOIN best ON best.segment_id = se.segment_id
      WHERE se.activity_id = $1
      ORDER BY se.start_index NULLS LAST, se.elapsed_time ASC
    `;

    const result = await db.query(query, [activityId]);

    res.json({
      activity_id: activityId,
      count: result.rows.length,
      segments: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching activity segments:', error);
    res.status(500).json({ error: 'Failed to fetch activity segments' });
  }
});

const handleRebuildLocalSegments = async (req: Request, res: Response) => {
  try {
    const activityId = Number(req.params.id);
    if (!Number.isInteger(activityId)) {
      return res.status(400).json({ error: 'Invalid activity id' });
    }

    const options = parseAutoClimbOptions(req.body || req.query);
    const namingDefaults = await getLocalClimbNamingDefaults();
    const namingOptions = parseLocalClimbNamingOptions(req.body || req.query, namingDefaults);
    const result = await rebuildLocalClimbsForActivity(db, activityId, options, namingOptions);

    if (!result.processed) {
      if (result.message === 'Activity not found') {
        return res.status(404).json({ error: result.message });
      }
      return res.status(422).json({ error: result.message });
    }

    return res.json(result);
  } catch (error: any) {
    console.error('Error rebuilding local segments for activity:', error);
    return res.status(500).json({ error: 'Failed to rebuild local segments for activity' });
  }
};

/**
 * POST /api/activities/:id/local-segments/rebuild
 * Rebuild local auto-segment efforts for one activity.
 */
router.post('/activities/:id/local-segments/rebuild', handleRebuildLocalSegments);
// Legacy alias (keep for compatibility)
router.post('/activities/:id/local-climbs/rebuild', handleRebuildLocalSegments);

/**
 * POST /api/activities/:id/local-segments/manual
 * Create one manual local segment from selected indices and backfill matching efforts.
 */
router.post('/activities/:id/local-segments/manual', async (req: Request, res: Response) => {
  try {
    const activityId = Number(req.params.id);
    if (!Number.isInteger(activityId)) {
      return res.status(400).json({ error: 'Invalid activity id' });
    }

    const startIndex = Number(req.body?.startIndex);
    const endIndex = Number(req.body?.endIndex);
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
      return res.status(400).json({ error: 'startIndex and endIndex must be integers' });
    }

    const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
    const matchingRadiusM = (() => {
      const raw = Number(req.body?.matchingRadiusM);
      return Number.isFinite(raw) ? raw : undefined;
    })();

    const namingDefaults = await getLocalClimbNamingDefaults();
    const namingOptions = parseLocalClimbNamingOptions(req.body || req.query, namingDefaults);
    const result = await createManualLocalSegmentFromActivity(db, {
      activityId,
      startIndex,
      endIndex,
      name,
      matchingRadiusM,
    }, namingOptions);
    return res.json(result);
  } catch (error: any) {
    const message = error?.message || 'Failed to create manual local segment';
    if (message === 'Activity not found') {
      return res.status(404).json({ error: message });
    }
    if (
      message.startsWith('Missing required streams')
      || message.startsWith('Invalid start or end index')
      || message.startsWith('Segment ')
    ) {
      return res.status(422).json({ error: message });
    }
    console.error('Error creating manual local segment:', error);
    return res.status(500).json({ error: 'Failed to create manual local segment' });
  }
});

const handleBackfillLocalSegments = async (req: Request, res: Response) => {
  try {
    const rawLimit = req.body?.limit ?? req.query?.limit;
    const parsedLimit = Number(rawLimit);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 100;
    const full = parseBooleanLike(req.body?.full ?? req.body?.runAll ?? req.query?.full ?? req.query?.runAll) ?? false;
    const rawBatchSize = req.body?.batchSize ?? req.body?.batch_size ?? req.query?.batchSize ?? req.query?.batch_size;
    const parsedBatchSize = Number(rawBatchSize);
    const batchSize = Number.isFinite(parsedBatchSize) ? parsedBatchSize : limit;
    const options = parseAutoClimbOptions(req.body || req.query);
    const defaultScope = await getLocalClimbBackfillDefaults();
    const namingDefaults = await getLocalClimbNamingDefaults();
    const namingOptions = parseLocalClimbNamingOptions(req.body || req.query, namingDefaults);

    const includeStrava = parseBooleanLike(req.body?.includeStrava ?? req.body?.include_strava ?? req.query?.includeStrava ?? req.query?.include_strava)
      ?? defaultScope.includeStrava;
    const includeImported = parseBooleanLike(req.body?.includeImported ?? req.body?.include_imported ?? req.query?.includeImported ?? req.query?.include_imported)
      ?? defaultScope.includeImported;
    const includeRide = parseBooleanLike(req.body?.includeRide ?? req.body?.include_ride ?? req.query?.includeRide ?? req.query?.include_ride)
      ?? defaultScope.includeRide;
    const includeRun = parseBooleanLike(req.body?.includeRun ?? req.body?.include_run ?? req.query?.includeRun ?? req.query?.include_run)
      ?? defaultScope.includeRun;

    if (!full) {
      const result = await backfillLocalClimbs(db, limit, {
        ...options,
        includeStrava,
        includeImported,
        includeRide,
        includeRun,
      }, namingOptions);
      return res.json({
        ...result,
        mode: 'single',
        batchSize: Math.max(1, Math.min(Math.floor(limit), 2000)),
        filters: {
          includeStrava,
          includeImported,
          includeRide,
          includeRun,
        },
      });
    }

    const safeBatchSize = Math.max(1, Math.min(Math.floor(batchSize), 2000));
    const summary = {
      matchedActivities: 0,
      processedActivities: 0,
      activitiesWithClimbs: 0,
      detectedClimbs: 0,
      persistedClimbs: 0,
      errors: [] as Array<{ activityId: number; message: string }>,
    };

    let offset = 0;
    let batches = 0;
    const maxBatches = 1000;

    while (batches < maxBatches) {
      const result = await backfillLocalClimbs(db, safeBatchSize, {
        ...options,
        includeStrava,
        includeImported,
        includeRide,
        includeRun,
        offset,
      }, namingOptions);

      batches += 1;
      summary.matchedActivities += result.matchedActivities;
      summary.processedActivities += result.processedActivities;
      summary.activitiesWithClimbs += result.activitiesWithClimbs;
      summary.detectedClimbs += result.detectedClimbs;
      summary.persistedClimbs += result.persistedClimbs;
      if (result.errors.length > 0) {
        summary.errors.push(...result.errors);
      }

      if (result.matchedActivities < safeBatchSize) {
        break;
      }
      offset += result.matchedActivities;
    }

    return res.json({
      ...summary,
      mode: 'full',
      batches,
      batchSize: safeBatchSize,
      filters: {
        includeStrava,
        includeImported,
        includeRide,
        includeRun,
      },
      warning: batches >= maxBatches ? 'Backfill stopped at max batch guard.' : undefined,
    });
  } catch (error: any) {
    console.error('Error backfilling local segments:', error);
    return res.status(500).json({ error: 'Failed to backfill local segments' });
  }
};

/**
 * POST /api/segments/local-segments/backfill
 * Backfill local auto-segment efforts for selected activity sources/types.
 */
router.post('/segments/local-segments/backfill', handleBackfillLocalSegments);
// Legacy alias (keep for compatibility)
router.post('/segments/local-climbs/backfill', handleBackfillLocalSegments);

const handleRepairLegacySportTypes = async (_req: Request, res: Response) => {
  try {
    const previewResult = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM strava.activities
      WHERE lower(coalesce(sport_type, '')) LIKE '%/%'
      `
    );
    const scanned = Number(previewResult.rows[0]?.total || 0);

    const updateResult = await db.query(
      `
      WITH candidates AS (
        SELECT id,
          CASE
            WHEN lower(coalesce(name,'')) ~ '(ride|bike|cycling|cycle|radfahrt|fahrt|zwift)' THEN 'Ride'
            WHEN lower(coalesce(name,'')) ~ '(^|[^a-z])(run|lauf|jog)([^a-z]|$)' THEN 'Run'
            WHEN lower(coalesce(name,'')) ~ '(walk|hike|wander|spazier)' THEN 'Walk'
            WHEN lower(coalesce(name,'')) ~ '(swim|schwimm)' THEN 'Swim'
            WHEN source = 'file' AND coalesce(distance,0) >= 30000 AND coalesce(average_speed,0) >= 3.5 THEN 'Ride'
            ELSE NULL
          END AS inferred_type
        FROM strava.activities
        WHERE lower(coalesce(sport_type,'')) LIKE '%/%'
      ),
      updated AS (
        UPDATE strava.activities a
        SET type = COALESCE(c.inferred_type, NULLIF(a.type, ''), 'Workout'),
            sport_type = COALESCE(c.inferred_type, NULLIF(a.type, ''), 'Workout'),
            updated_at = CURRENT_TIMESTAMP
        FROM candidates c
        WHERE a.id = c.id
        RETURNING
          a.id,
          a.strava_activity_id,
          a.name,
          a.type,
          a.sport_type
      )
      SELECT *
      FROM updated
      ORDER BY id
      `
    );

    return res.json({
      scanned,
      updated: updateResult.rowCount || 0,
      items: updateResult.rows.slice(0, 20),
      truncated: (updateResult.rowCount || 0) > 20,
      message: `Repaired ${updateResult.rowCount || 0} malformed sport type entr${(updateResult.rowCount || 0) === 1 ? 'y' : 'ies'}.`,
    });
  } catch (error: any) {
    console.error('Error repairing malformed activity sport types:', error);
    return res.status(500).json({ error: 'Failed to repair malformed activity sport types' });
  }
};

/**
 * POST /api/segments/local-segments/repair-legacy-sport-types
 * Repairs file-imported activities with malformed sport_type values (e.g. MIME types such as text/html).
 * Intended as a self-hosted maintenance action after parser fixes.
 */
router.post('/segments/local-segments/repair-legacy-sport-types', handleRepairLegacySportTypes);
// Legacy alias (naming compatibility)
router.post('/segments/local-climbs/repair-legacy-sport-types', handleRepairLegacySportTypes);

const handleRenameLocalSegments = async (req: Request, res: Response) => {
  try {
    const rawLimit = req.body?.limit ?? req.query?.limit;
    const parsedLimit = Number(rawLimit);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 200;
    const full = parseBooleanLike(req.body?.full ?? req.body?.runAll ?? req.query?.full ?? req.query?.runAll) ?? false;
    const rawBatchSize = req.body?.batchSize ?? req.body?.batch_size ?? req.query?.batchSize ?? req.query?.batch_size;
    const parsedBatchSize = Number(rawBatchSize);
    const batchSize = Number.isFinite(parsedBatchSize) ? parsedBatchSize : limit;
    const includeManual = parseBooleanLike(req.body?.includeManual ?? req.body?.include_manual ?? req.query?.includeManual ?? req.query?.include_manual) ?? false;
    const renameManualNames = parseBooleanLike(
      req.body?.renameManualNames
      ?? req.body?.rename_manual_names
      ?? req.query?.renameManualNames
      ?? req.query?.rename_manual_names
    ) ?? false;
    const namingDefaults = await getLocalClimbNamingDefaults();
    const namingOptions = parseLocalClimbNamingOptions(req.body || req.query, namingDefaults);

    if (!full) {
      const result = await renameLocalSegments(db, limit, {
        includeManual,
        renameManualNames,
      }, namingOptions);
      return res.json({
        ...result,
        mode: 'single',
        batchSize: Math.max(1, Math.min(Math.floor(limit), 2000)),
        includeManual,
        renameManualNames,
      });
    }

    const safeBatchSize = Math.max(1, Math.min(Math.floor(batchSize), 2000));
    const summary = {
      matchedSegments: 0,
      processedSegments: 0,
      renamedSegments: 0,
      skippedSegments: 0,
      errors: [] as Array<{ segmentId: number; message: string }>,
    };
    let offset = 0;
    let batches = 0;
    const maxBatches = 1000;

    while (batches < maxBatches) {
      const result = await renameLocalSegments(db, safeBatchSize, {
        includeManual,
        renameManualNames,
        offset,
      }, namingOptions);

      batches += 1;
      summary.matchedSegments += result.matchedSegments;
      summary.processedSegments += result.processedSegments;
      summary.renamedSegments += result.renamedSegments;
      summary.skippedSegments += result.skippedSegments;
      if (result.errors.length > 0) {
        summary.errors.push(...result.errors);
      }

      if (result.matchedSegments < safeBatchSize) {
        break;
      }
      offset += result.matchedSegments;
    }

    return res.json({
      ...summary,
      mode: 'full',
      batches,
      batchSize: safeBatchSize,
      includeManual,
      renameManualNames,
      warning: batches >= maxBatches ? 'Rename stopped at max batch guard.' : undefined,
    });
  } catch (error: any) {
    console.error('Error renaming local segments:', error);
    return res.status(500).json({ error: 'Failed to rename local segments' });
  }
};

/**
 * POST /api/segments/local-segments/rename
 * Rename existing local segments with the current naming rules.
 */
router.post('/segments/local-segments/rename', handleRenameLocalSegments);
// Legacy alias (keep for compatibility)
router.post('/segments/local-climbs/rename', handleRenameLocalSegments);

/**
 * GET /api/activities/:id/photos
 * Get photos for an activity
 */
router.get('/activities/:id/photos', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const photos = await db.getActivityPhotos(parseInt(id));
    res.json(photos);
  } catch (error: any) {
    console.error('Error fetching activity photos:', error);
    res.status(500).json({ error: 'Failed to fetch activity photos' });
  }
});

/**
 * GET /api/activities/:id/map
 * Get activity GPS track as GeoJSON
 */
router.get('/activities/:id/map', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const streams = await db.getActivityStreams(parseInt(id));
    const latlngStream = streams.find(s => s.stream_type === 'latlng');

    if (!latlngStream) {
      return res.status(404).json({ error: 'No GPS data available' });
    }

    // Convert to GeoJSON
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: latlngStream.data.map((point: [number, number]) => [
              point[1], // longitude
              point[0], // latitude
            ]),
          },
          properties: {},
        },
      ],
    };

    res.json(geojson);
  } catch (error: any) {
    console.error('Error fetching map data:', error);
    res.status(500).json({ error: 'Failed to fetch map data' });
  }
});

/**
 * GET /api/segments/:id/efforts
 * Get segment efforts for active user (fastest first)
 */
router.get('/segments/:id/efforts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '50' } = req.query;
    const segmentId = parseInt(id);

    if (!Number.isFinite(segmentId)) {
      return res.status(400).json({ error: 'Invalid segment id' });
    }

    const limitValue = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 500);

    const query = `
      WITH active_user AS (
        SELECT id FROM strava.user_profile WHERE is_active = true ORDER BY id LIMIT 1
      )
      SELECT
        se.effort_id,
        se.segment_id,
        se.activity_id,
        se.name as effort_name,
        se.start_date,
        se.start_date_local,
        se.elapsed_time,
        se.moving_time,
        se.distance as effort_distance,
        se.average_watts,
        se.average_heartrate,
        se.pr_rank,
        se.kom_rank,
        se.rank,
        se.start_index,
        se.end_index,
        se.device_watts,
        se.hidden,
        a.name as activity_name,
        a.start_date as activity_date,
        s.name as segment_name,
        s.activity_type,
        s.distance as segment_distance,
        s.average_grade,
        s.maximum_grade,
        s.elevation_high,
        s.elevation_low,
        s.start_latlng,
        s.end_latlng,
        s.climb_category,
        s.source as segment_source,
        s.is_auto_climb as segment_is_auto_climb,
        s.city,
        s.state,
        s.country
      FROM strava.segment_efforts se
      JOIN strava.activities a ON a.strava_activity_id = se.activity_id
      JOIN strava.segments s ON s.id = se.segment_id
      WHERE se.segment_id = $1
        AND COALESCE(se.user_id, (SELECT id FROM active_user)) = (SELECT id FROM active_user)
      ORDER BY se.elapsed_time ASC NULLS LAST
      LIMIT $2
    `;

    const result = await db.query(query, [segmentId, limitValue]);

    res.json({
      segment_id: segmentId,
      count: result.rows.length,
      efforts: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching segment efforts:', error);
    res.status(500).json({ error: 'Failed to fetch segment efforts' });
  }
});

/**
 * PATCH /api/segments/:id
 * Rename a local segment for the active user.
 */
router.patch('/segments/:id', async (req: Request, res: Response) => {
  try {
    const segmentId = Number(req.params.id);
    if (!Number.isInteger(segmentId)) {
      return res.status(400).json({ error: 'Invalid segment id' });
    }

    const rawName = typeof req.body?.name === 'string' ? req.body.name : '';
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      return res.status(400).json({ error: 'Segment name must be at least 2 characters' });
    }
    if (name.length > 160) {
      return res.status(400).json({ error: 'Segment name must be 160 characters or less' });
    }

    const result = await db.query(
      `
      WITH active_user AS (
        SELECT id FROM strava.user_profile WHERE is_active = true ORDER BY id LIMIT 1
      )
      UPDATE strava.segments s
      SET
        name = $2,
        is_auto_climb = false
      WHERE s.id = $1
        AND s.source = 'local'
        AND EXISTS (
          SELECT 1
          FROM strava.segment_efforts se
          WHERE se.segment_id = s.id
            AND COALESCE(se.user_id, (SELECT id FROM active_user)) = (SELECT id FROM active_user)
        )
      RETURNING s.id, s.name, s.source, s.is_auto_climb
      `,
      [segmentId, name]
    );

    const row = result.rows?.[0];
    if (!row) {
      return res.status(404).json({ error: 'Local segment not found' });
    }

    return res.json({
      segment_id: Number(row.id),
      name: String(row.name),
      source: String(row.source),
      is_auto_climb: Boolean(row.is_auto_climb),
      renamed: true,
    });
  } catch (error: any) {
    console.error('Error renaming segment:', error);
    return res.status(500).json({ error: 'Failed to rename segment' });
  }
});

/**
 * GET /api/segment-efforts/:id/streams
 * Return sliced activity streams for a single segment effort
 */
router.get('/segment-efforts/:id/streams', async (req: Request, res: Response) => {
  try {
    const effortId = parseInt(req.params.id, 10);
    if (!Number.isFinite(effortId)) {
      return res.status(400).json({ error: 'Invalid effort id' });
    }

    const effortResult = await db.query(`
      SELECT
        se.effort_id,
        se.segment_id,
        se.activity_id,
        se.start_index,
        se.end_index,
        se.elapsed_time,
        se.moving_time,
        se.distance,
        se.average_watts,
        se.average_heartrate
      FROM strava.segment_efforts se
      WHERE se.effort_id = $1
      LIMIT 1
    `, [effortId]);

    const effort = effortResult.rows[0];
    if (!effort) {
      return res.status(404).json({ error: 'Segment effort not found' });
    }

    const streams = await db.getActivityStreams(effort.activity_id);
    const startIndex = Math.max(0, Number(effort.start_index ?? 0));
    const endIndexRaw = effort.end_index !== null && effort.end_index !== undefined
      ? Number(effort.end_index)
      : null;

    const streamTypes = new Set(['time', 'distance', 'watts', 'heartrate', 'altitude', 'velocity_smooth']);
    const slicedStreams: Record<string, number[]> = {};

    streams.forEach((stream: any) => {
      if (!streamTypes.has(stream.stream_type)) return;
      if (!Array.isArray(stream.data)) return;
      const endIndex = endIndexRaw !== null ? Math.min(endIndexRaw, stream.data.length - 1) : stream.data.length - 1;
      if (endIndex < startIndex) return;
      slicedStreams[stream.stream_type] = stream.data.slice(startIndex, endIndex + 1);
    });

    res.json({
      effort_id: effort.effort_id,
      segment_id: effort.segment_id,
      activity_id: effort.activity_id,
      start_index: effort.start_index,
      end_index: effort.end_index,
      elapsed_time: effort.elapsed_time,
      moving_time: effort.moving_time,
      distance: effort.distance,
      average_watts: effort.average_watts,
      average_heartrate: effort.average_heartrate,
      streams: slicedStreams,
    });
  } catch (error: any) {
    console.error('Error fetching segment effort streams:', error);
    res.status(500).json({ error: 'Failed to fetch segment effort streams' });
  }
});

/**
 * GET /api/segments/summary
 * Summary stats + strength profile + map segments
 */
router.get('/segments/summary', async (req: Request, res: Response) => {
  try {
    const mapLimit = Math.min(Math.max(parseInt(req.query.map_limit as string, 10) || 200, 50), 1000);
    const source = parseSegmentSourceFilter(req.query.source);
    const segmentTypes = parseSegmentTypeFilters(req.query.segment_types ?? req.query.types);
    const { clauses: segmentFilterClauses, params: segmentFilterParams } = buildSegmentSourceAndTypeFilters(
      source,
      segmentTypes,
      { tableAlias: 's', paramOffset: 0 }
    );
    const segmentBaseFilterSql = segmentFilterClauses.length > 0
      ? ` AND ${segmentFilterClauses.join(' AND ')}`
      : '';
    const mapLimitParam = segmentFilterParams.length + 1;

    const summaryQuery = `
      WITH active_user AS (
        SELECT id FROM strava.user_profile WHERE is_active = true ORDER BY id LIMIT 1
      ),
      base AS (
        SELECT se.segment_id, se.elapsed_time, se.start_date, s.distance, s.average_grade
        FROM strava.segment_efforts se
        JOIN strava.segments s ON s.id = se.segment_id
        WHERE COALESCE(se.user_id, (SELECT id FROM active_user)) = (SELECT id FROM active_user)
        ${segmentBaseFilterSql}
      ),
      per_segment AS (
        SELECT
          segment_id,
          COUNT(*) AS attempts,
          MIN(elapsed_time) AS best_elapsed,
          MIN(start_date) AS first_date,
          MAX(start_date) AS last_date,
          AVG(distance) AS avg_distance,
          AVG(average_grade) AS avg_grade
        FROM base
        GROUP BY segment_id
      ),
      pr_counts AS (
        SELECT base.segment_id,
          SUM(CASE WHEN base.elapsed_time IS NOT NULL AND base.elapsed_time = per_segment.best_elapsed THEN 1 ELSE 0 END) AS pr_count
        FROM base
        JOIN per_segment ON per_segment.segment_id = base.segment_id
        GROUP BY base.segment_id
      )
      SELECT
        COUNT(*) AS total_segments,
        SUM(attempts) AS total_efforts,
        SUM(pr_counts.pr_count) AS total_prs,
        AVG(avg_grade) AS avg_grade,
        AVG(avg_distance) AS avg_distance,
        SUM(CASE WHEN attempts >= 3 THEN 1 ELSE 0 END) AS segments_3plus
      FROM per_segment
      LEFT JOIN pr_counts ON pr_counts.segment_id = per_segment.segment_id
    `;

    const strengthQuery = `
      WITH active_user AS (
        SELECT id FROM strava.user_profile WHERE is_active = true ORDER BY id LIMIT 1
      ),
      base AS (
        SELECT se.segment_id, se.elapsed_time, s.distance, s.average_grade
        FROM strava.segment_efforts se
        JOIN strava.segments s ON s.id = se.segment_id
        WHERE COALESCE(se.user_id, (SELECT id FROM active_user)) = (SELECT id FROM active_user)
        ${segmentBaseFilterSql}
      ),
      per_segment AS (
        SELECT
          segment_id,
          MIN(elapsed_time) AS best_elapsed,
          AVG(distance) AS avg_distance,
          AVG(average_grade) AS avg_grade
        FROM base
        GROUP BY segment_id
      ),
      buckets AS (
        SELECT
          CASE
            WHEN best_elapsed < 60 THEN 'Sprint <1m'
            WHEN best_elapsed < 180 THEN '1-3m'
            WHEN best_elapsed < 300 THEN '3-5m'
            WHEN best_elapsed < 600 THEN '5-10m'
            WHEN best_elapsed < 900 THEN '10-15m'
            ELSE '>15m'
          END AS bucket,
          avg_grade,
          avg_distance
        FROM per_segment
        WHERE best_elapsed IS NOT NULL
      )
      SELECT
        bucket,
        COUNT(*) AS segments,
        AVG(avg_grade) AS avg_grade,
        AVG(avg_distance) AS avg_distance
      FROM buckets
      GROUP BY bucket
      ORDER BY CASE
        WHEN bucket = 'Sprint <1m' THEN 1
        WHEN bucket = '1-3m' THEN 2
        WHEN bucket = '3-5m' THEN 3
        WHEN bucket = '5-10m' THEN 4
        WHEN bucket = '10-15m' THEN 5
        ELSE 6
      END
    `;

    const mapQuery = `
      WITH active_user AS (
        SELECT id FROM strava.user_profile WHERE is_active = true ORDER BY id LIMIT 1
      )
      SELECT
        s.id AS segment_id,
        s.name,
        s.start_latlng,
        s.end_latlng,
        COUNT(*) AS attempts,
        MIN(se.elapsed_time) AS best_elapsed
      FROM strava.segment_efforts se
      JOIN strava.segments s ON s.id = se.segment_id
      WHERE COALESCE(se.user_id, (SELECT id FROM active_user)) = (SELECT id FROM active_user)
        ${segmentBaseFilterSql}
        AND s.start_latlng IS NOT NULL
        AND s.end_latlng IS NOT NULL
      GROUP BY s.id, s.name, s.start_latlng, s.end_latlng
      ORDER BY attempts DESC
      LIMIT $${mapLimitParam}
    `;

    const summaryResult = await db.query(summaryQuery, segmentFilterParams);
    const strengthResult = await db.query(strengthQuery, segmentFilterParams);
    const mapResult = await db.query(mapQuery, [...segmentFilterParams, mapLimit]);

    res.json({
      summary: summaryResult.rows[0] || {
        total_segments: 0,
        total_efforts: 0,
        total_prs: 0,
        avg_grade: 0,
        avg_distance: 0,
        segments_3plus: 0,
      },
      strength_profile: strengthResult.rows,
      map_segments: mapResult.rows,
    });
  } catch (error: any) {
    console.error('Error fetching segment summary:', error);
    res.status(500).json({ error: 'Failed to fetch segment summary' });
  }
});

/**
 * GET /api/segments
 * List segments with stats for active user
 */
router.get('/segments', async (req: Request, res: Response) => {
  try {
    const sort = (req.query.sort as string) || 'attempts';
    const order = (req.query.order as string) === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 500);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
    const search = (req.query.search as string) || '';
    const source = parseSegmentSourceFilter(req.query.source);
    const segmentTypes = parseSegmentTypeFilters(req.query.segment_types ?? req.query.types);
    const segmentTypeWhere = buildSegmentTypeWhereClause(segmentTypes, 's');

    const sortMap: Record<string, string> = {
      attempts: 'p.attempts',
      improvement: 'improvement',
      best_elapsed: 'p.best_elapsed',
      best_avg_watts: 'be.average_watts',
      best_avg_heartrate: 'be.average_heartrate',
      last_date: 'p.last_date',
      distance: 's.distance',
      avg_grade: 's.average_grade',
      difficulty: "CASE WHEN s.climb_category IS NULL THEN NULL WHEN s.climb_category <= 0 THEN 7 ELSE 7 - LEAST(6, s.climb_category) END",
      name: 'p.name',
    };

    const sortColumn = sortMap[sort] || 'p.attempts';
    const listParams: Array<number | string> = [limit, offset];
    const listWhereClauses: string[] = [];

    if (search) {
      listParams.push(`%${search}%`);
      listWhereClauses.push(`s.name ILIKE $${listParams.length}`);
    }

    if (source !== 'all') {
      listParams.push(source);
      listWhereClauses.push(`s.source = $${listParams.length}`);
    }
    if (segmentTypeWhere) {
      listWhereClauses.push(segmentTypeWhere);
    }

    const listWhere = listWhereClauses.length > 0
      ? `WHERE ${listWhereClauses.join(' AND ')}`
      : '';

    const listQuery = `
      WITH active_user AS (
        SELECT id FROM strava.user_profile WHERE is_active = true ORDER BY id LIMIT 1
      ),
      base AS (
        SELECT
          se.segment_id,
          se.elapsed_time,
          se.start_date,
          se.average_watts,
          se.average_heartrate
        FROM strava.segment_efforts se
        WHERE COALESCE(se.user_id, (SELECT id FROM active_user)) = (SELECT id FROM active_user)
      ),
      per_segment AS (
        SELECT
          segment_id,
          COUNT(*) AS attempts,
          MIN(elapsed_time) AS best_elapsed,
          MAX(elapsed_time) AS worst_elapsed,
          MIN(start_date) AS first_date,
          MAX(start_date) AS last_date
        FROM base
        GROUP BY segment_id
      ),
      first_effort AS (
        SELECT DISTINCT ON (segment_id)
          segment_id,
          elapsed_time AS first_elapsed
        FROM base
        ORDER BY segment_id, start_date ASC NULLS LAST
      ),
      last_effort AS (
        SELECT DISTINCT ON (segment_id)
          segment_id,
          elapsed_time AS last_elapsed
        FROM base
        ORDER BY segment_id, start_date DESC NULLS LAST
      ),
      best_effort AS (
        SELECT DISTINCT ON (segment_id)
          segment_id,
          elapsed_time,
          average_watts,
          average_heartrate
        FROM base
        WHERE elapsed_time IS NOT NULL
        ORDER BY segment_id, elapsed_time ASC NULLS LAST, start_date ASC NULLS LAST
      ),
      pr_counts AS (
        SELECT base.segment_id,
          SUM(CASE WHEN base.elapsed_time IS NOT NULL AND base.elapsed_time = per_segment.best_elapsed THEN 1 ELSE 0 END) AS pr_count
        FROM base
        JOIN per_segment ON per_segment.segment_id = base.segment_id
        GROUP BY base.segment_id
      )
      SELECT
        p.segment_id,
        s.name,
        s.source,
        s.distance,
        s.average_grade,
        s.climb_category,
        s.city,
        s.state,
        s.country,
        s.start_latlng,
        s.end_latlng,
        s.is_auto_climb,
        p.attempts,
        p.best_elapsed,
        p.worst_elapsed,
        p.first_date,
        p.last_date,
        fe.first_elapsed,
        le.last_elapsed,
        be.average_watts AS best_avg_watts,
        be.average_heartrate AS best_avg_heartrate,
        pc.pr_count,
        CASE WHEN p.attempts > 0 THEN pc.pr_count::float / p.attempts ELSE 0 END AS pr_rate,
        CASE WHEN fe.first_elapsed IS NOT NULL AND p.best_elapsed IS NOT NULL THEN fe.first_elapsed - p.best_elapsed END AS improvement
      FROM per_segment p
      JOIN strava.segments s ON s.id = p.segment_id
      LEFT JOIN first_effort fe ON fe.segment_id = p.segment_id
      LEFT JOIN last_effort le ON le.segment_id = p.segment_id
      LEFT JOIN best_effort be ON be.segment_id = p.segment_id
      LEFT JOIN pr_counts pc ON pc.segment_id = p.segment_id
      ${listWhere}
      ORDER BY ${sortColumn} ${order} NULLS LAST
      LIMIT $1 OFFSET $2
    `;

    const countBaseFilters: string[] = [];
    const countParams: string[] = [];

    if (source !== 'all') {
      countParams.push(source);
      countBaseFilters.push(`s.source = $${countParams.length}`);
    }
    if (segmentTypeWhere) {
      countBaseFilters.push(segmentTypeWhere);
    }

    const countBaseWhere = countBaseFilters.length > 0
      ? ` AND ${countBaseFilters.join(' AND ')}`
      : '';

    const countSearchClause = search
      ? (() => {
          countParams.push(`%${search}%`);
          return `WHERE name ILIKE $${countParams.length}`;
        })()
      : '';

    const countQuery = `
      WITH active_user AS (
        SELECT id FROM strava.user_profile WHERE is_active = true ORDER BY id LIMIT 1
      ),
      base AS (
        SELECT se.segment_id, s.name
        FROM strava.segment_efforts se
        JOIN strava.segments s ON s.id = se.segment_id
        WHERE COALESCE(se.user_id, (SELECT id FROM active_user)) = (SELECT id FROM active_user)
        ${countBaseWhere}
      ),
      per_segment AS (
        SELECT segment_id, MAX(name) AS name
        FROM base
        GROUP BY segment_id
      )
      SELECT COUNT(*) AS total
      FROM per_segment
      ${countSearchClause}
    `;

    const listResult = await db.query(listQuery, listParams);
    const countResult = await db.query(countQuery, countParams);

    res.json({
      total: parseInt(countResult.rows[0]?.total) || 0,
      count: listResult.rows.length,
      segments: listResult.rows,
    });
  } catch (error: any) {
    console.error('Error fetching segments list:', error);
    res.status(500).json({ error: 'Failed to fetch segments list' });
  }
});

/**
 * GET /api/activities/:id/power-curve
 * Calculate best power efforts for an activity
 */
router.get('/activities/:id/power-curve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const streams = await db.getActivityStreams(parseInt(id));
    const wattsStream = streams.find(s => s.stream_type === 'watts');
    const timeStream = streams.find(s => s.stream_type === 'time');

    if (!wattsStream || !wattsStream.data || wattsStream.data.length === 0) {
      return res.json({ durations: [], message: 'No power data available' });
    }

    const watts: number[] = wattsStream.data;

    // Calculate best average power for each duration (extended to 2 hours)
    const durations = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 2700, 3600, 5400, 7200]; // seconds
    const durationLabels = ['5s', '10s', '30s', '1min', '2min', '5min', '10min', '20min', '30min', '45min', '1hr', '1:30h', '2hr'];

    const results = durations.map((duration, idx) => {
      if (watts.length < duration) {
        return { duration, label: durationLabels[idx], watts: null };
      }

      let maxAvg = 0;
      for (let i = 0; i <= watts.length - duration; i++) {
        const slice = watts.slice(i, i + duration);
        const avg = slice.reduce((a, b) => a + b, 0) / duration;
        if (avg > maxAvg) maxAvg = avg;
      }

      return { duration, label: durationLabels[idx], watts: Math.round(maxAvg) };
    });

    res.json({
      activity_id: parseInt(id),
      durations: results.filter(r => r.watts !== null),
    });
  } catch (error: any) {
    console.error('Error calculating power curve:', error);
    res.status(500).json({ error: 'Failed to calculate power curve' });
  }
});

/**
 * GET /api/activities/:id/km-splits
 * Calculate kilometer splits for running activities
 */
router.get('/activities/:id/km-splits', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get activity to check type
    const activity = await db.getActivityByStravaId(parseInt(id));
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Only calculate splits for running activities
    const isRun = activity.type === 'Run' || activity.type === 'TrailRun' || activity.type === 'VirtualRun';
    if (!isRun) {
      return res.json({ splits: [], message: 'Splits only available for running activities' });
    }

    // Get distance and time streams
    const streams = await db.getActivityStreams(parseInt(id));
    const distanceStream = streams.find(s => s.stream_type === 'distance');
    const timeStream = streams.find(s => s.stream_type === 'time');

    if (!distanceStream || !timeStream || !distanceStream.data || !timeStream.data) {
      return res.json({ splits: [], message: 'No distance/time data available' });
    }

    const distances: number[] = distanceStream.data; // in meters
    const times: number[] = timeStream.data; // in seconds

    // Calculate splits per kilometer
    const splits: Array<{
      km: number;
      time: number; // seconds for this km
      pace: string; // min:sec per km
      avgHr?: number;
    }> = [];

    let currentKm = 1;
    let lastIndex = 0;
    const totalDistance = distances[distances.length - 1];
    const totalKm = Math.floor(totalDistance / 1000);

    // Get heart rate stream if available
    const hrStream = streams.find(s => s.stream_type === 'heartrate');
    const heartRates = hrStream?.data as number[] | undefined;

    for (let km = 1; km <= totalKm; km++) {
      const targetDistance = km * 1000; // meters

      // Find index where distance crosses this km mark
      const kmIndex = distances.findIndex((d, idx) => idx > lastIndex && d >= targetDistance);

      if (kmIndex === -1) break;

      // Calculate time for this km
      const splitTime = times[kmIndex] - (lastIndex > 0 ? times[lastIndex] : 0);

      // Convert to pace (min:sec per km)
      const paceMinPerKm = splitTime / 60;
      const minutes = Math.floor(paceMinPerKm);
      const seconds = Math.round((paceMinPerKm - minutes) * 60);
      const pace = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // Calculate average HR for this km if available
      let avgHr: number | undefined;
      if (heartRates) {
        const hrSlice = heartRates.slice(lastIndex, kmIndex + 1);
        const validHrs = hrSlice.filter(hr => hr > 0);
        if (validHrs.length > 0) {
          avgHr = Math.round(validHrs.reduce((a, b) => a + b, 0) / validHrs.length);
        }
      }

      splits.push({
        km,
        time: Math.round(splitTime),
        pace,
        avgHr,
      });

      lastIndex = kmIndex;
    }

    // Add partial last km if remaining distance > 100m
    const remainingDistance = totalDistance - (totalKm * 1000);
    if (remainingDistance > 100) {
      const lastSplitTime = times[times.length - 1] - times[lastIndex];
      const lastSplitDistance = remainingDistance / 1000;

      // Normalize to pace per km
      const paceMinPerKm = (lastSplitTime / lastSplitDistance) / 60;
      const minutes = Math.floor(paceMinPerKm);
      const seconds = Math.round((paceMinPerKm - minutes) * 60);
      const pace = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      let avgHr: number | undefined;
      if (heartRates) {
        const hrSlice = heartRates.slice(lastIndex);
        const validHrs = hrSlice.filter(hr => hr > 0);
        if (validHrs.length > 0) {
          avgHr = Math.round(validHrs.reduce((a, b) => a + b, 0) / validHrs.length);
        }
      }

      splits.push({
        km: parseFloat((totalKm + lastSplitDistance).toFixed(2)),
        time: Math.round(lastSplitTime),
        pace,
        avgHr,
      });
    }

    res.json({
      activity_id: parseInt(id),
      splits,
      total_distance_km: (totalDistance / 1000).toFixed(2),
    });
  } catch (error: any) {
    console.error('Error calculating km splits:', error);
    res.status(500).json({ error: 'Failed to calculate km splits' });
  }
});

/**
 * GET /api/activities/:id/vam
 * Calculate VAM (Velocità Ascensionale Media) for an activity
 * VAM is calculated by analyzing climbing segments with >25m elevation gain
 * Returns: vam (m/h), total climbing time, total elevation gain, climb segments
 */
router.get('/activities/:id/vam', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const minClimbHeight = req.query.minHeight ? parseInt(req.query.minHeight as string) : 25;

    // Get activity
    const activity = await db.getActivityByStravaId(parseInt(id));
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Get altitude and time streams
    const streams = await db.getActivityStreams(parseInt(id));
    const altitudeStream = streams.find(s => s.stream_type === 'altitude');
    const timeStream = streams.find(s => s.stream_type === 'time');

    if (!altitudeStream || !timeStream || !altitudeStream.data || !timeStream.data) {
      return res.json({
        activity_id: parseInt(id),
        vam: 0,
        totalClimbingTime: 0,
        totalElevationGain: 0,
        climbSegments: [],
        message: 'No altitude/time stream data available'
      });
    }

    // Import VAM calculation function
    const { calculateVAM } = await import('../services/vam');

    // Calculate VAM
    const result = calculateVAM(altitudeStream.data, timeStream.data, minClimbHeight);

    if (!result) {
      return res.json({
        activity_id: parseInt(id),
        vam: 0,
        totalClimbingTime: 0,
        totalElevationGain: 0,
        climbSegments: [],
        message: 'Unable to calculate VAM from available data'
      });
    }

    res.json({
      activity_id: parseInt(id),
      vam: result.vam,
      totalClimbingTime: result.totalClimbingTime,
      totalElevationGain: result.totalElevationGain,
      climbSegments: result.climbSegments.map(seg => ({
        elevationGain: Math.round(seg.elevationGain),
        duration: Math.round(seg.duration)
      })),
      minClimbHeight
    });
  } catch (error: any) {
    console.error('Error calculating VAM:', error);
    res.status(500).json({ error: 'Failed to calculate VAM' });
  }
});

/**
 * GET /api/top-vam-activities
 * Get activities with highest VAM values
 * Query params: limit (default 50), year, type
 */
router.get('/top-vam-activities', async (req: Request, res: Response) => {
  try {
    const { limit = '50', year, type } = req.query;

    // Build query to get activities with altitude streams
    let query = `
      SELECT DISTINCT
        a.strava_activity_id,
        a.name,
        a.type,
        a.start_date,
        a.distance / 1000 as distance_km,
        a.moving_time,
        a.total_elevation_gain,
        EXTRACT(YEAR FROM a.start_date) as year
      FROM strava.activities a
      JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id
      WHERE s.stream_type = 'altitude'
        AND a.total_elevation_gain > 100
    `;

    const params: any[] = [];
    let paramIdx = 1;

    if (year) {
      query += ` AND EXTRACT(YEAR FROM a.start_date) = $${paramIdx}`;
      params.push(parseInt(year as string));
      paramIdx++;
    }

    if (type) {
      if (type === 'Ride') {
        // Include both Ride and VirtualRide
        query += ` AND a.type IN ('Ride', 'VirtualRide')`;
      } else {
        query += ` AND a.type = $${paramIdx}`;
        params.push(type);
        paramIdx++;
      }
    }

    // Fetch more activities than requested limit to ensure we get enough with valid VAM
    // (some activities might have 0 VAM after calculation)
    const fetchLimit = Math.max(parseInt(limit as string) * 3, 150);
    query += ` ORDER BY a.total_elevation_gain DESC LIMIT $${paramIdx}`;
    params.push(fetchLimit);

    const activitiesResult = await db.query(query, params);

    // Calculate VAM for each activity
    const { calculateVAMFromStreams } = await import('../services/vam');

    const activitiesWithVAM = await Promise.all(
      activitiesResult.rows.map(async (activity: any) => {
        // Get streams for this activity
        const streams = await db.getActivityStreams(activity.strava_activity_id);

        // Calculate VAM
        const vamResult = calculateVAMFromStreams(streams, 25);

        return {
          strava_activity_id: activity.strava_activity_id,
          name: activity.name,
          type: activity.type,
          start_date: activity.start_date,
          distance_km: parseFloat(activity.distance_km),
          moving_time: activity.moving_time,
          total_elevation_gain: parseFloat(activity.total_elevation_gain),
          year: activity.year,
          vam: vamResult?.vam || 0,
          climbing_time: vamResult?.totalClimbingTime || 0,
          climb_count: vamResult?.climbSegments.length || 0,
        };
      })
    );

    // Filter out activities with VAM = 0 and sort by VAM descending
    const validActivities = activitiesWithVAM
      .filter(a => a.vam > 0)
      .sort((a, b) => b.vam - a.vam)
      .slice(0, parseInt(limit as string)); // Apply requested limit after sorting by VAM

    res.json({
      activities: validActivities,
      count: validActivities.length,
    });
  } catch (error: any) {
    console.error('Error fetching top VAM activities:', error);
    res.status(500).json({ error: 'Failed to fetch top VAM activities' });
  }
});

/**
 * GET /api/running-best-efforts
 * Calculate best running efforts for standard distances
 */
router.get('/running-best-efforts', async (req: Request, res: Response) => {
  try {
    const { year, months } = req.query;

    // Build query to get running activities with distance/time streams
    let activityQuery = `
      SELECT DISTINCT a.strava_activity_id, a.start_date, a.name,
             EXTRACT(YEAR FROM a.start_date) as year
      FROM strava.activities a
      JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id
      WHERE (a.type = 'Run' OR a.type = 'TrailRun' OR a.type = 'VirtualRun')
        AND s.stream_type = 'distance'
    `;

    const params: any[] = [];
    let paramIdx = 1;

    if (year) {
      activityQuery += ` AND EXTRACT(YEAR FROM a.start_date) = $${paramIdx}`;
      params.push(parseInt(year as string));
      paramIdx++;
    }

    if (months) {
      activityQuery += ` AND a.start_date >= NOW() - INTERVAL '${parseInt(months as string)} months'`;
    }

    activityQuery += ` ORDER BY a.start_date DESC`;

    const activitiesResult = await db.query(activityQuery, params);

    // Standard running distances in meters
    const distances = [
      { meters: 1000, label: '1 km' },
      { meters: 5000, label: '5 km' },
      { meters: 10000, label: '10 km' },
      { meters: 21097, label: 'Half Marathon' },
      { meters: 42195, label: 'Marathon' },
    ];

    // Initialize best efforts
    interface BestEffort {
      distance_meters: number;
      label: string;
      time_seconds: number | null;
      pace: string | null;
      activity_id: number | null;
      activity_name: string | null;
      activity_date: string | null;
      avg_hr: number | null;
    }

    const bestEfforts: BestEffort[] = distances.map(d => ({
      distance_meters: d.meters,
      label: d.label,
      time_seconds: null,
      pace: null,
      activity_id: null,
      activity_name: null,
      activity_date: null,
      avg_hr: null,
    }));

    // Process each activity
    for (const activity of activitiesResult.rows) {
      const streams = await db.getActivityStreams(activity.strava_activity_id);
      const distanceStream = streams.find(s => s.stream_type === 'distance');
      const timeStream = streams.find(s => s.stream_type === 'time');
      const hrStream = streams.find(s => s.stream_type === 'heartrate');

      if (!distanceStream?.data || !timeStream?.data) continue;

      const distanceData: number[] = distanceStream.data;
      const timeData: number[] = timeStream.data;
      const hrData: number[] | undefined = hrStream?.data;

      // Check each target distance
      for (let i = 0; i < distances.length; i++) {
        const targetDistance = distances[i].meters;
        const totalDistance = distanceData[distanceData.length - 1];

        // Skip if activity is shorter than target distance
        if (totalDistance < targetDistance) continue;

        // Find best rolling average for this distance
        let bestTime = Infinity;
        let bestStartIdx = 0;
        let bestEndIdx = 0;

        for (let startIdx = 0; startIdx < distanceData.length; startIdx++) {
          const startDistance = distanceData[startIdx];

          // Find where we reach target distance from this start point
          const endIdx = distanceData.findIndex((d, idx) =>
            idx > startIdx && (d - startDistance) >= targetDistance
          );

          if (endIdx === -1) break;

          const timeTaken = timeData[endIdx] - timeData[startIdx];

          if (timeTaken < bestTime) {
            bestTime = timeTaken;
            bestStartIdx = startIdx;
            bestEndIdx = endIdx;
          }
        }

        // Update best effort if this is faster
        if (bestTime !== Infinity &&
            (bestEfforts[i].time_seconds === null || bestTime < bestEfforts[i].time_seconds!)) {

          // Calculate average HR for this segment
          let avgHr: number | null = null;
          if (hrData) {
            const hrSegment = hrData.slice(bestStartIdx, bestEndIdx + 1).filter(hr => hr > 0);
            if (hrSegment.length > 0) {
              avgHr = Math.round(hrSegment.reduce((a, b) => a + b, 0) / hrSegment.length);
            }
          }

          // Calculate pace (min/km)
          const paceMinPerKm = (bestTime / 60) / (targetDistance / 1000);
          const minutes = Math.floor(paceMinPerKm);
          const seconds = Math.round((paceMinPerKm - minutes) * 60);
          const pace = `${minutes}:${seconds.toString().padStart(2, '0')}`;

          bestEfforts[i] = {
            distance_meters: targetDistance,
            label: distances[i].label,
            time_seconds: Math.round(bestTime),
            pace,
            activity_id: activity.strava_activity_id,
            activity_name: activity.name,
            activity_date: activity.start_date,
            avg_hr: avgHr,
          };
        }
      }
    }

    res.json({
      efforts: bestEfforts.filter(e => e.time_seconds !== null),
      activities_analyzed: activitiesResult.rows.length,
    });
  } catch (error: any) {
    console.error('Error calculating running best efforts:', error);
    res.status(500).json({ error: 'Failed to calculate running best efforts' });
  }
});

/**
 * GET /api/running-pace-trends
 * Get running pace and heart rate trends over time
 */
router.get('/running-pace-trends', async (req: Request, res: Response) => {
  try {
    const { months = '12', groupBy = 'month' } = req.query;

    const monthsNum = parseInt(months as string);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsNum);

    // Query running activities with pace and HR data
    const query = `
      SELECT
        a.strava_activity_id,
        a.start_date,
        a.name,
        a.distance / 1000 as distance_km,
        a.moving_time,
        a.average_speed * 3.6 as avg_speed_kmh,
        a.average_heartrate,
        CASE
          WHEN $2 = 'week' THEN DATE_TRUNC('week', a.start_date)
          ELSE DATE_TRUNC('month', a.start_date)
        END as period
      FROM strava.activities a
      WHERE (a.type = 'Run' OR a.type = 'TrailRun' OR a.type = 'VirtualRun')
        AND a.start_date >= $1
        AND a.distance > 1000
        AND a.average_speed > 0
      ORDER BY a.start_date ASC
    `;

    const result = await db.query(query, [startDate.toISOString(), groupBy]);

    // Group by period
    const grouped = new Map<string, {
      activities: number;
      totalDistance: number;
      totalTime: number;
      avgSpeedSum: number;
      hrSum: number;
      hrCount: number;
      activities_list: any[];
    }>();

    for (const row of result.rows) {
      const periodKey = row.period.toISOString();

      if (!grouped.has(periodKey)) {
        grouped.set(periodKey, {
          activities: 0,
          totalDistance: 0,
          totalTime: 0,
          avgSpeedSum: 0,
          hrSum: 0,
          hrCount: 0,
          activities_list: [],
        });
      }

      const group = grouped.get(periodKey)!;
      group.activities++;
      group.totalDistance += parseFloat(row.distance_km);
      group.totalTime += row.moving_time;
      group.avgSpeedSum += parseFloat(row.avg_speed_kmh);

      if (row.average_heartrate) {
        group.hrSum += row.average_heartrate;
        group.hrCount++;
      }

      group.activities_list.push({
        id: row.strava_activity_id,
        date: row.start_date,
        name: row.name,
      });
    }

    // Calculate trends
    const trends = Array.from(grouped.entries()).map(([periodKey, data]) => {
      const avgSpeedKmh = data.avgSpeedSum / data.activities;
      const avgPaceMinPerKm = avgSpeedKmh > 0 ? 60 / avgSpeedKmh : 0;
      const avgPaceMinutes = Math.floor(avgPaceMinPerKm);
      const avgPaceSeconds = Math.round((avgPaceMinPerKm - avgPaceMinutes) * 60);
      const avgPace = `${avgPaceMinutes}:${avgPaceSeconds.toString().padStart(2, '0')}`;

      return {
        period: periodKey,
        activities_count: data.activities,
        total_distance_km: Math.round(data.totalDistance * 10) / 10,
        avg_pace: avgPace,
        avg_pace_decimal: avgPaceMinPerKm, // For charting
        avg_hr: data.hrCount > 0 ? Math.round(data.hrSum / data.hrCount) : null,
        avg_distance_km: Math.round((data.totalDistance / data.activities) * 10) / 10,
      };
    });

    res.json({
      trends,
      total_activities: result.rows.length,
      date_range: {
        from: startDate.toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
      },
    });
  } catch (error: any) {
    console.error('Error calculating running pace trends:', error);
    res.status(500).json({ error: 'Failed to calculate running pace trends' });
  }
});

/**
 * GET /api/running-activities
 * Get all running activities with pace data for charting
 */
router.get('/running-activities', async (req: Request, res: Response) => {
  try {
    const { months } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (months && months !== 'undefined') {
      const monthsAgo = new Date();
      monthsAgo.setMonth(monthsAgo.getMonth() - parseInt(months as string));
      dateFilter = 'AND a.start_date >= $1';
      params.push(monthsAgo.toISOString());
    }

    const result = await db.query(`
      SELECT
        a.strava_activity_id,
        a.name,
        a.start_date,
        a.distance / 1000 as distance_km,
        a.moving_time,
        a.average_speed * 3.6 as avg_speed_kmh,
        a.average_heartrate,
        a.type
      FROM strava.activities a
      WHERE (a.type = 'Run' OR a.type = 'TrailRun' OR a.type = 'VirtualRun')
        AND a.distance > 1000
        AND a.average_speed > 0
        ${dateFilter}
      ORDER BY a.start_date ASC
    `, params);

    const activities = result.rows.map((row: any) => {
      const avgSpeedKmh = parseFloat(row.avg_speed_kmh);
      const avgPaceMinPerKm = avgSpeedKmh > 0 ? 60 / avgSpeedKmh : 0;

      return {
        activity_id: row.strava_activity_id,
        name: row.name,
        date: row.start_date,
        distance_km: parseFloat(row.distance_km),
        moving_time: row.moving_time,
        avg_pace_decimal: avgPaceMinPerKm,
        avg_pace: `${Math.floor(avgPaceMinPerKm)}:${Math.round((avgPaceMinPerKm - Math.floor(avgPaceMinPerKm)) * 60).toString().padStart(2, '0')}`,
        avg_hr: row.average_heartrate ? Math.round(parseFloat(row.average_heartrate)) : null,
        type: row.type
      };
    });

    res.json({
      activities,
      total_activities: activities.length
    });
  } catch (error: any) {
    console.error('Error fetching running activities:', error);
    res.status(500).json({ error: 'Failed to fetch running activities' });
  }
});

/**
 * GET /api/power-curve
 * Get aggregated power curve (best efforts across all activities, optionally by year)
 */
router.get('/power-curve', async (req: Request, res: Response) => {
  try {
    const { year, type } = req.query;

    // Build query to get all activities with power data
    let activityQuery = `
      SELECT a.strava_activity_id, EXTRACT(YEAR FROM a.start_date) as year
      FROM strava.activities a
      JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id
      WHERE s.stream_type = 'watts'
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (year) {
      activityQuery += ` AND EXTRACT(YEAR FROM a.start_date) = $${paramIdx}`;
      params.push(parseInt(year as string));
      paramIdx++;
    }

    if (type) {
      activityQuery += ` AND a.type = $${paramIdx}`;
      params.push(type);
    }

    const activitiesResult = await db.query(activityQuery, params);

    // Extended durations up to 2 hours
    const durations = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 2700, 3600, 5400, 7200];
    const durationLabels = ['5s', '10s', '30s', '1min', '2min', '5min', '10min', '20min', '30min', '45min', '1hr', '1:30h', '2hr'];

    // Initialize best values per duration
    const bestEfforts: { [key: number]: { watts: number; activity_id: number } } = {};
    durations.forEach(d => bestEfforts[d] = { watts: 0, activity_id: 0 });

    // Process each activity
    for (const activity of activitiesResult.rows) {
      const streams = await db.getActivityStreams(activity.strava_activity_id);
      const wattsStream = streams.find(s => s.stream_type === 'watts');
      if (!wattsStream || !wattsStream.data) continue;

      const watts: number[] = wattsStream.data;

      for (const duration of durations) {
        if (watts.length < duration) continue;

        let maxAvg = 0;
        for (let i = 0; i <= watts.length - duration; i++) {
          const slice = watts.slice(i, i + duration);
          const avg = slice.reduce((a, b) => a + b, 0) / duration;
          if (avg > maxAvg) maxAvg = avg;
        }

        if (maxAvg > bestEfforts[duration].watts) {
          bestEfforts[duration] = { watts: Math.round(maxAvg), activity_id: activity.strava_activity_id };
        }
      }
    }

    const results = durations.map((d, idx) => ({
      duration: d,
      label: durationLabels[idx],
      watts: bestEfforts[d].watts || null,
      activity_id: bestEfforts[d].activity_id || null,
    }));

    res.json({
      year: year || 'all',
      type: type || 'all',
      activities_analyzed: activitiesResult.rows.length,
      durations: results.filter(r => r.watts !== null && r.watts > 0),
    });
  } catch (error: any) {
    console.error('Error calculating power curve:', error);
    res.status(500).json({ error: 'Failed to calculate power curve' });
  }
});

/**
 * GET /api/power-curve/yearly
 * Get power curve comparison by year
 */
router.get('/power-curve/yearly', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    // Get all years with power data
    let yearsQuery = `
      SELECT DISTINCT EXTRACT(YEAR FROM a.start_date)::int as year
      FROM strava.activities a
      JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id
      WHERE s.stream_type = 'watts'
    `;
    if (type) {
      yearsQuery += ` AND a.type = $1`;
    }
    yearsQuery += ` ORDER BY year DESC`;

    const yearsResult = await db.query(yearsQuery, type ? [type] : []);
    const years = yearsResult.rows.map((r: any) => r.year);

    // Extended durations up to 2 hours
    const durations = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 2700, 3600, 5400, 7200];
    const durationLabels = ['5s', '10s', '30s', '1min', '2min', '5min', '10min', '20min', '30min', '45min', '1hr', '1:30h', '2hr'];

    // For each year, calculate best efforts
    const yearlyData: any[] = [];

    for (const year of years) {
      let activityQuery = `
        SELECT a.strava_activity_id
        FROM strava.activities a
        JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id
        WHERE s.stream_type = 'watts'
        AND EXTRACT(YEAR FROM a.start_date) = $1
      `;
      const params: any[] = [year];
      if (type) {
        activityQuery += ` AND a.type = $2`;
        params.push(type);
      }

      const activitiesResult = await db.query(activityQuery, params);

      const bestEfforts: { [key: number]: number } = {};
      durations.forEach(d => bestEfforts[d] = 0);

      for (const activity of activitiesResult.rows) {
        const streams = await db.getActivityStreams(activity.strava_activity_id);
        const wattsStream = streams.find(s => s.stream_type === 'watts');
        if (!wattsStream || !wattsStream.data) continue;

        const watts: number[] = wattsStream.data;

        for (const duration of durations) {
          if (watts.length < duration) continue;

          let maxAvg = 0;
          for (let i = 0; i <= watts.length - duration; i++) {
            const slice = watts.slice(i, i + duration);
            const avg = slice.reduce((a, b) => a + b, 0) / duration;
            if (avg > maxAvg) maxAvg = avg;
          }

          if (maxAvg > bestEfforts[duration]) {
            bestEfforts[duration] = Math.round(maxAvg);
          }
        }
      }

      const yearEntry: any = { year, activities: activitiesResult.rows.length };
      durations.forEach((d, idx) => {
        yearEntry[durationLabels[idx]] = bestEfforts[d] || null;
      });
      yearlyData.push(yearEntry);
    }

    res.json({
      type: type || 'all',
      durations: durationLabels,
      years: yearlyData,
    });
  } catch (error: any) {
    console.error('Error calculating yearly power curve:', error);
    res.status(500).json({ error: 'Failed to calculate yearly power curve' });
  }
});

/**
 * GET /api/stats
 * Get overall statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/stats/monthly
 * Get monthly statistics (aggregated directly from activities table)
 */
router.get('/stats/monthly', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        TO_CHAR(start_date, 'YYYY-MM') as month,
        type,
        COUNT(*) as activity_count,
        COALESCE(SUM(distance) / 1000, 0) as total_distance_km,
        COALESCE(SUM(moving_time) / 3600.0, 0) as total_hours,
        COALESCE(SUM(total_elevation_gain), 0) as total_elevation_m,
        COALESCE(AVG(average_speed) * 3.6, 0) as avg_speed_kmh,
        COALESCE(AVG(average_heartrate), 0) as avg_heartrate
      FROM activities
      GROUP BY TO_CHAR(start_date, 'YYYY-MM'), type
      ORDER BY month DESC, type
      LIMIT 200
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({ error: 'Failed to fetch monthly stats' });
  }
});

/**
 * GET /api/stats/by-type
 * Get statistics by activity type
 */
router.get('/stats/by-type', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT * FROM activity_summary_by_type
      ORDER BY activity_count DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching type stats:', error);
    res.status(500).json({ error: 'Failed to fetch type stats' });
  }
});

/**
 * GET /api/gear
 * Get all gear
 */
router.get('/gear', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        gu.*,
        g.description,
        CASE
          WHEN g.id LIKE 'mb_%' OR g.id LIKE 'mg_%' THEN 'manual'
          ELSE 'synced'
        END AS source
      FROM gear_usage gu
      JOIN gear g ON g.id = gu.id
      ORDER BY gu.total_distance_km DESC NULLS LAST
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching gear:', error);
    res.status(500).json({ error: 'Failed to fetch gear' });
  }
});

/**
 * POST /api/gear
 * Create one manual gear entry (for setups without Strava sync).
 */
router.post('/gear', async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const type = parseManualGearType(req.body?.type);
    if (!type) {
      return res.status(400).json({ error: 'Type must be bike or shoes' });
    }

    const brandName = String(req.body?.brand_name ?? req.body?.brandName ?? '').trim() || undefined;
    const modelName = String(req.body?.model_name ?? req.body?.modelName ?? '').trim() || undefined;
    const description = String(req.body?.description ?? '').trim() || undefined;
    const retired = parseBooleanLike(req.body?.retired) ?? false;

    const distanceKmRaw = Number(
      req.body?.distance_km
      ?? req.body?.distanceKm
      ?? req.body?.initial_distance_km
      ?? req.body?.initialDistanceKm
      ?? 0
    );
    if (!Number.isFinite(distanceKmRaw) || distanceKmRaw < 0) {
      return res.status(400).json({ error: 'Distance must be a non-negative number' });
    }

    const id = createManualGearId(type);
    await db.upsertGear({
      id,
      name,
      brand_name: brandName,
      model_name: modelName,
      description,
      type,
      distance: Math.round(distanceKmRaw * 1000),
      retired,
    });

    const created = await db.query(
      'SELECT * FROM gear WHERE id = $1 LIMIT 1',
      [id]
    );

    return res.status(201).json(created.rows[0]);
  } catch (error: any) {
    console.error('Error creating manual gear:', error);
    return res.status(500).json({ error: 'Failed to create gear' });
  }
});

/**
 * GET /api/gear/maintenance
 * Get all gear maintenance entries
 */
router.get('/gear/maintenance', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM strava.gear_maintenance
      ORDER BY gear_id, created_at ASC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching gear maintenance:', error);
    res.status(500).json({ error: 'Failed to fetch gear maintenance' });
  }
});

/**
 * GET /api/gear/:id/maintenance
 * Get maintenance entries for a specific gear
 */
router.get('/gear/:id/maintenance', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT *
       FROM strava.gear_maintenance
       WHERE gear_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ gear_id: id, items: result.rows });
  } catch (error: any) {
    console.error('Error fetching gear maintenance:', error);
    res.status(500).json({ error: 'Failed to fetch gear maintenance' });
  }
});

/**
 * PUT /api/gear/:id/maintenance
 * Upsert maintenance entries for a gear (replaceAll by default)
 */
router.put('/gear/:id/maintenance', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { items = [], replaceAll = true } = req.body || {};

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }

    const keepKeys = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const label = String(item.label || '').trim();
      if (!label) continue;

      const baseKey = normalizeComponentKey(item.component_key || label);
      const key = ensureUniqueKey(baseKey, keepKeys);

      const targetKm = Number(item.target_km || 0);
      const lastResetKm = Number(item.last_reset_km || 0);
      const lastResetAt = item.last_reset_at ? new Date(item.last_reset_at) : null;

      await db.query(
        `INSERT INTO strava.gear_maintenance (
           gear_id, component_key, label, target_km, last_reset_km, last_reset_at
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (gear_id, component_key)
         DO UPDATE SET
           label = EXCLUDED.label,
           target_km = EXCLUDED.target_km,
           last_reset_km = EXCLUDED.last_reset_km,
           last_reset_at = EXCLUDED.last_reset_at,
           updated_at = CURRENT_TIMESTAMP`,
        [id, key, label, targetKm, lastResetKm, lastResetAt]
      );
    }

    if (replaceAll) {
      const keysToKeep = Array.from(keepKeys);
      if (keysToKeep.length === 0) {
        await db.query(
          `DELETE FROM strava.gear_maintenance WHERE gear_id = $1`,
          [id]
        );
      } else {
        const placeholders = keysToKeep.map((_, idx) => `$${idx + 2}`).join(', ');
        await db.query(
          `DELETE FROM strava.gear_maintenance
           WHERE gear_id = $1 AND component_key NOT IN (${placeholders})`,
          [id, ...keysToKeep]
        );
      }
    }

    const result = await db.query(
      `SELECT *
       FROM strava.gear_maintenance
       WHERE gear_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ gear_id: id, items: result.rows });
  } catch (error: any) {
    console.error('Error updating gear maintenance:', error);
    res.status(500).json({ error: 'Failed to update gear maintenance' });
  }
});

/**
 * GET /api/gear/:id
 * Get single gear with usage stats
 */
router.get('/gear/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const gearResult = await db.query(
      'SELECT * FROM gear WHERE id = $1',
      [id]
    );

    if (gearResult.rows.length === 0) {
      return res.status(404).json({ error: 'Gear not found' });
    }

    const usageResult = await db.query(
      'SELECT * FROM gear_usage WHERE id = $1',
      [id]
    );

    const maintenanceResult = await db.query(
      `SELECT *
       FROM strava.gear_maintenance
       WHERE gear_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const source = (
      String(gearResult.rows[0]?.id || '').toLowerCase().startsWith('mb_')
      || String(gearResult.rows[0]?.id || '').toLowerCase().startsWith('mg_')
    )
      ? 'manual'
      : 'synced';

    res.json({
      gear: {
        ...gearResult.rows[0],
        ...(usageResult.rows[0] || {}),
        source,
      },
      maintenance: maintenanceResult.rows,
    });
  } catch (error: any) {
    console.error('Error fetching gear:', error);
    res.status(500).json({ error: 'Failed to fetch gear' });
  }
});

/**
 * GET /api/records
 * Get personal records (Top 10 by various metrics)
 */
router.get('/records', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    let typeFilter = '';
    const params: any[] = [];

    if (type) {
      // Support both single type and cycling category
      if (type === 'Ride') {
        // Include all cycling types
        typeFilter = "WHERE type IN ('Ride', 'VirtualRide', 'EBikeRide')";
      } else {
        typeFilter = 'WHERE type = $1';
        params.push(type);
      }
    }

    // Longest distance
    const longestDistance = await db.query(`
      SELECT
        strava_activity_id, name, type, start_date,
        distance / 1000 as distance_km,
        moving_time,
        total_elevation_gain
      FROM activities
      ${typeFilter}
      ORDER BY distance DESC NULLS LAST
      LIMIT 50
    `, params);

    // Longest duration
    const longestDuration = await db.query(`
      SELECT
        strava_activity_id, name, type, start_date,
        distance / 1000 as distance_km,
        moving_time,
        total_elevation_gain
      FROM activities
      ${typeFilter}
      ORDER BY moving_time DESC NULLS LAST
      LIMIT 50
    `, params);

    // Most elevation
    const mostElevation = await db.query(`
      SELECT
        strava_activity_id, name, type, start_date,
        distance / 1000 as distance_km,
        moving_time,
        total_elevation_gain
      FROM activities
      ${typeFilter}
      ORDER BY total_elevation_gain DESC NULLS LAST
      LIMIT 50
    `, params);

    // Fastest (avg speed) - only for activities with distance
    const fastestSpeed = await db.query(`
      SELECT
        strava_activity_id, name, type, start_date,
        distance / 1000 as distance_km,
        moving_time,
        average_speed * 3.6 as avg_speed_kmh,
        total_elevation_gain
      FROM activities
      ${typeFilter ? typeFilter + ' AND' : 'WHERE'} distance > 0 AND moving_time > 0
      ORDER BY average_speed DESC NULLS LAST
      LIMIT 50
    `, params);

    // Highest average heart rate
    const highestHeartrate = await db.query(`
      SELECT
        strava_activity_id, name, type, start_date,
        distance / 1000 as distance_km,
        moving_time,
        average_heartrate,
        max_heartrate
      FROM activities
      ${typeFilter ? typeFilter + ' AND' : 'WHERE'} average_heartrate IS NOT NULL
      ORDER BY average_heartrate DESC NULLS LAST
      LIMIT 50
    `, params);

    // Most calories burned (calculated from kilojoules: 1 kJ ≈ 0.239 kcal)
    // Strava API only returns calories in detailed activity endpoint, but kilojoules is in summary
    const mostCalories = await db.query(`
      SELECT
        strava_activity_id, name, type, start_date,
        distance / 1000 as distance_km,
        moving_time,
        ROUND(kilojoules * 0.239) as calories
      FROM activities
      ${typeFilter ? typeFilter + ' AND' : 'WHERE'} kilojoules IS NOT NULL AND kilojoules > 0
      ORDER BY kilojoules DESC NULLS LAST
      LIMIT 50
    `, params);

    // Most kudos
    const mostKudos = await db.query(`
      SELECT
        strava_activity_id, name, type, start_date,
        distance / 1000 as distance_km,
        moving_time,
        kudos_count
      FROM activities
      ${typeFilter ? typeFilter + ' AND' : 'WHERE'} kudos_count IS NOT NULL AND kudos_count > 0
      ORDER BY kudos_count DESC NULLS LAST
      LIMIT 50
    `, params);

    // Most comments
    const mostComments = await db.query(`
      SELECT
        strava_activity_id, name, type, start_date,
        distance / 1000 as distance_km,
        moving_time,
        comment_count
      FROM activities
      ${typeFilter ? typeFilter + ' AND' : 'WHERE'} comment_count IS NOT NULL AND comment_count > 0
      ORDER BY comment_count DESC NULLS LAST
      LIMIT 50
    `, params);

    res.json({
      longest_distance: longestDistance.rows,
      longest_duration: longestDuration.rows,
      most_elevation: mostElevation.rows,
      fastest_speed: fastestSpeed.rows,
      highest_heartrate: highestHeartrate.rows,
      most_calories: mostCalories.rows,
      most_kudos: mostKudos.rows,
      most_comments: mostComments.rows,
    });
  } catch (error: any) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

/**
 * GET /api/records/streaks
 * Get activity streaks (consecutive days with activities)
 */
router.get('/records/streaks', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    // Get all unique activity dates
    let query = `
      SELECT DISTINCT DATE(start_date) as activity_date
      FROM activities
    `;

    const params: any[] = [];
    if (type) {
      // Support both single type and cycling category
      if (type === 'Ride') {
        query += ` WHERE type IN ('Ride', 'VirtualRide', 'EBikeRide')`;
      } else {
        query += ` WHERE type = $1`;
        params.push(type);
      }
    }

    query += ` ORDER BY activity_date DESC`;

    const result = await db.query(query, params);

    const dates = result.rows.map((r: any) => new Date(r.activity_date));

    if (dates.length === 0) {
      return res.json({
        current_streak: 0,
        longest_streak: 0,
        longest_streak_start: null,
        longest_streak_end: null,
        total_active_days: 0,
      });
    }

    // Calculate current streak (from today backwards)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let currentStreak = 0;
    const checkDate = new Date(today);

    // Check if there was an activity today or yesterday
    const firstActivityDate = dates[0];
    firstActivityDate.setHours(0, 0, 0, 0);

    const diffFromToday = Math.floor((today.getTime() - firstActivityDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffFromToday <= 1) {
      // Start counting from the most recent activity
      currentStreak = 1;
      let prevDate = new Date(firstActivityDate);

      for (let i = 1; i < dates.length; i++) {
        const currDate = new Date(dates[i]);
        currDate.setHours(0, 0, 0, 0);

        const diff = Math.floor((prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24));

        if (diff === 1) {
          currentStreak++;
          prevDate = currDate;
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    let longestStreak = 1;
    let longestStart = dates[dates.length - 1];
    let longestEnd = dates[dates.length - 1];

    let tempStreak = 1;
    let tempStart = dates[dates.length - 1];

    for (let i = dates.length - 2; i >= 0; i--) {
      const currDate = new Date(dates[i]);
      const prevDate = new Date(dates[i + 1]);
      currDate.setHours(0, 0, 0, 0);
      prevDate.setHours(0, 0, 0, 0);

      const diff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diff === 1) {
        tempStreak++;
      } else {
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
          longestStart = tempStart;
          longestEnd = dates[i + 1];
        }
        tempStreak = 1;
        tempStart = currDate;
      }
    }

    // Check final streak
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
      longestStart = tempStart;
      longestEnd = dates[0];
    }

    res.json({
      current_streak: currentStreak,
      longest_streak: longestStreak,
      longest_streak_start: longestStart,
      longest_streak_end: longestEnd,
      total_active_days: dates.length,
    });
  } catch (error: any) {
    console.error('Error fetching streaks:', error);
    res.status(500).json({ error: 'Failed to fetch streaks' });
  }
});

/**
 * GET /api/records/yearly
 * Get year-over-year comparison
 */
router.get('/records/yearly', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    let query = `
      SELECT
        EXTRACT(YEAR FROM start_date)::int as year,
        COUNT(*) as activity_count,
        COALESCE(SUM(distance) / 1000, 0) as total_distance_km,
        COALESCE(SUM(moving_time) / 3600.0, 0) as total_hours,
        COALESCE(SUM(total_elevation_gain), 0) as total_elevation_m,
        COALESCE(AVG(distance) / 1000, 0) as avg_distance_km,
        COALESCE(AVG(moving_time) / 60.0, 0) as avg_duration_min
      FROM activities
    `;

    const params: any[] = [];
    if (type) {
      // Support both single type and cycling category
      if (type === 'Ride') {
        query += ` WHERE type IN ('Ride', 'VirtualRide', 'EBikeRide')`;
      } else {
        query += ` WHERE type = $1`;
        params.push(type);
      }
    }

    query += ` GROUP BY EXTRACT(YEAR FROM start_date) ORDER BY year DESC`;

    const result = await db.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching yearly stats:', error);
    res.status(500).json({ error: 'Failed to fetch yearly stats' });
  }
});

/**
 * GET /api/records/monthly-best
 * Get best performance for each month
 */
router.get('/records/monthly-best', async (req: Request, res: Response) => {
  try {
    const { metric = 'distance' } = req.query;

    let orderBy = 'distance';
    if (metric === 'duration') orderBy = 'moving_time';
    if (metric === 'elevation') orderBy = 'total_elevation_gain';

    const result = await db.query(`
      WITH ranked AS (
        SELECT
          strava_activity_id, name, type, start_date,
          distance / 1000 as distance_km,
          moving_time,
          total_elevation_gain,
          TO_CHAR(start_date, 'YYYY-MM') as month,
          ROW_NUMBER() OVER (
            PARTITION BY TO_CHAR(start_date, 'YYYY-MM')
            ORDER BY ${orderBy} DESC NULLS LAST
          ) as rn
        FROM activities
      )
      SELECT * FROM ranked WHERE rn = 1
      ORDER BY month DESC
      LIMIT 24
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching monthly best:', error);
    res.status(500).json({ error: 'Failed to fetch monthly best' });
  }
});

/**
 * GET /api/analytics/training-load
 * Get weekly training load (volume) for the last 12 weeks
 */
router.get('/analytics/training-load', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    let typeFilter = '';
    const params: any[] = [];

    if (type) {
      typeFilter = 'AND type = $1';
      params.push(type);
    }

    // Get weekly training load for last 12 weeks
    const result = await db.query(`
      SELECT
        DATE_TRUNC('week', start_date)::date as week_start,
        COUNT(*) as activity_count,
        COALESCE(SUM(distance) / 1000, 0) as total_distance_km,
        COALESCE(SUM(moving_time) / 3600.0, 0) as total_hours,
        COALESCE(SUM(total_elevation_gain), 0) as total_elevation_m,
        COALESCE(AVG(average_heartrate), 0) as avg_heartrate,
        COALESCE(SUM(calories), 0) as total_calories,
        COALESCE(SUM(kilojoules), 0) as total_kilojoules
      FROM activities
      WHERE start_date >= NOW() - INTERVAL '12 weeks'
      ${typeFilter}
      GROUP BY DATE_TRUNC('week', start_date)
      ORDER BY week_start DESC
    `, params);

    // Calculate training load score (simplified TSS-like metric)
    // Based on duration * intensity (estimated from HR or just duration if no HR)
    const weeksWithLoad = result.rows.map((week: any) => {
      const hours = parseFloat(week.total_hours) || 0;
      const avgHr = parseFloat(week.avg_heartrate) || 0;
      // Simple load: hours * intensity factor (HR-based if available)
      const intensityFactor = avgHr > 0 ? avgHr / 140 : 1; // 140 bpm as baseline
      const trainingLoad = Math.round(hours * 100 * intensityFactor);

      return {
        ...week,
        training_load: trainingLoad
      };
    });

    res.json(weeksWithLoad);
  } catch (error: any) {
    console.error('Error fetching training load:', error);
    res.status(500).json({ error: 'Failed to fetch training load' });
  }
});

/**
 * GET /api/analytics/fitness-trend
 * Get fitness trend (performance metrics over time)
 */
router.get('/analytics/fitness-trend', async (req: Request, res: Response) => {
  try {
    const { type, months = '6' } = req.query;

    let typeFilter = '';
    const params: any[] = [parseInt(months as string)];

    if (type) {
      typeFilter = 'AND type = $2';
      params.push(type);
    }

    // Get monthly averages for pace/speed, HR, and power
    const result = await db.query(`
      SELECT
        TO_CHAR(start_date, 'YYYY-MM') as month,
        COUNT(*) as activity_count,
        COALESCE(AVG(distance) / 1000, 0) as avg_distance_km,
        COALESCE(AVG(moving_time) / 60.0, 0) as avg_duration_min,
        COALESCE(AVG(average_speed) * 3.6, 0) as avg_speed_kmh,
        COALESCE(AVG(CASE WHEN distance > 0 THEN moving_time / (distance / 1000) END), 0) as avg_pace_min_per_km,
        COALESCE(AVG(average_heartrate), 0) as avg_heartrate,
        COALESCE(AVG(average_watts), 0) as avg_power,
        COALESCE(AVG(total_elevation_gain), 0) as avg_elevation_m
      FROM activities
      WHERE start_date >= NOW() - ($1 || ' months')::INTERVAL
      ${typeFilter}
      GROUP BY TO_CHAR(start_date, 'YYYY-MM')
      ORDER BY month ASC
    `, params);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching fitness trend:', error);
    res.status(500).json({ error: 'Failed to fetch fitness trend' });
  }
});

/**
 * GET /api/analytics/heart-rate-zones
 * Get time spent in different heart rate zones
 */
router.get('/analytics/heart-rate-zones', async (req: Request, res: Response) => {
  try {
    const { type, months = '3' } = req.query;

    let typeFilter = '';
    const params: any[] = [parseInt(months as string)];

    if (type) {
      typeFilter = 'AND a.type = $2';
      params.push(type);
    }

    // Get activities with heartrate data and their streams
    // Note: stream_type column is empty, so we identify HR streams by their data pattern
    // HR data is an array of numbers typically between 40-220
    const activitiesResult = await db.query(`
      SELECT
        a.strava_activity_id,
        a.moving_time,
        a.average_heartrate,
        (
          SELECT s.data
          FROM activity_streams s
          WHERE s.activity_id = a.strava_activity_id
            AND jsonb_typeof(s.data) = 'array'
            AND jsonb_array_length(s.data) > 0
            AND jsonb_typeof(s.data->0) = 'number'
            AND (s.data->>0)::numeric BETWEEN 40 AND 220
          LIMIT 1
        ) as heartrate_data
      FROM activities a
      WHERE a.start_date >= NOW() - ($1 || ' months')::INTERVAL
        AND a.average_heartrate IS NOT NULL
        ${typeFilter}
    `, params);

    // Define HR zones (using standard zones based on max HR estimate)
    // Zone 1: 50-60% (Recovery), Zone 2: 60-70% (Endurance), Zone 3: 70-80% (Tempo)
    // Zone 4: 80-90% (Threshold), Zone 5: 90-100% (VO2max)
    // Using absolute values for simplicity (can be made configurable)
    const zones = {
      zone1: { name: 'Recovery', min: 0, max: 120, minutes: 0, color: '#94a3b8' },
      zone2: { name: 'Endurance', min: 120, max: 140, minutes: 0, color: '#22c55e' },
      zone3: { name: 'Tempo', min: 140, max: 160, minutes: 0, color: '#eab308' },
      zone4: { name: 'Threshold', min: 160, max: 175, minutes: 0, color: '#f97316' },
      zone5: { name: 'VO2max', min: 175, max: 300, minutes: 0, color: '#ef4444' },
    };

    let totalDataPoints = 0;
    let activitiesWithStreams = 0;

    // Process each activity's HR stream
    activitiesResult.rows.forEach((activity: any) => {
      const hrData = activity.heartrate_data;
      if (!hrData || !Array.isArray(hrData)) return;

      activitiesWithStreams++;
      const movingTimeSeconds = activity.moving_time || 0;
      const dataPoints = hrData.length;
      if (dataPoints === 0) return;

      // Each data point represents movingTime/dataPoints seconds
      const secondsPerPoint = movingTimeSeconds / dataPoints;

      hrData.forEach((hr: number) => {
        if (typeof hr !== 'number' || hr < 30 || hr > 250) return; // Skip invalid HR values
        totalDataPoints++;
        if (hr < zones.zone1.max) zones.zone1.minutes += secondsPerPoint / 60;
        else if (hr < zones.zone2.max) zones.zone2.minutes += secondsPerPoint / 60;
        else if (hr < zones.zone3.max) zones.zone3.minutes += secondsPerPoint / 60;
        else if (hr < zones.zone4.max) zones.zone4.minutes += secondsPerPoint / 60;
        else zones.zone5.minutes += secondsPerPoint / 60;
      });
    });

    // Round minutes
    Object.values(zones).forEach(zone => {
      zone.minutes = Math.round(zone.minutes);
    });

    const totalMinutes = Object.values(zones).reduce((sum, z) => sum + z.minutes, 0);

    res.json({
      zones: Object.entries(zones).map(([key, zone]) => ({
        id: key,
        ...zone,
        percentage: totalMinutes > 0 ? Math.round((zone.minutes / totalMinutes) * 100) : 0
      })),
      total_minutes: totalMinutes,
      activities_analyzed: activitiesWithStreams
    });
  } catch (error: any) {
    console.error('Error fetching HR zones:', error);
    res.status(500).json({ error: 'Failed to fetch heart rate zones' });
  }
});

/**
 * GET /api/analytics/efficiency
 * Get efficiency metrics (calories per km, VAM for climbs, etc.)
 */
router.get('/analytics/efficiency', async (req: Request, res: Response) => {
  try {
    const { type, months = '6' } = req.query;

    // Get athlete weight and FTP from settings
    const settingsResult = await db.query(`
      SELECT key, value FROM strava.user_settings
      WHERE user_id = (SELECT id FROM strava.user_profile WHERE is_active = true LIMIT 1)
      AND key IN ('athlete_weight', 'ftp')
    `);

    const settings = Object.fromEntries(settingsResult.rows.map((r: any) => [r.key, r.value]));
    const athleteWeight = parseFloat(settings.athlete_weight || '75');
    const ftp = parseFloat(settings.ftp || '0');
    const ftpWKg = ftp > 0 ? ftp / athleteWeight : 0;

    let typeFilter = '';
    const params: any[] = [parseInt(months as string)];

    if (type) {
      typeFilter = 'AND type = $2';
      params.push(type);
    }

    const result = await db.query(`
      SELECT
        TO_CHAR(start_date, 'YYYY-MM') as month,
        COUNT(*) as activity_count,
        -- Calories per km
        COALESCE(AVG(CASE WHEN distance > 0 THEN calories / (distance / 1000) END), 0) as calories_per_km,
        -- VAM: Disabled - requires proper calculation via altitude/time streams
        -- Use /api/top-vam-activities endpoint for accurate VAM data
        0 as avg_vam,
        -- Use FTP / weight for W/kg (more accurate than average power)
        ${ftpWKg} as avg_watts_per_kg,
        -- Heart rate efficiency (distance per heartbeat)
        COALESCE(AVG(CASE WHEN average_heartrate > 0 AND distance > 0
          THEN (distance / 1000) / (average_heartrate * (moving_time / 60))
          END) * 1000, 0) as hr_efficiency
      FROM strava.activities
      WHERE start_date >= NOW() - ($1 || ' months')::INTERVAL
        AND distance > 0
        ${typeFilter}
      GROUP BY TO_CHAR(start_date, 'YYYY-MM')
      ORDER BY month ASC
    `, params);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching efficiency:', error);
    res.status(500).json({ error: 'Failed to fetch efficiency metrics' });
  }
});

/**
 * GET /api/analytics/weekday-distribution
 * Distribution of activities across weekdays
 */
router.get('/analytics/weekday-distribution', async (req: Request, res: Response) => {
  try {
    const { type, months } = req.query;
    const monthsBack = parseInt(months as string) || 12;

    let typeFilter = '';
    const params: any[] = [monthsBack];

    if (type) {
      if (type === 'Ride') {
        typeFilter = "AND type IN ('Ride', 'VirtualRide', 'GravelRide', 'EBikeRide', 'MountainBikeRide')";
      } else if (type === 'Run') {
        typeFilter = "AND type IN ('Run', 'VirtualRun', 'TrailRun')";
      } else {
        typeFilter = 'AND type = $2';
        params.push(type);
      }
    }

    const result = await db.query(`
      SELECT
        EXTRACT(DOW FROM start_date)::int as day_of_week,
        CASE EXTRACT(DOW FROM start_date)::int
          WHEN 0 THEN 'Sun'
          WHEN 1 THEN 'Mon'
          WHEN 2 THEN 'Tue'
          WHEN 3 THEN 'Wed'
          WHEN 4 THEN 'Thu'
          WHEN 5 THEN 'Fri'
          WHEN 6 THEN 'Sat'
        END as day_name,
        COUNT(*) as activity_count,
        ROUND(SUM(distance) / 1000, 1) as total_distance_km,
        ROUND(SUM(moving_time) / 3600.0, 1) as total_hours,
        ROUND(AVG(distance) / 1000, 1) as avg_distance_km,
        ROUND(AVG(moving_time) / 60.0, 0) as avg_duration_min
      FROM strava.activities
      WHERE start_date >= NOW() - INTERVAL '1 month' * $1
        ${typeFilter}
      GROUP BY EXTRACT(DOW FROM start_date),
        CASE EXTRACT(DOW FROM start_date)::int
          WHEN 0 THEN 'Sun'
          WHEN 1 THEN 'Mon'
          WHEN 2 THEN 'Tue'
          WHEN 3 THEN 'Wed'
          WHEN 4 THEN 'Thu'
          WHEN 5 THEN 'Fri'
          WHEN 6 THEN 'Sat'
        END
      ORDER BY day_of_week
    `, params);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching weekday distribution:', error);
    res.status(500).json({ error: 'Failed to fetch weekday distribution' });
  }
});

/**
 * GET /api/analytics/monthly-comparison
 * Monthly stats comparison with year-over-year
 */
router.get('/analytics/monthly-comparison', async (req: Request, res: Response) => {
  try {
    const { type, months } = req.query;
    const monthsBack = parseInt(months as string) || 24;

    let typeFilter = '';
    const params: any[] = [monthsBack];

    if (type) {
      if (type === 'Ride') {
        typeFilter = "AND type IN ('Ride', 'VirtualRide', 'GravelRide', 'EBikeRide', 'MountainBikeRide')";
      } else if (type === 'Run') {
        typeFilter = "AND type IN ('Run', 'VirtualRun', 'TrailRun')";
      } else {
        typeFilter = 'AND type = $2';
        params.push(type);
      }
    }

    const result = await db.query(`
      SELECT
        TO_CHAR(start_date, 'YYYY-MM') as month,
        EXTRACT(YEAR FROM start_date)::int as year,
        EXTRACT(MONTH FROM start_date)::int as month_num,
        TO_CHAR(start_date, 'Mon') as month_name,
        COUNT(*) as activity_count,
        ROUND(SUM(distance) / 1000, 1) as total_distance_km,
        ROUND(SUM(moving_time) / 3600.0, 1) as total_hours,
        ROUND(SUM(total_elevation_gain), 0) as total_elevation,
        ROUND(AVG(CASE WHEN average_speed > 0 THEN average_speed * 3.6 END), 1) as avg_speed_kmh
      FROM strava.activities
      WHERE start_date >= NOW() - INTERVAL '1 month' * $1
        ${typeFilter}
      GROUP BY TO_CHAR(start_date, 'YYYY-MM'),
        EXTRACT(YEAR FROM start_date),
        EXTRACT(MONTH FROM start_date),
        TO_CHAR(start_date, 'Mon')
      ORDER BY month ASC
    `, params);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching monthly comparison:', error);
    res.status(500).json({ error: 'Failed to fetch monthly comparison' });
  }
});

/**
 * GET /api/analytics/time-of-day
 * Distribution of activities by time of day
 */
router.get('/analytics/time-of-day', async (req: Request, res: Response) => {
  try {
    const { type, months } = req.query;
    const monthsBack = parseInt(months as string) || 12;

    let typeFilter = '';
    const params: any[] = [monthsBack];

    if (type) {
      if (type === 'Ride') {
        typeFilter = "AND type IN ('Ride', 'VirtualRide', 'GravelRide', 'EBikeRide', 'MountainBikeRide')";
      } else if (type === 'Run') {
        typeFilter = "AND type IN ('Run', 'VirtualRun', 'TrailRun')";
      } else {
        typeFilter = 'AND type = $2';
        params.push(type);
      }
    }

    const result = await db.query(`
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM start_date) >= 5 AND EXTRACT(HOUR FROM start_date) < 9 THEN 'Early Morning'
          WHEN EXTRACT(HOUR FROM start_date) >= 9 AND EXTRACT(HOUR FROM start_date) < 12 THEN 'Morning'
          WHEN EXTRACT(HOUR FROM start_date) >= 12 AND EXTRACT(HOUR FROM start_date) < 14 THEN 'Midday'
          WHEN EXTRACT(HOUR FROM start_date) >= 14 AND EXTRACT(HOUR FROM start_date) < 17 THEN 'Afternoon'
          WHEN EXTRACT(HOUR FROM start_date) >= 17 AND EXTRACT(HOUR FROM start_date) < 20 THEN 'Evening'
          ELSE 'Night'
        END as time_slot,
        CASE
          WHEN EXTRACT(HOUR FROM start_date) >= 5 AND EXTRACT(HOUR FROM start_date) < 9 THEN 1
          WHEN EXTRACT(HOUR FROM start_date) >= 9 AND EXTRACT(HOUR FROM start_date) < 12 THEN 2
          WHEN EXTRACT(HOUR FROM start_date) >= 12 AND EXTRACT(HOUR FROM start_date) < 14 THEN 3
          WHEN EXTRACT(HOUR FROM start_date) >= 14 AND EXTRACT(HOUR FROM start_date) < 17 THEN 4
          WHEN EXTRACT(HOUR FROM start_date) >= 17 AND EXTRACT(HOUR FROM start_date) < 20 THEN 5
          ELSE 6
        END as slot_order,
        COUNT(*) as activity_count,
        ROUND(SUM(distance) / 1000, 1) as total_distance_km,
        ROUND(AVG(distance) / 1000, 1) as avg_distance_km
      FROM strava.activities
      WHERE start_date >= NOW() - INTERVAL '1 month' * $1
        ${typeFilter}
      GROUP BY time_slot, slot_order
      ORDER BY slot_order
    `, params);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching time of day:', error);
    res.status(500).json({ error: 'Failed to fetch time of day distribution' });
  }
});

/**
 * GET /api/analytics/power-curve
 * Calculate power curve and rider type classification
 * Analyzes best power outputs for different time durations
 */
router.get('/analytics/power-curve', async (req: Request, res: Response) => {
  try {
    const { months = '12' } = req.query;
    const monthsAgo = parseInt(months as string);

    // Get user weight for W/kg calculations
    const userQuery = await db.query(`
      SELECT value FROM strava.user_settings
      WHERE user_id = (SELECT id FROM strava.user_profile WHERE is_active = true LIMIT 1)
      AND key = 'athlete_weight'
    `);
    const userWeight = userQuery.rows[0]?.value ? parseFloat(userQuery.rows[0].value) : 75; // Default 75kg

    // Get all activities with power data
    const query = `
      SELECT
        a.strava_activity_id,
        a.type,
        a.start_date,
        a.moving_time,
        a.average_watts,
        a.max_watts,
        s.data as watts_stream
      FROM strava.activities a
      LEFT JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id AND s.stream_type = 'watts'
      WHERE a.average_watts IS NOT NULL
        AND a.average_watts > 0
        AND a.start_date >= NOW() - INTERVAL '${monthsAgo} months'
        AND a.type IN ('Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide')
      ORDER BY a.start_date DESC
    `;

    const result = await db.query(query);

    // Time intervals to analyze (in seconds)
    const intervals = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
    const powerCurve: { [key: number]: number } = {};

    // Calculate max power for each interval
    intervals.forEach(duration => {
      let maxPower = 0;

      result.rows.forEach((activity: any) => {
        if (!activity.watts_stream || !Array.isArray(activity.watts_stream)) return;

        const watts = activity.watts_stream;

        // Calculate rolling average for this duration
        for (let i = 0; i <= watts.length - duration; i++) {
          const segment = watts.slice(i, i + duration);
          const avgPower = segment.reduce((sum: number, w: number) => sum + (w || 0), 0) / duration;
          maxPower = Math.max(maxPower, avgPower);
        }
      });

      powerCurve[duration] = Math.round(maxPower);
    });

    // Rider type classification based on power curve
    const fiveSecPower = powerCurve[5] || 0;
    const oneMinPower = powerCurve[60] || 0;
    const fiveMinPower = powerCurve[300] || 0;
    const twentyMinPower = powerCurve[1200] || 0;
    const sixtyMinPower = powerCurve[3600] || 0;

    // Calculate ratios for classification
    const sprintRatio = fiveSecPower / (twentyMinPower || 1);
    const punchRatio = oneMinPower / (twentyMinPower || 1);
    const enduranceRatio = sixtyMinPower / (twentyMinPower || 1);

    let riderType = 'Allrounder';
    let strengths = {
      sprint: 0,
      punch: 0,
      climbing: 0,
      endurance: 0,
      time_trial: 0
    };

    // Calculate W/kg for climbing assessment
    const fiveMinWKg = fiveMinPower / userWeight;
    const twentyMinWKg = twentyMinPower / userWeight;

    // Calculate strength scores (0-100)
    // Adjusted scales for amateur/recreational cyclists

    // Sprint: Based on ratio to FTP (high burst power)
    // 1.5x = 0%, 2.5x = 50%, 3.5x+ = 100%
    strengths.sprint = Math.min(100, Math.max(0, (sprintRatio - 1.5) * 50));

    // Punch: Based on 1-min power ratio (sustained efforts)
    // 1.2x = 0%, 1.8x = 50%, 2.4x+ = 100%
    strengths.punch = Math.min(100, Math.max(0, (punchRatio - 1.2) * 83.33));

    // Climbing: Based on W/kg for 5-min power
    // 2.0 W/kg = 0%, 3.0 W/kg = 50%, 4.0+ W/kg = 100%
    strengths.climbing = Math.min(100, Math.max(0, (fiveMinWKg - 2.0) * 50));

    // Time Trial: Based on W/kg for 20-min power
    // 1.5 W/kg = 0%, 2.75 W/kg = 50%, 4.0+ W/kg = 100%
    strengths.time_trial = Math.min(100, Math.max(0, (twentyMinWKg - 1.5) * 40));

    // Endurance: Based on 60-min to 20-min ratio (ability to sustain)
    // 0.80 = 0%, 0.90 = 50%, 1.0+ = 100%
    strengths.endurance = Math.min(100, Math.max(0, (enduranceRatio - 0.8) * 500));

    // Classify rider type based on strengths
    const maxStrength = Math.max(...Object.values(strengths));

    if (strengths.sprint === maxStrength && strengths.sprint > 70) {
      riderType = 'Sprinter';
    } else if (strengths.punch === maxStrength && strengths.punch > 65) {
      riderType = 'Puncheur';
    } else if (strengths.climbing === maxStrength && strengths.climbing > 70) {
      riderType = 'Kletterer';
    } else if (strengths.time_trial === maxStrength && strengths.time_trial > 65) {
      riderType = 'Zeitfahrer';
    } else if (strengths.endurance === maxStrength && strengths.endurance > 70) {
      riderType = 'Ausdauerspezialist';
    }

    // Format power curve for chart
    const curveData = intervals.map(duration => ({
      duration_seconds: duration,
      duration_label: duration < 60 ? `${duration}s` : duration < 3600 ? `${Math.floor(duration / 60)}min` : `${Math.floor(duration / 3600)}h`,
      power_watts: powerCurve[duration] || 0
    }));

    res.json({
      rider_type: riderType,
      strengths,
      power_curve: curveData,
      key_powers: {
        '5_sec': fiveSecPower,
        '1_min': oneMinPower,
        '5_min': fiveMinPower,
        '20_min': twentyMinPower,
        '60_min': sixtyMinPower
      },
      activities_analyzed: result.rows.length,
      period_months: monthsAgo
    });

  } catch (error: any) {
    console.error('Error calculating power curve:', error);
    res.status(500).json({ error: 'Failed to calculate power curve' });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const dbConnected = await db.testConnection();

    res.json({
      status: 'ok',
      database: dbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message,
    });
  }
});

/**
 * GET /api/photos/:activityId/:filename
 * Serve locally stored activity photos
 */
router.get('/photos/:activityId/:filename', (req: Request, res: Response) => {
  try {
    const { activityId, filename } = req.params;

    // Sanitize path to prevent directory traversal
    const safePath = path.join(
      PHOTO_STORAGE_PATH,
      path.basename(activityId),
      path.basename(filename)
    );

    // Check if file exists
    if (!fs.existsSync(safePath)) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    // Determine content type based on extension
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Set cache headers (1 year for immutable content)
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Stream the file
    const stream = fs.createReadStream(safePath);
    stream.pipe(res);

  } catch (error: any) {
    console.error('Error serving photo:', error.message);
    res.status(500).json({ error: 'Failed to serve photo' });
  }
});

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * GET /api/cache/heatmap
 * Get heatmap cache status
 */
router.get('/cache/heatmap', async (req: Request, res: Response) => {
  const cacheEntries = Array.from(heatmapCache.entries()).map(([key, value]) => ({
    key,
    activity_count: value.activityCount,
    age_hours: Math.round((Date.now() - value.timestamp) / 3600000 * 10) / 10,
    created: new Date(value.timestamp).toISOString(),
    expires: new Date(value.timestamp + HEATMAP_CACHE_TTL).toISOString(),
  }));

  res.json({
    cache_ttl_hours: HEATMAP_CACHE_TTL / 3600000,
    entries: cacheEntries,
    total_entries: cacheEntries.length,
  });
});

/**
 * DELETE /api/cache/heatmap
 * Clear heatmap cache
 */
router.delete('/cache/heatmap', async (req: Request, res: Response) => {
  const count = heatmapCache.size;
  heatmapCache.clear();
  console.log(`Heatmap cache cleared (${count} entries)`);
  res.json({ cleared: count, message: 'Heatmap cache cleared' });
});

/**
 * GET /api/tech
 * Technical system information and statistics
 * Returns cached data if available for instant loading
 * Query params: refresh=true to force fresh data
 */
router.get('/tech', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();
    const syncConfig = await loadSyncSettings(db);
    const migrationsStatus = await checkPendingMigrations();

    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && techStatsCache && (now - techStatsCache.timestamp) < TECH_CACHE_TTL) {
      return res.json({
        ...techStatsCache.data,
        sync_config: syncConfig,
        migrations: {
          pending_count: migrationsStatus.pending.length,
          pending_files: migrationsStatus.pending.map((migration) => migration.filename),
        },
        cached: true,
        cache_age_seconds: Math.floor((now - techStatsCache.timestamp) / 1000)
      });
    }

    // Database version and info
    const dbVersionResult = await db.query('SELECT version()');
    const dbVersion = dbVersionResult.rows[0]?.version || 'Unknown';

    // Database size
    const dbSizeResult = await db.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    const dbSize = dbSizeResult.rows[0]?.size || 'Unknown';

    // Table sizes
    const tableSizesResult = await db.query(`
      SELECT
        s.relname as table_name,
        pg_size_pretty(pg_total_relation_size(s.relid)) as total_size,
        pg_size_pretty(pg_relation_size(s.relid)) as data_size,
        COALESCE(t.n_live_tup, 0) as row_count
      FROM pg_catalog.pg_statio_user_tables s
      LEFT JOIN pg_catalog.pg_stat_user_tables t ON s.relid = t.relid
      WHERE s.schemaname = 'strava'
      ORDER BY pg_total_relation_size(s.relid) DESC
    `);

    // Activity counts and sync status
    const activityStatsResult = await db.query(`
      SELECT
        COUNT(*) as total_activities,
        COUNT(CASE WHEN photo_count > 0 THEN 1 END) as activities_with_photos,
        MIN(start_date) as first_activity,
        MAX(start_date) as last_activity,
        MAX(created_at) as last_sync
      FROM strava.activities
    `);
    const activityStats = activityStatsResult.rows[0];

    // GPS/Streams stats
    const streamsStatsResult = await db.query(`
      SELECT
        COUNT(DISTINCT activity_id) as activities_with_streams,
        COUNT(*) as total_stream_records,
        SUM(jsonb_array_length(data)) as total_data_points
      FROM strava.activity_streams
      WHERE jsonb_typeof(data->0) = 'array'
    `);
    const streamsStats = streamsStatsResult.rows[0];

    // Activities WITHOUT GPS
    const noGpsResult = await db.query(`
      SELECT COUNT(*) as count
      FROM strava.activities a
      WHERE NOT EXISTS (
        SELECT 1 FROM strava.activity_streams s
        WHERE s.activity_id = a.strava_activity_id
        AND jsonb_typeof(s.data->0) = 'array'
      )
    `);
    const activitiesWithoutGps = noGpsResult.rows[0]?.count || 0;

    // Photo stats - photos in DB
    const photoStatsResult = await db.query(`
      SELECT
        COUNT(*) as total_photos,
        COUNT(CASE WHEN local_path IS NOT NULL THEN 1 END) as downloaded_photos,
        COUNT(CASE WHEN local_path IS NULL THEN 1 END) as pending_photos,
        COUNT(DISTINCT activity_id) as activities_with_photos_synced
      FROM strava.activity_photos
    `);
    const photoStats = photoStatsResult.rows[0];

    // Segment stats
    const segmentsCountResult = await db.query(`
      SELECT COUNT(*) as total_segments
      FROM strava.segments
    `);
    const segmentEffortsStatsResult = await db.query(`
      SELECT
        COUNT(*) as total_efforts,
        COUNT(DISTINCT activity_id) as activities_with_segments
      FROM strava.segment_efforts
    `);
    const segmentStats = {
      total_segments: parseInt(segmentsCountResult.rows[0]?.total_segments) || 0,
      total_efforts: parseInt(segmentEffortsStatsResult.rows[0]?.total_efforts) || 0,
      activities_with_segments: parseInt(segmentEffortsStatsResult.rows[0]?.activities_with_segments) || 0,
    };

    // Activities that HAVE photos (photo_count > 0) but NO photos fetched yet
    const activitiesNeedingPhotoSyncResult = await db.query(`
      SELECT COUNT(*) as count
      FROM strava.activities a
      WHERE a.photo_count > 0
      AND NOT EXISTS (
        SELECT 1 FROM strava.activity_photos p
        WHERE p.activity_id = a.strava_activity_id
      )
    `);
    const activitiesNeedingPhotoSync = parseInt(activitiesNeedingPhotoSyncResult.rows[0]?.count) || 0;

    // Activities that need GPS/stream data (check types that typically have GPS)
    const activitiesNeedingStreamsResult = await db.query(`
      SELECT COUNT(*) as count
      FROM strava.activities a
      WHERE a.type IN ('Ride', 'Run', 'Walk', 'Hike', 'Swim', 'Kayaking', 'Canoeing', 'StandUpPaddling', 'NordicSki', 'AlpineSki', 'Snowboard', 'IceSkate', 'InlineSkate', 'RollerSki', 'Skateboard', 'Surfing', 'Windsurf', 'Kitesurf', 'Golf', 'Handcycle', 'Wheelchair', 'MountainBikeRide', 'GravelRide', 'EMountainBikeRide', 'VirtualRide', 'VirtualRun', 'VirtualRow', 'VirtualSwim')
      AND NOT EXISTS (
        SELECT 1 FROM strava.activity_streams s
        WHERE s.activity_id = a.strava_activity_id
      )
    `);
    const activitiesNeedingStreams = parseInt(activitiesNeedingStreamsResult.rows[0]?.count) || 0;

    // Activities that need segments (default types)
    const activitiesNeedingSegmentsResult = await db.query(`
      SELECT COUNT(*) as count
      FROM strava.activities a
      WHERE a.type IN ('Ride', 'VirtualRide', 'Run', 'TrailRun')
      AND NOT EXISTS (
        SELECT 1 FROM strava.segment_efforts se
        WHERE se.activity_id = a.strava_activity_id
      )
    `);
    const activitiesNeedingSegments = parseInt(activitiesNeedingSegmentsResult.rows[0]?.count) || 0;

    // Activities with average_watts but no watts stream
    // These have estimated/summary power data but Strava doesn't provide detailed second-by-second watts
    const activitiesWithEstimatedPowerResult = await db.query(`
      SELECT COUNT(*) as count
      FROM strava.activities a
      WHERE a.average_watts IS NOT NULL AND a.average_watts > 0
      AND NOT EXISTS (
        SELECT 1 FROM strava.activity_streams s
        WHERE s.activity_id = a.strava_activity_id AND s.stream_type = 'watts'
      )
    `);
    const activitiesWithEstimatedPower = parseInt(activitiesWithEstimatedPowerResult.rows[0]?.count) || 0;

    // Count local photo files
    let photoFileCount = 0;
    try {
      if (fs.existsSync(PHOTO_STORAGE_PATH)) {
        const countFiles = (dir: string): number => {
          let count = 0;
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              count += countFiles(fullPath);
            } else if (stat.isFile()) {
              count++;
            }
          }
          return count;
        };
        photoFileCount = countFiles(PHOTO_STORAGE_PATH);
      }
    } catch {
      // Ignore errors
    }

    // Activity types distribution
    const activityTypesResult = await db.query(`
      SELECT type, COUNT(*) as count
      FROM strava.activities
      GROUP BY type
      ORDER BY count DESC
    `);

    // Yearly breakdown with stream coverage
    // Use CTEs to avoid multiplication from JOINs
    const yearlyStatsResult = await db.query(`
      WITH yearly_activities AS (
        SELECT
          EXTRACT(YEAR FROM start_date)::int as year,
          COUNT(*) as activities,
          ROUND(SUM(distance) / 1000) as total_km
        FROM strava.activities
        GROUP BY EXTRACT(YEAR FROM start_date)
      ),
      yearly_streams AS (
        SELECT
          EXTRACT(YEAR FROM a.start_date)::int as year,
          COUNT(DISTINCT s.activity_id) as with_streams
        FROM strava.activity_streams s
        JOIN strava.activities a ON a.strava_activity_id = s.activity_id
        GROUP BY EXTRACT(YEAR FROM a.start_date)
      ),
      yearly_power AS (
        SELECT
          EXTRACT(YEAR FROM a.start_date)::int as year,
          COUNT(DISTINCT s.activity_id) as with_power_streams
        FROM strava.activity_streams s
        JOIN strava.activities a ON a.strava_activity_id = s.activity_id
        WHERE s.stream_type = 'watts'
        GROUP BY EXTRACT(YEAR FROM a.start_date)
      )
      SELECT
        ya.year,
        ya.activities,
        ya.total_km,
        COALESCE(ys.with_streams, 0) as with_streams,
        COALESCE(yp.with_power_streams, 0) as with_power_streams
      FROM yearly_activities ya
      LEFT JOIN yearly_streams ys ON ys.year = ya.year
      LEFT JOIN yearly_power yp ON yp.year = ya.year
      ORDER BY ya.year DESC
    `);

    // Uptime and process info
    const uptimeSeconds = process.uptime();
    const memoryUsage = process.memoryUsage();

    const responseData = {
      system: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime_seconds: Math.floor(uptimeSeconds),
        uptime_formatted: formatUptime(uptimeSeconds),
        memory: {
          heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
        },
        pid: process.pid,
      },
      database: {
        version: dbVersion,
        size: dbSize,
        tables: tableSizesResult.rows,
      },
      activities: {
        total: parseInt(activityStats.total_activities) || 0,
        with_photos: parseInt(activityStats.activities_with_photos) || 0,
        with_gps: parseInt(streamsStats.activities_with_streams) || 0,
        without_gps: parseInt(activitiesWithoutGps) || 0,
        first_activity: activityStats.first_activity,
        last_activity: activityStats.last_activity,
        last_sync: activityStats.last_sync,
      },
      streams: {
        total_records: parseInt(streamsStats.total_stream_records) || 0,
        total_data_points: parseInt(streamsStats.total_data_points) || 0,
      },
      photos: {
        total: parseInt(photoStats.total_photos) || 0,
        downloaded: parseInt(photoStats.downloaded_photos) || 0,
        pending: parseInt(photoStats.pending_photos) || 0,
        activities_with_photos_synced: parseInt(photoStats.activities_with_photos_synced) || 0,
        local_files: photoFileCount,
      },
      segments: segmentStats,
      data_gaps: {
        activities_needing_photo_sync: activitiesNeedingPhotoSync,
        activities_needing_streams: activitiesNeedingStreams,
        activities_with_estimated_power: activitiesWithEstimatedPower,
        photos_needing_download: parseInt(photoStats.pending_photos) || 0,
        activities_needing_segments: activitiesNeedingSegments,
      },
      activity_types: activityTypesResult.rows,
      yearly_stats: yearlyStatsResult.rows,
      tech_stack: {
        backend: 'Node.js + Express + TypeScript',
        frontend: 'React + Vite + TailwindCSS',
        database: 'PostgreSQL 16',
        charts: 'Recharts',
        maps: 'Leaflet',
        api_client: 'Axios + TanStack Query',
        container: 'Docker + Alpine',
      },
      sync_config: syncConfig,
      migrations: {
        pending_count: migrationsStatus.pending.length,
        pending_files: migrationsStatus.pending.map((migration) => migration.filename),
      },
      build: getBuildInfo(),
      timestamp: new Date().toISOString(),
    };

    // Update cache with fresh data
    techStatsCache = { data: responseData, timestamp: Date.now() };

    res.json({ ...responseData, cached: false });
  } catch (error: any) {
    console.error('Error fetching tech stats:', error);
    res.status(500).json({ error: 'Failed to fetch tech statistics' });
  }
});

// Tech stats cache - stores FULL tech stats data
let techStatsCache: { data: any; timestamp: number } | null = null;
const TECH_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hour cache (refreshed after each sync)

/**
 * Refresh the tech stats cache in background
 * Called after sync completes
 */
async function refreshTechStatsCache(): Promise<void> {
  try {
    console.log('🔄 Refreshing tech stats cache...');

    // Run all queries in parallel for speed
    const [
      dbVersionResult,
      dbSizeResult,
      tableSizesResult,
      activityStatsResult,
      streamsStatsResult,
      noGpsResult,
      photoStatsResult,
      activitiesNeedingPhotoSyncResult,
      activitiesNeedingStreamsResult,
      activitiesWithEstimatedPowerResult,
      segmentsCountResult,
      segmentEffortsStatsResult,
      activitiesNeedingSegmentsResult,
      activityTypesResult,
      yearlyStatsResult,
      syncLogsResult,
      migrationsStatus
    ] = await Promise.all([
      db.query('SELECT version()'),
      db.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`),
      db.query(`
        SELECT
          s.relname as table_name,
          pg_size_pretty(pg_total_relation_size(s.relid)) as total_size,
          pg_size_pretty(pg_relation_size(s.relid)) as data_size,
          COALESCE(t.n_live_tup, 0) as row_count
        FROM pg_catalog.pg_statio_user_tables s
        LEFT JOIN pg_catalog.pg_stat_user_tables t ON s.relid = t.relid
        WHERE s.schemaname = 'strava'
        ORDER BY pg_total_relation_size(s.relid) DESC
      `),
      db.query(`
        SELECT
          COUNT(*) as total_activities,
          COUNT(CASE WHEN photo_count > 0 THEN 1 END) as activities_with_photos,
          MIN(start_date) as first_activity,
          MAX(start_date) as last_activity,
          MAX(created_at) as last_sync
        FROM strava.activities
      `),
      db.query(`
        SELECT
          COUNT(DISTINCT activity_id) as activities_with_streams,
          COUNT(*) as total_stream_records,
          SUM(jsonb_array_length(data)) as total_data_points
        FROM strava.activity_streams
        WHERE jsonb_typeof(data->0) = 'array'
      `),
      db.query(`
        SELECT COUNT(*) as count
        FROM strava.activities a
        WHERE NOT EXISTS (
          SELECT 1 FROM strava.activity_streams s
          WHERE s.activity_id = a.strava_activity_id
          AND jsonb_typeof(s.data->0) = 'array'
        )
      `),
      db.query(`
        SELECT
          COUNT(*) as total_photos,
          COUNT(CASE WHEN local_path IS NOT NULL THEN 1 END) as downloaded_photos,
          COUNT(CASE WHEN local_path IS NULL THEN 1 END) as pending_photos,
          COUNT(DISTINCT activity_id) as activities_with_photos_synced
        FROM strava.activity_photos
      `),
      db.query(`
        SELECT COUNT(*) as count
        FROM strava.activities a
        WHERE a.photo_count > 0
        AND NOT EXISTS (
          SELECT 1 FROM strava.activity_photos p
          WHERE p.activity_id = a.strava_activity_id
        )
      `),
      db.query(`
        SELECT COUNT(*) as count
        FROM strava.activities a
        WHERE a.type IN ('Ride', 'Run', 'Walk', 'Hike', 'Swim', 'Kayaking', 'Canoeing', 'StandUpPaddling', 'NordicSki', 'AlpineSki', 'Snowboard', 'IceSkate', 'InlineSkate', 'RollerSki', 'Skateboard', 'Surfing', 'Windsurf', 'Kitesurf', 'Golf', 'Handcycle', 'Wheelchair', 'MountainBikeRide', 'GravelRide', 'EMountainBikeRide', 'VirtualRide', 'VirtualRun', 'VirtualRow', 'VirtualSwim')
        AND NOT EXISTS (
          SELECT 1 FROM strava.activity_streams s
          WHERE s.activity_id = a.strava_activity_id
        )
      `),
      db.query(`
        SELECT COUNT(*) as count
        FROM strava.activities a
        WHERE a.average_watts IS NOT NULL AND a.average_watts > 0
        AND NOT EXISTS (
          SELECT 1 FROM strava.activity_streams s
          WHERE s.activity_id = a.strava_activity_id AND s.stream_type = 'watts'
        )
      `),
      db.query(`
        SELECT COUNT(*) as total_segments
        FROM strava.segments
      `),
      db.query(`
        SELECT
          COUNT(*) as total_efforts,
          COUNT(DISTINCT activity_id) as activities_with_segments
        FROM strava.segment_efforts
      `),
      db.query(`
        SELECT COUNT(*) as count
        FROM strava.activities a
        WHERE a.type IN ('Ride', 'VirtualRide', 'Run', 'TrailRun')
        AND NOT EXISTS (
          SELECT 1 FROM strava.segment_efforts se
          WHERE se.activity_id = a.strava_activity_id
        )
      `),
      db.query(`
        SELECT type, COUNT(*) as count
        FROM strava.activities
        GROUP BY type
        ORDER BY count DESC
      `),
      db.query(`
        WITH yearly_activities AS (
          SELECT
            EXTRACT(YEAR FROM start_date)::int as year,
            COUNT(*) as activities,
            ROUND(SUM(distance) / 1000) as total_km
          FROM strava.activities
          GROUP BY EXTRACT(YEAR FROM start_date)
        ),
        yearly_streams AS (
          SELECT
            EXTRACT(YEAR FROM a.start_date)::int as year,
            COUNT(DISTINCT s.activity_id) as with_streams
          FROM strava.activity_streams s
          JOIN strava.activities a ON a.strava_activity_id = s.activity_id
          GROUP BY EXTRACT(YEAR FROM a.start_date)
        ),
        yearly_power AS (
          SELECT
            EXTRACT(YEAR FROM a.start_date)::int as year,
            COUNT(DISTINCT s.activity_id) as with_power_streams
          FROM strava.activity_streams s
          JOIN strava.activities a ON a.strava_activity_id = s.activity_id
          WHERE s.stream_type = 'watts'
          GROUP BY EXTRACT(YEAR FROM a.start_date)
        )
        SELECT
          ya.year,
          ya.activities,
          ya.total_km,
          COALESCE(ys.with_streams, 0) as with_streams,
          COALESCE(yp.with_power_streams, 0) as with_power_streams
        FROM yearly_activities ya
        LEFT JOIN yearly_streams ys ON ys.year = ya.year
        LEFT JOIN yearly_power yp ON yp.year = ya.year
        ORDER BY ya.year DESC
      `),
      db.query(`
        SELECT
          id,
          started_at,
          completed_at,
          status,
          items_processed,
          error_message,
          EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds
        FROM strava.sync_log
        ORDER BY started_at DESC
        LIMIT 20
      `)
      ,
      checkPendingMigrations()
    ]);

    const activityStats = activityStatsResult.rows[0];
    const streamsStats = streamsStatsResult.rows[0];
    const photoStats = photoStatsResult.rows[0];
    const activitiesNeedingSegments = parseInt(activitiesNeedingSegmentsResult.rows[0]?.count) || 0;

    // Count local photo files
    let photoFileCount = 0;
    try {
      if (fs.existsSync(PHOTO_STORAGE_PATH)) {
        const countFiles = (dir: string): number => {
          let count = 0;
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              count += countFiles(fullPath);
            } else if (stat.isFile()) {
              count++;
            }
          }
          return count;
        };
        photoFileCount = countFiles(PHOTO_STORAGE_PATH);
      }
    } catch {
      // Ignore errors
    }

    const uptimeSeconds = process.uptime();
    const memoryUsage = process.memoryUsage();
    const syncConfig = await loadSyncSettings(db);

    const data = {
      system: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime_seconds: Math.floor(uptimeSeconds),
        uptime_formatted: formatUptime(uptimeSeconds),
        memory: {
          heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
        },
        pid: process.pid,
      },
      database: {
        version: dbVersionResult.rows[0]?.version || 'Unknown',
        size: dbSizeResult.rows[0]?.size || 'Unknown',
        tables: tableSizesResult.rows,
      },
      activities: {
        total: parseInt(activityStats.total_activities) || 0,
        with_photos: parseInt(activityStats.activities_with_photos) || 0,
        with_gps: parseInt(streamsStats.activities_with_streams) || 0,
        without_gps: parseInt(noGpsResult.rows[0]?.count) || 0,
        first_activity: activityStats.first_activity,
        last_activity: activityStats.last_activity,
        last_sync: activityStats.last_sync,
      },
      streams: {
        total_records: parseInt(streamsStats.total_stream_records) || 0,
        total_data_points: parseInt(streamsStats.total_data_points) || 0,
      },
      photos: {
        total: parseInt(photoStats.total_photos) || 0,
        downloaded: parseInt(photoStats.downloaded_photos) || 0,
        pending: parseInt(photoStats.pending_photos) || 0,
        activities_with_photos_synced: parseInt(photoStats.activities_with_photos_synced) || 0,
        local_files: photoFileCount,
      },
      segments: {
        total_segments: parseInt(segmentsCountResult.rows[0]?.total_segments) || 0,
        total_efforts: parseInt(segmentEffortsStatsResult.rows[0]?.total_efforts) || 0,
        activities_with_segments: parseInt(segmentEffortsStatsResult.rows[0]?.activities_with_segments) || 0,
      },
      data_gaps: {
        activities_needing_photo_sync: parseInt(activitiesNeedingPhotoSyncResult.rows[0]?.count) || 0,
        activities_needing_streams: parseInt(activitiesNeedingStreamsResult.rows[0]?.count) || 0,
        activities_with_estimated_power: parseInt(activitiesWithEstimatedPowerResult.rows[0]?.count) || 0,
        photos_needing_download: parseInt(photoStats.pending_photos) || 0,
        activities_needing_segments: activitiesNeedingSegments,
      },
      activity_types: activityTypesResult.rows,
      yearly_stats: yearlyStatsResult.rows,
      sync_logs: syncLogsResult.rows,
      tech_stack: {
        backend: 'Node.js + Express + TypeScript',
        frontend: 'React + Vite + TailwindCSS',
        database: 'PostgreSQL 16',
        charts: 'Recharts',
        maps: 'Leaflet',
        api_client: 'Axios + TanStack Query',
        container: 'Docker + Alpine',
      },
      sync_config: syncConfig,
      migrations: {
        pending_count: migrationsStatus.pending.length,
        pending_files: migrationsStatus.pending.map((migration: any) => migration.filename),
      },
      build: getBuildInfo(),
      timestamp: new Date().toISOString(),
    };

    techStatsCache = { data, timestamp: Date.now() };
    console.log('✅ Tech stats cache refreshed');
  } catch (error) {
    console.error('❌ Error refreshing tech stats cache:', error);
  }
}

// Export for use in index.ts after sync
export { refreshTechStatsCache };

/**
 * GET /api/tech/cached
 * Cached version of tech stats - faster loading
 */
router.get('/tech/cached', async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    const syncConfig = await loadSyncSettings(db);

    // Return cached data if valid
    if (techStatsCache && (now - techStatsCache.timestamp) < TECH_CACHE_TTL) {
      return res.json({
        ...techStatsCache.data,
        sync_config: syncConfig,
        cached: true,
        cache_age_seconds: Math.floor((now - techStatsCache.timestamp) / 1000)
      });
    }

    // Fetch fresh data (simplified version for speed)
    const [
      activityStatsResult,
      streamsStatsResult,
      photoStatsResult,
      syncLogsResult
    ] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) as total_activities,
          COUNT(CASE WHEN photo_count > 0 THEN 1 END) as activities_with_photos,
          MAX(start_date) as last_activity,
          MAX(created_at) as last_sync
        FROM strava.activities
      `),
      db.query(`
        SELECT COUNT(DISTINCT activity_id) as activities_with_streams
        FROM strava.activity_streams
      `),
      db.query(`
        SELECT
          COUNT(*) as total_photos,
          COUNT(CASE WHEN local_path IS NOT NULL THEN 1 END) as downloaded_photos,
          COUNT(CASE WHEN local_path IS NULL THEN 1 END) as pending_photos
        FROM strava.activity_photos
      `),
      db.query(`
        SELECT id, started_at, completed_at, status, items_processed, error_message
        FROM strava.sync_log
        ORDER BY started_at DESC
        LIMIT 20
      `)
    ]);

    const data = {
      activities: {
        total: parseInt(activityStatsResult.rows[0]?.total_activities) || 0,
        with_photos: parseInt(activityStatsResult.rows[0]?.activities_with_photos) || 0,
        with_gps: parseInt(streamsStatsResult.rows[0]?.activities_with_streams) || 0,
        last_activity: activityStatsResult.rows[0]?.last_activity,
        last_sync: activityStatsResult.rows[0]?.last_sync,
      },
      photos: {
        total: parseInt(photoStatsResult.rows[0]?.total_photos) || 0,
        downloaded: parseInt(photoStatsResult.rows[0]?.downloaded_photos) || 0,
        pending: parseInt(photoStatsResult.rows[0]?.pending_photos) || 0,
      },
      sync_logs: syncLogsResult.rows,
      sync_config: syncConfig,
      build: getBuildInfo(),
      timestamp: new Date().toISOString(),
    };

    // Update cache
    techStatsCache = { data, timestamp: now };

    res.json({ ...data, cached: false });
  } catch (error: any) {
    console.error('Error fetching cached tech stats:', error);
    res.status(500).json({ error: 'Failed to fetch tech statistics' });
  }
});

/**
 * GET /api/sync-logs
 * Get sync log history
 */
router.get('/sync-logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await db.query(`
      SELECT
        id,
        started_at,
        completed_at,
        status,
        items_processed,
        error_message,
        EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds
      FROM strava.sync_log
      ORDER BY started_at DESC
      LIMIT $1
    `, [limit]);

    res.json({
      logs: result.rows,
      count: result.rows.length
    });
  } catch (error: any) {
    console.error('Error fetching sync logs:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

/**
 * POST /api/cache/clear
 * Clear all caches
 */
router.post('/cache/clear', async (req: Request, res: Response) => {
  techStatsCache = null;
  res.json({ message: 'Cache cleared' });
});

/**
 * GET /api/stats/week-streak
 * Get consecutive weeks with at least one activity
 */
router.get('/stats/week-streak', async (req: Request, res: Response) => {
  try {
    // Get all unique weeks with activities, sorted descending
    const result = await db.query(`
      SELECT DISTINCT DATE_TRUNC('week', start_date)::date as week_start
      FROM strava.activities
      ORDER BY week_start DESC
    `);

    if (result.rows.length === 0) {
      return res.json({ week_streak: 0 });
    }

    // Get current week start (Monday)
    const now = new Date();
    const currentWeekStart = new Date(now);
    currentWeekStart.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = currentWeekStart.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - daysToMonday);

    // Count consecutive weeks going backwards
    let streak = 0;
    let expectedWeekStart = new Date(currentWeekStart);

    for (const row of result.rows) {
      const weekStart = new Date(row.week_start);
      weekStart.setUTCHours(0, 0, 0, 0);

      // Calculate the difference in weeks
      const diffMs = expectedWeekStart.getTime() - weekStart.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // This week matches expected
        streak++;
        expectedWeekStart.setUTCDate(expectedWeekStart.getUTCDate() - 7);
      } else if (diffDays === 7 && streak === 0) {
        // No activity this week yet, but last week had activity - start streak from there
        streak = 1;
        expectedWeekStart.setUTCDate(expectedWeekStart.getUTCDate() - 14);
      } else if (diffDays > 0) {
        // Gap found, stop counting
        break;
      }
    }

    res.json({ week_streak: streak });
  } catch (error: any) {
    console.error('Error fetching week streak:', error);
    res.status(500).json({ error: 'Failed to fetch week streak' });
  }
});

/**
 * GET /api/stats/year/:year
 * Get statistics for a specific year
 */
router.get('/stats/year/:year', async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.params.year) || new Date().getFullYear();

    const result = await db.query(`
      SELECT
        COUNT(*) as total_activities,
        COALESCE(SUM(distance) / 1000, 0) as total_distance_km,
        COALESCE(SUM(moving_time) / 3600.0, 0) as total_time_hours,
        COALESCE(SUM(total_elevation_gain), 0) as total_elevation_m
      FROM strava.activities
      WHERE EXTRACT(YEAR FROM start_date) = $1
    `, [year]);

    const byTypeResult = await db.query(`
      SELECT
        type,
        COUNT(*) as count,
        COALESCE(SUM(distance) / 1000, 0) as total_km
      FROM strava.activities
      WHERE EXTRACT(YEAR FROM start_date) = $1
      GROUP BY type
      ORDER BY count DESC
    `, [year]);

    res.json({
      year,
      ...result.rows[0],
      by_type: byTypeResult.rows
    });
  } catch (error: any) {
    console.error('Error fetching year stats:', error);
    res.status(500).json({ error: 'Failed to fetch year stats' });
  }
});

/**
 * GET /api/stats/calendar
 * Get activity calendar data for a month
 */
router.get('/stats/calendar', async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    // Calculate the first day of the month and determine padding needed
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const dayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const padStart = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days to show from previous month (Monday start)

    // Calculate date range: from padStart days before month start to end of month
    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - padStart);

    const lastDayOfMonth = new Date(year, month, 0); // Last day of the month

    const result = await db.query(`
      SELECT
        DATE(start_date) as date,
        COUNT(*) as count,
        SUM(distance) / 1000 as total_km,
        array_agg(DISTINCT type) as types
      FROM strava.activities
      WHERE DATE(start_date) >= $1
        AND DATE(start_date) <= $2
      GROUP BY DATE(start_date)
      ORDER BY date
    `, [startDate.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

    res.json({
      year,
      month,
      days: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching calendar:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

/**
 * GET /api/stats/weekly-progress
 * Get current week's stats for goal tracking
 */
router.get('/stats/weekly-progress', async (req: Request, res: Response) => {
  try {
    // Get start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);

    const result = await db.query(`
      SELECT
        COUNT(*) as activities,
        COALESCE(SUM(distance) / 1000, 0) as distance_km,
        COALESCE(SUM(moving_time) / 3600.0, 0) as hours,
        COALESCE(SUM(total_elevation_gain), 0) as elevation_m
      FROM strava.activities
      WHERE start_date >= $1
    `, [weekStart.toISOString()]);

    res.json({
      week_start: weekStart.toISOString(),
      ...result.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching weekly progress:', error);
    res.status(500).json({ error: 'Failed to fetch weekly progress' });
  }
});

/**
 * GET /api/settings
 * Get all user settings
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT key, value, updated_at FROM strava.user_settings
    `);

    const settings: Record<string, any> = {};
    result.rows.forEach((row: any) => {
      settings[row.key] = row.value;
    });

    res.json(settings);
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/settings/:key
 * Update a user setting
 */
router.put('/settings/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
      res.status(400).json({ error: 'Value is required' });
      return;
    }

    await db.query(`
      INSERT INTO strava.user_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, [key, String(value)]);

    res.json({ key, value, updated: true });
  } catch (error: any) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/**
 * GET /api/ftp
 * Get FTP estimation and power zones
 * FTP can be estimated from power curve data or manually set
 */
router.get('/ftp', async (req: Request, res: Response) => {
  try {
    // Check for manually set FTP first
    const settingsResult = await db.query(`
      SELECT key, value FROM strava.user_settings
      WHERE key IN ('ftp', 'athlete_weight')
    `);

    const settings: Record<string, string> = {};
    settingsResult.rows.forEach((row: any) => {
      settings[row.key] = row.value;
    });

    const weight = parseFloat(settings.athlete_weight || '75');
    let ftp: number | null = settings.ftp ? parseFloat(settings.ftp) : null;
    let ftpSource: 'manual' | 'estimated_20min' | 'estimated_60min' = 'manual';
    let estimatedFtp20min: number | null = null;
    let estimatedFtp60min: number | null = null;

    // Get power curve data for estimation
    const powerCurveResult = await db.query(`
      SELECT duration_seconds, best_watts, activity_id
      FROM strava.power_curve_cache
      WHERE year IS NULL AND activity_type IS NULL
      AND duration_seconds IN (1200, 3600)
      ORDER BY duration_seconds
    `);

    const powerData: Record<number, number> = {};
    powerCurveResult.rows.forEach((row: any) => {
      powerData[row.duration_seconds] = row.best_watts;
    });

    // Calculate estimated FTP values
    if (powerData[1200]) {
      // 20min power * 0.95 = estimated FTP
      estimatedFtp20min = Math.round(powerData[1200] * 0.95);
    }
    if (powerData[3600]) {
      // 60min power is a direct FTP estimate
      estimatedFtp60min = powerData[3600];
    }

    // If no manual FTP set, use estimated value
    if (!ftp) {
      if (estimatedFtp60min) {
        ftp = estimatedFtp60min;
        ftpSource = 'estimated_60min';
      } else if (estimatedFtp20min) {
        ftp = estimatedFtp20min;
        ftpSource = 'estimated_20min';
      }
    }

    // Calculate power zones based on FTP (Coggan zones)
    const zones = ftp ? [
      { zone: 1, name: 'Active Recovery', min: 0, max: Math.round(ftp * 0.55), color: '#9ca3af' },
      { zone: 2, name: 'Endurance', min: Math.round(ftp * 0.55), max: Math.round(ftp * 0.75), color: '#3b82f6' },
      { zone: 3, name: 'Tempo', min: Math.round(ftp * 0.75), max: Math.round(ftp * 0.90), color: '#22c55e' },
      { zone: 4, name: 'Threshold', min: Math.round(ftp * 0.90), max: Math.round(ftp * 1.05), color: '#eab308' },
      { zone: 5, name: 'VO2max', min: Math.round(ftp * 1.05), max: Math.round(ftp * 1.20), color: '#f97316' },
      { zone: 6, name: 'Anaerobic', min: Math.round(ftp * 1.20), max: Math.round(ftp * 1.50), color: '#ef4444' },
      { zone: 7, name: 'Neuromuscular', min: Math.round(ftp * 1.50), max: null, color: '#7c3aed' },
    ] : [];

    res.json({
      ftp,
      ftp_source: ftpSource,
      ftp_wkg: ftp ? Math.round((ftp / weight) * 100) / 100 : null,
      weight,
      estimates: {
        from_20min: estimatedFtp20min,
        from_60min: estimatedFtp60min,
      },
      zones,
    });
  } catch (error: any) {
    console.error('Error fetching FTP:', error);
    res.status(500).json({ error: 'Failed to fetch FTP data' });
  }
});

/**
 * GET /api/power-curve/cached
 * Get power curve from cache (fast) - falls back to calculation if cache miss
 */
router.get('/power-curve/cached', async (req: Request, res: Response) => {
  try {
    const { year, type } = req.query;

    // Build WHERE conditions for cache lookup
    let whereConditions = [];
    let params: any[] = [];
    let paramIdx = 1;

    if (year) {
      whereConditions.push(`pc.year = $${paramIdx}`);
      params.push(parseInt(year as string));
      paramIdx++;
    } else {
      whereConditions.push(`pc.year IS NULL`);
    }

    if (type) {
      whereConditions.push(`pc.activity_type = $${paramIdx}`);
      params.push(type);
    } else {
      whereConditions.push(`pc.activity_type IS NULL`);
    }

    // Join with activities to get the activity date
    const cacheResult = await db.query(`
      SELECT pc.duration_seconds, pc.duration_label, pc.best_watts, pc.activity_id,
             pc.activities_analyzed, pc.calculated_at,
             a.start_date as activity_date, a.name as activity_name
      FROM strava.power_curve_cache pc
      LEFT JOIN strava.activities a ON a.strava_activity_id = pc.activity_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY pc.duration_seconds
    `, params);

    if (cacheResult.rows.length > 0) {
      // Get athlete weight for W/kg calculation
      const weightResult = await db.query(`
        SELECT value FROM strava.user_settings WHERE key = 'athlete_weight'
      `);
      const weight = parseFloat(weightResult.rows[0]?.value || '75');

      const durations = cacheResult.rows.map((row: any) => ({
        duration: row.duration_seconds,
        label: row.duration_label,
        watts: row.best_watts,
        watts_per_kg: Math.round((row.best_watts / weight) * 100) / 100,
        activity_id: row.activity_id,
        activity_date: row.activity_date,
        activity_name: row.activity_name,
      }));

      res.json({
        year: year || 'all',
        type: type || 'all',
        activities_analyzed: cacheResult.rows[0]?.activities_analyzed || 0,
        athlete_weight: weight,
        durations,
        cached: true,
        calculated_at: cacheResult.rows[0]?.calculated_at,
      });
      return;
    }

    // Cache miss - calculate on demand (slower)
    res.json({
      year: year || 'all',
      type: type || 'all',
      activities_analyzed: 0,
      durations: [],
      cached: false,
      message: 'No cached data available. Run POST /api/power-curve/calculate to generate cache.',
    });
  } catch (error: any) {
    console.error('Error fetching cached power curve:', error);
    res.status(500).json({ error: 'Failed to fetch power curve' });
  }
});

/**
 * GET /api/power-curve/yearly/cached
 * Get yearly power curve comparison from cache (fast)
 */
router.get('/power-curve/yearly/cached', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    // Get athlete weight for W/kg calculation
    const weightResult = await db.query(`
      SELECT value FROM strava.user_settings WHERE key = 'athlete_weight'
    `);
    const weight = parseFloat(weightResult.rows[0]?.value || '75');

    // Build type filter
    let typeFilter = type ? `activity_type = $1` : `activity_type IS NULL`;
    let params = type ? [type] : [];

    // Get all cached years
    const cacheResult = await db.query(`
      SELECT year, duration_seconds, duration_label, best_watts, activities_analyzed
      FROM strava.power_curve_cache
      WHERE year IS NOT NULL AND ${typeFilter}
      ORDER BY year DESC, duration_seconds
    `, params);

    if (cacheResult.rows.length === 0) {
      res.json({
        type: type || 'all',
        durations: [],
        years: [],
        athlete_weight: weight,
        cached: false,
        message: 'No cached data available. Run POST /api/power-curve/calculate to generate cache.',
      });
      return;
    }

    // Group by year
    const yearMap = new Map<number, any>();
    const durationLabels: string[] = [];

    cacheResult.rows.forEach((row: any) => {
      if (!yearMap.has(row.year)) {
        yearMap.set(row.year, {
          year: row.year,
          activities: row.activities_analyzed,
        });
      }
      const yearEntry = yearMap.get(row.year);
      yearEntry[row.duration_label] = row.best_watts;

      if (!durationLabels.includes(row.duration_label)) {
        durationLabels.push(row.duration_label);
      }
    });

    res.json({
      type: type || 'all',
      durations: durationLabels,
      years: Array.from(yearMap.values()),
      athlete_weight: weight,
      cached: true,
    });
  } catch (error: any) {
    console.error('Error fetching yearly power curve cache:', error);
    res.status(500).json({ error: 'Failed to fetch yearly power curve' });
  }
});

/**
 * POST /api/power-curve/calculate
 * Calculate and cache power curves (run after sync)
 */
router.post('/power-curve/calculate', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    console.log('Starting power curve calculation...');

    // Extended durations including up to 2 hours
    const durations = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 2700, 3600, 5400, 7200];
    const durationLabels = ['5s', '10s', '30s', '1min', '2min', '5min', '10min', '20min', '30min', '45min', '1hr', '1:30h', '2hr'];

    // Get all activity types that have power data
    const typesResult = await db.query(`
      SELECT DISTINCT a.type
      FROM strava.activities a
      JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id
      WHERE s.stream_type = 'watts'
      ORDER BY a.type
    `);
    const activityTypes = [null, ...typesResult.rows.map((r: any) => r.type)]; // null = all types

    // Get all years with power data
    const yearsResult = await db.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM a.start_date)::int as year
      FROM strava.activities a
      JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id
      WHERE s.stream_type = 'watts'
      ORDER BY year DESC
    `);
    const years = [null, ...yearsResult.rows.map((r: any) => r.year)]; // null = all-time

    let calculatedCount = 0;

    // Clear existing cache
    await db.query('DELETE FROM strava.power_curve_cache');

    // Calculate for each type
    for (const type of activityTypes) {
      // Calculate for each year + all-time
      for (const year of years) {
        // Get all activities with power data for this type/year
        let activityQuery = `
          SELECT DISTINCT a.strava_activity_id
          FROM strava.activities a
          JOIN strava.activity_streams s ON s.activity_id = a.strava_activity_id
          WHERE s.stream_type = 'watts'
        `;
        const params: any[] = [];
        let paramIdx = 1;

        if (type) {
          activityQuery += ` AND a.type = $${paramIdx}`;
          params.push(type);
          paramIdx++;
        }

        if (year) {
          activityQuery += ` AND EXTRACT(YEAR FROM a.start_date) = $${paramIdx}`;
          params.push(year);
        }

        const activitiesResult = await db.query(activityQuery, params);

        if (activitiesResult.rows.length === 0) continue;

        // Initialize best efforts
        const bestEfforts: { [key: number]: { watts: number; activity_id: number } } = {};
        durations.forEach(d => bestEfforts[d] = { watts: 0, activity_id: 0 });

        // Process each activity
        for (const activity of activitiesResult.rows) {
          const streams = await db.getActivityStreams(activity.strava_activity_id);
          const wattsStream = streams.find((s: any) => s.stream_type === 'watts');
          if (!wattsStream || !wattsStream.data) continue;

          const watts: number[] = wattsStream.data;

          for (const duration of durations) {
            if (watts.length < duration) continue;

            let maxAvg = 0;
            for (let i = 0; i <= watts.length - duration; i++) {
              const slice = watts.slice(i, i + duration);
              const avg = slice.reduce((a, b) => a + b, 0) / duration;
              if (avg > maxAvg) maxAvg = avg;
            }

            if (maxAvg > bestEfforts[duration].watts) {
              bestEfforts[duration] = { watts: Math.round(maxAvg), activity_id: activity.strava_activity_id };
            }
          }
        }

        // Insert into cache
        for (let i = 0; i < durations.length; i++) {
          const d = durations[i];
          if (bestEfforts[d].watts > 0) {
            await db.query(`
              INSERT INTO strava.power_curve_cache
                (year, activity_type, duration_seconds, duration_label, best_watts, activity_id, activities_analyzed, calculated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
              ON CONFLICT (year, activity_type, duration_seconds)
              DO UPDATE SET best_watts = $5, activity_id = $6, activities_analyzed = $7, calculated_at = NOW()
            `, [year, type, d, durationLabels[i], bestEfforts[d].watts, bestEfforts[d].activity_id, activitiesResult.rows.length]);
            calculatedCount++;
          }
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`Power curve calculation completed in ${elapsed}ms. ${calculatedCount} cache entries created.`);

    res.json({
      success: true,
      cache_entries: calculatedCount,
      elapsed_ms: elapsed,
      message: 'Power curve cache updated successfully',
    });
  } catch (error: any) {
    console.error('Error calculating power curve:', error);
    res.status(500).json({ error: 'Failed to calculate power curve' });
  }
});

/**
 * GET /api/activities/:id/power-metrics
 * Calculate Normalized Power, Intensity Factor, and TSS for an activity
 */
router.get('/activities/:id/power-metrics', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const activityId = parseInt(id);

    // Get activity details
    const activityResult = await db.query(
      'SELECT strava_activity_id, moving_time, average_watts FROM strava.activities WHERE strava_activity_id = $1',
      [activityId]
    );

    if (activityResult.rows.length === 0) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    const activity = activityResult.rows[0];

    // Get power stream data
    const streams = await db.getActivityStreams(activityId);
    const wattsStream = streams.find(s => s.stream_type === 'watts');

    if (!wattsStream || !wattsStream.data) {
      res.status(404).json({
        error: 'No power data available for this activity',
        activity_id: activityId,
        has_power: false,
      });
      return;
    }

    // Get FTP for IF and TSS calculation
    const ftpResult = await db.query("SELECT value FROM strava.user_settings WHERE key = 'ftp'");
    const ftp = ftpResult.rows.length > 0 && ftpResult.rows[0].value
      ? parseFloat(ftpResult.rows[0].value)
      : null;

    // Import power calculation functions
    const { calculatePowerMetrics, calculateVariabilityIndex } = require('../utils/powerCalculations');

    // Calculate all metrics
    const metrics = calculatePowerMetrics(
      wattsStream.data,
      activity.moving_time,
      ftp
    );

    // Calculate Variability Index
    const variabilityIndex = metrics.normalized_power && metrics.average_power
      ? calculateVariabilityIndex(metrics.normalized_power, metrics.average_power)
      : null;

    res.json({
      activity_id: activityId,
      has_power: true,
      ftp: ftp,
      metrics: {
        ...metrics,
        variability_index: variabilityIndex,
      },
    });
  } catch (error: any) {
    console.error('Error calculating power metrics:', error);
    res.status(500).json({ error: 'Failed to calculate power metrics' });
  }
});

/**
 * GET /api/activities/power-metrics/bulk
 * Get Normalized Power and TSS for multiple activities (for training load tracking)
 * Query params: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&type=Ride
 */
router.get('/activities/power-metrics/bulk', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, type } = req.query;

    // Build activity query
    let activityQuery = `
      SELECT a.strava_activity_id, a.name, a.start_date, a.moving_time, a.average_watts, a.type
      FROM strava.activities a
      WHERE a.average_watts IS NOT NULL AND a.average_watts > 0
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (startDate) {
      paramCount++;
      activityQuery += ` AND a.start_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      activityQuery += ` AND a.start_date <= $${paramCount}`;
      params.push(endDate);
    }

    if (type && type !== 'all') {
      paramCount++;
      activityQuery += ` AND a.type = $${paramCount}`;
      params.push(type);
    }

    activityQuery += ' ORDER BY a.start_date ASC';

    const activitiesResult = await db.query(activityQuery, params);

    if (activitiesResult.rows.length === 0) {
      res.json({
        start_date: startDate || 'all',
        end_date: endDate || 'all',
        type: type || 'all',
        activities: [],
      });
      return;
    }

    // Get FTP
    const ftpResult = await db.query("SELECT value FROM strava.user_settings WHERE key = 'ftp'");
    const ftp = ftpResult.rows.length > 0 && ftpResult.rows[0].value
      ? parseFloat(ftpResult.rows[0].value)
      : null;

    // Import power calculation functions
    const { calculatePowerMetrics } = require('../utils/powerCalculations');

    // Calculate metrics for each activity
    const results = [];

    for (const activity of activitiesResult.rows) {
      const streams = await db.getActivityStreams(activity.strava_activity_id);
      const wattsStream = streams.find(s => s.stream_type === 'watts');

      if (wattsStream && wattsStream.data) {
        const metrics = calculatePowerMetrics(
          wattsStream.data,
          activity.moving_time,
          ftp
        );

        results.push({
          activity_id: activity.strava_activity_id,
          name: activity.name,
          date: activity.start_date,
          type: activity.type,
          duration_seconds: activity.moving_time,
          average_power: metrics.average_power,
          normalized_power: metrics.normalized_power,
          intensity_factor: metrics.intensity_factor,
          training_stress_score: metrics.training_stress_score,
        });
      }
    }

    res.json({
      start_date: startDate || 'all',
      end_date: endDate || 'all',
      type: type || 'all',
      ftp: ftp,
      total_activities: activitiesResult.rows.length,
      activities_with_power: results.length,
      activities: results,
    });
  } catch (error: any) {
    console.error('Error calculating bulk power metrics:', error);
    res.status(500).json({ error: 'Failed to calculate bulk power metrics' });
  }
});

/**
 * GET /api/training-load
 * Calculate CTL, ATL, TSB (Training Load) over time
 * Query params: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&type=Ride
 */
router.get('/training-load', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, type } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const { getTrainingLoadWithInsights } = require('../services/trainingLoadService');

    const result = await getTrainingLoadWithInsights({
      startDate: startDate as string,
      endDate: endDate as string,
      activityType: type as string | undefined,
    });

    if (!result) {
      res.json({
        dailyValues: [],
        current: { ctl: 0, atl: 0, tsb: 0 },
        insights: {
          rampRate: null,
          tsbInterpretation: null,
          safeRampRate: null,
        },
      });
      return;
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error calculating training load:', error);
    res.status(500).json({ error: 'Failed to calculate training load' });
  }
});

/**
 * GET /api/user/profile
 * Get current user profile (default user in single-user mode)
 */
router.get('/user/profile', async (req: Request, res: Response) => {
  try {
    const userClient = getUserClient();
    if (!userClient) {
      const fallbackProfile = await ensureDefaultSingleUserProfile();
      const refreshToken = fallbackProfile.strava_refresh_token || process.env.STRAVA_REFRESH_TOKEN || '';
      const tokenSet = Boolean(refreshToken);
      return res.json({ ...fallbackProfile, strava_token_set: tokenSet });
    }

    let profile = await ensureDefaultSingleUserProfile();

    const refreshToken = profile.strava_refresh_token || process.env.STRAVA_REFRESH_TOKEN || '';
    const tokenSet = Boolean(refreshToken);

    if (
      hasCapability('supportsOAuth')
      && (!profile.strava_athlete_id || profile.strava_athlete_id === 0)
      && tokenSet
      && typeof userClient.refreshUserProfileFromProvider === 'function'
    ) {
      try {
        const updatedProfile = await userClient.refreshUserProfileFromProvider(
          profile.id,
          process.env.STRAVA_REFRESH_TOKEN
        );

        if (updatedProfile) {
          profile = updatedProfile;
        }
      } catch (error: any) {
        console.warn('Could not refresh Strava athlete profile:', error?.response?.data || error?.message || error);
      }
    }

    res.json({ ...profile, strava_token_set: tokenSet });
  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

/**
 * PUT /api/user/profile
 * Update user profile
 */
router.put('/user/profile', async (req: Request, res: Response) => {
  try {
    const userClient = getUserClient();
    if (!userClient) {
      const fallbackProfile = await ensureDefaultSingleUserProfile();
      const updates = req.body || {};
      const updatedFallbackProfile = await updateFallbackUserProfile(fallbackProfile.id, updates);
      return res.json(updatedFallbackProfile);
    }

    // Get current user
    const currentProfile = await ensureDefaultSingleUserProfile();

    const updates = req.body;
    const updatedProfile = await userClient.updateUserProfile(currentProfile.id, updates);

    res.json(updatedProfile);
  } catch (error: any) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

/**
 * PUT /api/user/settings/:key
 * Update a specific user setting
 */
router.put('/user/settings/:key', async (req: Request, res: Response) => {
  try {
    const userClient = getUserClient();
    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
      res.status(400).json({ error: 'Value is required' });
      return;
    }

    if (!userClient) {
      const fallbackProfile = await ensureDefaultSingleUserProfile();
      await updateFallbackUserSetting(fallbackProfile.id, key, value);
      return res.json({ success: true, key, value });
    }

    // Get current user
    const currentProfile = await ensureDefaultSingleUserProfile();

    await userClient.updateUserSetting(currentProfile.id, key, value);

    res.json({ success: true, key, value });
  } catch (error: any) {
    console.error('Error updating user setting:', error);
    res.status(500).json({ error: 'Failed to update user setting' });
  }
});

/**
 * GET /api/user/settings
 * Get all user settings
 */
router.get('/user/settings', async (req: Request, res: Response) => {
  try {
    const userClient = getUserClient();
    if (!userClient) {
      const fallbackProfile = await ensureDefaultSingleUserProfile();
      const fallbackSettings = await getFallbackUserSettings(fallbackProfile.id);
      return res.json(fallbackSettings);
    }

    // Get current user
    const currentProfile = await ensureDefaultSingleUserProfile();

    const settings = await userClient.getUserSettings(currentProfile.id);
    res.json(settings);
  } catch (error: any) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

/**
 * POST /api/import/file
 * Import a single activity file (multipart/form-data, field: "file")
 */
router.post('/import/file', requireCapabilities(['supportsFiles'], 'file import'), importUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Missing file upload. Use multipart/form-data field "file".',
      });
    }

    const uploaded = {
      originalname: req.file.originalname,
      buffer: req.file.buffer,
      size: req.file.size,
    };
    const result = importQueueApiEnabled
      ? await enqueueSingleFileImport(db, uploaded)
      : await importSingleFile(db, uploaded);

    if (result.status === 'queued') {
      return res.status(202).json(result);
    }

    if (result.status === 'done') {
      return res.status(201).json(result);
    }
    if (result.status === 'duplicate') {
      return res.status(200).json(result);
    }

    const isClientError = /unsupported file format|parse error/i.test(result.message);
    return res.status(isClientError ? 422 : 500).json(result);
  } catch (error: any) {
    console.error('Error importing file:', error);
    return res.status(500).json({
      error: 'Failed to import file',
      message: error?.message || 'Unknown error',
    });
  }
});

/**
 * POST /api/import/batch
 * Import multiple files (multipart/form-data, field: "files")
 */
router.post('/import/batch', requireCapabilities(['supportsFiles'], 'file import'), importUpload.array('files', 200), async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (!files.length) {
      return res.status(400).json({
        error: 'Missing files upload. Use multipart/form-data field "files".',
      });
    }

    const uploaded = files.map((file) => ({
      originalname: file.originalname,
      buffer: file.buffer,
      size: file.size,
    }));
    const result = importQueueApiEnabled
      ? await enqueueBatchFilesImport(db, uploaded)
      : await importBatchFiles(db, uploaded);

    if (result.status === 'queued') {
      return res.status(202).json(result);
    }

    if (result.status === 'done') {
      return res.status(201).json(result);
    }
    if (result.status === 'partial') {
      return res.status(200).json(result);
    }
    return res.status(422).json(result);
  } catch (error: any) {
    console.error('Error importing batch:', error);
    return res.status(500).json({
      error: 'Failed to import batch',
      message: error?.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/imports
 * List recent import runs
 */
router.get('/imports', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const parsedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    const imports = await db.listImportRuns(limit);
    return res.json({
      imports,
      count: imports.length,
    });
  } catch (error: any) {
    console.error('Error fetching imports:', error);
    return res.status(500).json({ error: 'Failed to fetch imports' });
  }
});

/**
 * GET /api/import/metrics
 * Aggregated import metrics for a rolling window (days).
 */
router.get('/import/metrics', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const parsedDays = Number(req.query.days || 30);
    const days = Number.isFinite(parsedDays) ? parsedDays : 30;
    const metrics = await db.getImportMetrics(days);
    return res.json(metrics);
  } catch (error: any) {
    console.error('Error fetching import metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch import metrics' });
  }
});

/**
 * GET /api/import/queue/status
 * Queue health/status for async import jobs.
 */
router.get('/import/queue/status', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const stats = await db.getImportQueueStats();
    const worker = importQueueWorker.getStatus();
    const alerts = buildImportQueueAlerts(stats, worker);
    const monitor = importQueueAlertMonitor.getStatus();

    return res.json({
      ...stats,
      worker,
      monitor,
      alerts,
    });
  } catch (error: any) {
    console.error('Error fetching import queue status:', error);
    return res.status(500).json({ error: 'Failed to fetch import queue status' });
  }
});

/**
 * GET /api/import/queue/failed
 * List failed queue jobs (DLQ-style view).
 */
router.get('/import/queue/failed', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const parsedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    const parsedImportId = Number(req.query.importId);
    const importId = Number.isFinite(parsedImportId) ? parsedImportId : undefined;
    const jobs = await db.listFailedImportJobs(limit, importId);
    return res.json({
      jobs,
      count: jobs.length,
    });
  } catch (error: any) {
    console.error('Error fetching failed import queue jobs:', error);
    return res.status(500).json({ error: 'Failed to fetch failed import queue jobs' });
  }
});

/**
 * POST /api/import/queue/requeue-failed
 * Requeue failed queue jobs in bulk (optionally for one import run).
 */
router.post('/import/queue/requeue-failed', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const parsedLimit = Number(req.body?.limit ?? 20);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(Math.floor(parsedLimit), 500)) : 20;
    const parsedDelay = Number(req.body?.delayMs ?? 0);
    const delayMs = Number.isFinite(parsedDelay) ? Math.max(0, Math.floor(parsedDelay)) : 0;
    const parsedImportId = Number(req.body?.importId);
    const importId = Number.isFinite(parsedImportId) ? parsedImportId : undefined;

    const failedJobs = await db.listFailedImportJobs(limit, importId);
    if (failedJobs.length === 0) {
      return res.json({
        requested: limit,
        matched: 0,
        requeued: 0,
        skipped: 0,
        importIds: [],
      });
    }

    let requeued = 0;
    let skipped = 0;
    const importIds = new Set<number>();
    const requeuedJobs: number[] = [];

    for (const job of failedJobs) {
      const updated = await db.requeueFailedImportJob(Number(job.id), delayMs);
      if (!updated) {
        skipped += 1;
        continue;
      }

      requeued += 1;
      requeuedJobs.push(Number(job.id));
      importIds.add(Number(updated.import_id));
      await db.updateImportFile(Number(updated.import_file_id), {
        status: 'queued',
        errorMessage: null,
      });
    }

    for (const id of importIds) {
      await refreshImportRunFromFiles(db, id);
    }

    return res.json({
      requested: limit,
      matched: failedJobs.length,
      requeued,
      skipped,
      jobs: requeuedJobs,
      importIds: Array.from(importIds),
    });
  } catch (error: any) {
    console.error('Error bulk-requeueing failed import queue jobs:', error);
    return res.status(500).json({
      error: 'Failed to bulk requeue failed import queue jobs',
      message: error?.message || 'Unknown error',
    });
  }
});

/**
 * DELETE /api/import/queue/failed
 * Delete failed queue jobs in bulk (DLQ cleanup only; keeps import file history intact).
 */
router.delete('/import/queue/failed', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const parsedLimit = Number(req.body?.limit ?? req.query.limit ?? 20);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(Math.floor(parsedLimit), 500)) : 20;
    const parsedImportId = Number(req.body?.importId ?? req.query.importId);
    const importId = Number.isFinite(parsedImportId) ? parsedImportId : undefined;

    const deleted = await db.deleteFailedImportJobs(limit, importId);
    return res.json({
      requested: limit,
      deleted: deleted.length,
      jobs: deleted.map((job) => Number(job.id)),
      importIds: Array.from(new Set(deleted.map((job) => Number(job.import_id)))),
      message: `Deleted ${deleted.length} failed queue job${deleted.length === 1 ? '' : 's'}`,
    });
  } catch (error: any) {
    console.error('Error deleting failed import queue jobs:', error);
    return res.status(500).json({
      error: 'Failed to delete failed import queue jobs',
      message: error?.message || 'Unknown error',
    });
  }
});

/**
 * POST /api/import/queue/jobs/:jobId/requeue
 * Manually requeue one failed import queue job.
 */
router.post('/import/queue/jobs/:jobId/requeue', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId)) {
      return res.status(400).json({ error: 'Invalid job id' });
    }

    const existing = await db.getImportJobById(jobId);
    if (!existing) {
      return res.status(404).json({ error: 'Queue job not found' });
    }
    if (existing.status !== 'failed') {
      return res.status(409).json({ error: 'Only failed queue jobs can be requeued' });
    }

    const parsedDelay = Number(req.body?.delayMs || 0);
    const delayMs = Number.isFinite(parsedDelay) ? Math.max(0, Math.floor(parsedDelay)) : 0;

    const requeued = await db.requeueFailedImportJob(jobId, delayMs);
    if (!requeued) {
      return res.status(409).json({ error: 'Queue job could not be requeued' });
    }

    await db.updateImportFile(Number(requeued.import_file_id), {
      status: 'queued',
      errorMessage: null,
    });
    await refreshImportRunFromFiles(db, Number(requeued.import_id));

    return res.json({
      message: 'Queue job requeued',
      job: requeued,
    });
  } catch (error: any) {
    console.error('Error requeueing import queue job:', error);
    return res.status(500).json({
      error: 'Failed to requeue import queue job',
      message: error?.message || 'Unknown error',
    });
  }
});

/**
 * DELETE /api/import/queue/jobs/:jobId
 * Delete one failed queue job (DLQ cleanup).
 */
router.delete('/import/queue/jobs/:jobId', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId)) {
      return res.status(400).json({ error: 'Invalid job id' });
    }

    const existing = await db.getImportJobById(jobId);
    if (!existing) {
      return res.status(404).json({ error: 'Queue job not found' });
    }
    if (existing.status !== 'failed') {
      return res.status(409).json({ error: 'Only failed queue jobs can be deleted' });
    }

    const deleted = await db.deleteFailedImportJob(jobId);
    if (!deleted) {
      return res.status(409).json({ error: 'Queue job could not be deleted' });
    }

    return res.json({
      message: 'Queue job deleted',
      job: deleted,
    });
  } catch (error: any) {
    console.error('Error deleting import queue job:', error);
    return res.status(500).json({
      error: 'Failed to delete import queue job',
      message: error?.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/imports/:id
 * Get import run with files
 */
router.get('/imports/:id', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const importId = Number(req.params.id);
    if (!Number.isFinite(importId)) {
      return res.status(400).json({ error: 'Invalid import id' });
    }

    const importRun = await db.getImportRunById(importId);
    if (!importRun) {
      return res.status(404).json({ error: 'Import not found' });
    }

    const files = await db.getImportFiles(importId);
    return res.json({
      import: importRun,
      files,
      count: files.length,
    });
  } catch (error: any) {
    console.error('Error fetching import details:', error);
    return res.status(500).json({ error: 'Failed to fetch import details' });
  }
});

/**
 * POST /api/imports/:id/retry-failed
 * Retry failed files for an existing import run.
 */
router.post('/imports/:id/retry-failed', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const importId = Number(req.params.id);
    if (!Number.isFinite(importId)) {
      return res.status(400).json({ error: 'Invalid import id' });
    }

    const existing = await db.getImportRunById(importId);
    if (!existing) {
      return res.status(404).json({ error: 'Import not found' });
    }

    const result = await retryFailedImportFiles(db, importId);
    return res.json(result);
  } catch (error: any) {
    console.error('Error retrying failed import files:', error);
    return res.status(500).json({
      error: 'Failed to retry failed import files',
      message: error?.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/import/watch/status
 * Returns watch-folder runtime status and counters.
 */
router.get('/import/watch/status', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    return res.json(watchFolderService.getStatus());
  } catch (error: any) {
    console.error('Error fetching watch-folder status:', error);
    return res.status(500).json({ error: 'Failed to fetch watch-folder status' });
  }
});

/**
 * POST /api/import/strava-export-zip/chunked/init
 * Initialize or resume a chunked Strava-export ZIP upload session.
 */
router.post(
  '/import/strava-export-zip/chunked/init',
  requireCapabilities(['supportsFiles'], 'file import'),
  async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const originalFilename = String(body.filename || '').trim();
      const clientKey = String(body.clientKey || '').trim();
      const sizeBytes = Number(body.sizeBytes);
      const chunkSize = Number(body.chunkSize);
      const totalChunks = Number(body.totalChunks);

      if (!originalFilename.toLowerCase().endsWith('.zip')) {
        return res.status(400).json({ error: 'Only .zip files are allowed for Strava export upload' });
      }
      if (!clientKey) {
        return res.status(400).json({ error: 'Missing clientKey' });
      }
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > stravaExportZipUploadMaxBytes) {
        return res.status(400).json({ error: `Invalid sizeBytes (max ${stravaExportZipUploadMaxBytes})` });
      }
      if (!Number.isFinite(chunkSize) || chunkSize <= 0 || chunkSize > stravaExportChunkUploadMaxChunkBytes) {
        return res.status(400).json({ error: `Invalid chunkSize (max ${stravaExportChunkUploadMaxChunkBytes})` });
      }
      if (!Number.isFinite(totalChunks) || totalChunks <= 0) {
        return res.status(400).json({ error: 'Invalid totalChunks' });
      }
      if (Math.ceil(sizeBytes / chunkSize) !== Math.floor(totalChunks)) {
        return res.status(400).json({ error: 'totalChunks does not match sizeBytes/chunkSize' });
      }

      const clientKeyHash = hashClientKey(clientKey);
      const uploadId = clientKeyHash.slice(0, 32);
      const { dir, dataPath } = getStravaExportChunkSessionPaths(uploadId);

      let meta = await readStravaExportChunkSessionMeta(uploadId);
      const expectedIdentity = {
        clientKeyHash,
        originalFilename,
        sizeBytes: Math.floor(sizeBytes),
        chunkSize: Math.floor(chunkSize),
        totalChunks: Math.floor(totalChunks),
      };

      const matchesExisting = meta
        && meta.clientKeyHash === expectedIdentity.clientKeyHash
        && meta.originalFilename === expectedIdentity.originalFilename
        && meta.sizeBytes === expectedIdentity.sizeBytes
        && meta.chunkSize === expectedIdentity.chunkSize
        && meta.totalChunks === expectedIdentity.totalChunks;

      if (!matchesExisting) {
        await removeStravaExportChunkSession(uploadId).catch(() => undefined);
        const now = new Date().toISOString();
        meta = {
          uploadId,
          clientKeyHash,
          originalFilename,
          sizeBytes: Math.floor(sizeBytes),
          chunkSize: Math.floor(chunkSize),
          totalChunks: Math.floor(totalChunks),
          receivedBytes: 0,
          nextChunkIndex: 0,
          createdAt: now,
          updatedAt: now,
        };
        await fs.promises.mkdir(dir, { recursive: true });
        await writeStravaExportChunkSessionMeta(meta);
        return res.status(201).json(toStravaExportChunkSessionResponse(meta));
      }

      if (!meta) {
        throw new Error('Chunk session initialization failed');
      }

      try {
        const stat = await fs.promises.stat(dataPath);
        if (stat.isFile() && meta.receivedBytes !== stat.size) {
          meta.receivedBytes = Math.min(stat.size, meta.sizeBytes);
          meta.nextChunkIndex = Math.min(meta.totalChunks, Math.floor(meta.receivedBytes / meta.chunkSize));
          meta.updatedAt = new Date().toISOString();
          await writeStravaExportChunkSessionMeta(meta);
        }
      } catch {
        if (meta.receivedBytes !== 0 || meta.nextChunkIndex !== 0) {
          meta.receivedBytes = 0;
          meta.nextChunkIndex = 0;
          meta.updatedAt = new Date().toISOString();
          await writeStravaExportChunkSessionMeta(meta);
        }
      }

      return res.json(toStravaExportChunkSessionResponse(meta));
    } catch (error: any) {
      console.error('Error initializing chunked Strava export upload:', error);
      return res.status(500).json({
        error: 'Failed to initialize chunked Strava export upload',
        message: error?.message || 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/import/strava-export-zip/chunked/:uploadId/chunk
 * Upload a single ZIP chunk (sequential append).
 */
router.post(
  '/import/strava-export-zip/chunked/:uploadId/chunk',
  requireCapabilities(['supportsFiles'], 'file import'),
  importStravaExportZipChunkUpload.single('chunk'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Missing chunk upload. Use multipart/form-data field "chunk".' });
      }

      const uploadId = String(req.params.uploadId || '');
      const meta = await readStravaExportChunkSessionMeta(uploadId);
      if (!meta) {
        return res.status(404).json({ error: 'Upload session not found' });
      }

      const chunkIndex = Number(req.body?.chunkIndex);
      const chunkOffset = Number(req.body?.chunkOffset);
      if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
        return res.status(400).json({ error: 'Invalid chunkIndex' });
      }
      if (!Number.isFinite(chunkOffset) || chunkOffset < 0) {
        return res.status(400).json({ error: 'Invalid chunkOffset' });
      }

      if (chunkIndex < meta.nextChunkIndex) {
        return res.json({
          ...toStravaExportChunkSessionResponse(meta),
          accepted: false,
          duplicateChunk: true,
        });
      }
      if (chunkIndex !== meta.nextChunkIndex) {
        return res.status(409).json({
          error: 'Unexpected chunkIndex',
          expectedChunkIndex: meta.nextChunkIndex,
          session: toStravaExportChunkSessionResponse(meta),
        });
      }
      if (chunkOffset !== meta.receivedBytes) {
        return res.status(409).json({
          error: 'Unexpected chunkOffset',
          expectedChunkOffset: meta.receivedBytes,
          session: toStravaExportChunkSessionResponse(meta),
        });
      }

      const isLastChunk = chunkIndex === (meta.totalChunks - 1);
      const remaining = Math.max(0, meta.sizeBytes - meta.receivedBytes);
      const expectedMaxThisChunk = isLastChunk ? remaining : Math.min(meta.chunkSize, remaining);
      if (req.file.buffer.length <= 0 || req.file.buffer.length > Math.max(1, expectedMaxThisChunk)) {
        return res.status(400).json({
          error: 'Invalid chunk size',
          expectedMaxChunkBytes: expectedMaxThisChunk,
          actualChunkBytes: req.file.buffer.length,
        });
      }

      const { dir, dataPath } = getStravaExportChunkSessionPaths(uploadId);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.appendFile(dataPath, req.file.buffer);

      meta.receivedBytes += req.file.buffer.length;
      meta.nextChunkIndex += 1;
      meta.updatedAt = new Date().toISOString();
      if (meta.receivedBytes > meta.sizeBytes) {
        return res.status(400).json({ error: 'Chunk upload exceeds declared file size' });
      }
      await writeStravaExportChunkSessionMeta(meta);

      return res.status(201).json({
        ...toStravaExportChunkSessionResponse(meta),
        accepted: true,
      });
    } catch (error: any) {
      console.error('Error uploading Strava export ZIP chunk:', error);
      return res.status(500).json({
        error: 'Failed to upload Strava export ZIP chunk',
        message: error?.message || 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/import/strava-export-zip/chunked/:uploadId/complete
 * Finalize chunked upload and trigger Strava export ZIP import.
 */
router.post(
  '/import/strava-export-zip/chunked/:uploadId/complete',
  requireCapabilities(['supportsFiles'], 'file import'),
  async (req: Request, res: Response) => {
    try {
      const uploadId = String(req.params.uploadId || '');
      const meta = await readStravaExportChunkSessionMeta(uploadId);
      if (!meta) {
        return res.status(404).json({ error: 'Upload session not found' });
      }
      if (Number.isFinite(Number(meta.processingImportId)) && Number(meta.processingImportId) > 0) {
        return res.status(202).json({
          importId: Number(meta.processingImportId),
          status: 'queued',
          filesTotal: 0,
          filesOk: 0,
          filesSkipped: 0,
          filesFailed: 0,
          files: [],
        });
      }
      if (meta.nextChunkIndex < meta.totalChunks || meta.receivedBytes < meta.sizeBytes) {
        return res.status(409).json({
          error: 'Upload not complete',
          session: toStravaExportChunkSessionResponse(meta),
        });
      }

      const includeMedia = parseBooleanLike(req.body?.includeMedia ?? req.body?.include_media) === true;
      const { dataPath } = getStravaExportChunkSessionPaths(uploadId);
      const stat = await fs.promises.stat(dataPath);
      if (!stat.isFile()) {
        return res.status(404).json({ error: 'Upload payload not found on disk' });
      }
      if (stat.size !== meta.sizeBytes) {
        return res.status(409).json({
          error: 'Uploaded file size mismatch',
          expectedSizeBytes: meta.sizeBytes,
          actualSizeBytes: stat.size,
        });
      }

      if (importQueueApiEnabled) {
        const importId = await db.createImportRun({
          type: 'batch',
          status: 'queued',
          source: 'file',
          filesTotal: 0,
        });
        meta.processingImportId = importId;
        meta.processingStartedAt = new Date().toISOString();
        meta.updatedAt = new Date().toISOString();
        await writeStravaExportChunkSessionMeta(meta);

        setImmediate(() => {
          enqueueStravaExportZipImportFromPathWithImportId(db, importId, {
            originalFilename: meta.originalFilename,
            absolutePath: dataPath,
            sizeBytes: meta.sizeBytes,
          }, { includeMedia })
            .catch(async (error: any) => {
              console.error('Background Strava export ZIP queue import failed:', error);
              try {
                await db.updateImportRun(importId, {
                  status: 'error',
                  finishedAt: new Date(),
                });
              } catch (updateError) {
                console.error('Failed to mark background Strava ZIP import as error:', updateError);
              }
            })
            .finally(() => {
              removeStravaExportChunkSession(uploadId).catch(() => undefined);
            });
        });

        return res.status(202).json({
          importId,
          status: 'queued',
          filesTotal: 0,
          filesOk: 0,
          filesSkipped: 0,
          filesFailed: 0,
          files: [],
        });
      }

      const result = await importStravaExportZipFromPath(db, {
        originalFilename: meta.originalFilename,
        absolutePath: dataPath,
        sizeBytes: meta.sizeBytes,
      }, { includeMedia });

      await removeStravaExportChunkSession(uploadId).catch(() => undefined);

      if (result.status === 'done') {
        return res.status(201).json(result);
      }
      if (result.status === 'partial') {
        return res.status(200).json(result);
      }
      return res.status(422).json(result);
    } catch (error: any) {
      console.error('Error completing chunked Strava export ZIP upload:', error);
      return res.status(500).json({
        error: 'Failed to complete chunked Strava export ZIP upload',
        message: error?.message || 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/import/strava-export-zip
 * Import a full Strava account-export ZIP (large upload, server extracts only relevant files).
 */
router.post(
  '/import/strava-export-zip',
  requireCapabilities(['supportsFiles'], 'file import'),
  importStravaExportZipUpload.single('file'),
  async (req: Request, res: Response) => {
    const uploadedPath = req.file?.path;
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Missing file upload. Use multipart/form-data field "file".',
        });
      }
      const includeMedia = parseBooleanLike(req.body?.includeMedia ?? req.body?.include_media) === true;

      const result = importQueueApiEnabled
        ? await enqueueStravaExportZipImportFromPath(db, {
          originalFilename: req.file.originalname,
          absolutePath: req.file.path,
          sizeBytes: req.file.size,
        }, { includeMedia })
        : await importStravaExportZipFromPath(db, {
          originalFilename: req.file.originalname,
          absolutePath: req.file.path,
          sizeBytes: req.file.size,
        }, { includeMedia });

      if (result.status === 'queued') {
        return res.status(202).json(result);
      }
      if (result.status === 'done') {
        return res.status(201).json(result);
      }
      if (result.status === 'partial') {
        return res.status(200).json(result);
      }
      return res.status(422).json(result);
    } catch (error: any) {
      console.error('Error importing Strava export ZIP:', error);
      return res.status(500).json({
        error: 'Failed to import Strava export ZIP',
        message: error?.message || 'Unknown error',
      });
    } finally {
      if (uploadedPath) {
        fs.promises.unlink(uploadedPath).catch(() => undefined);
      }
    }
  }
);

const persistWatchFolderConfig = async (config: WatchFolderConfig): Promise<void> => {
  const updates: Array<{ key: string; value: string }> = [
    { key: 'watch_folder_enabled', value: String(config.enabled) },
    { key: 'watch_folder_path', value: String(config.path || '') },
    { key: 'watch_folder_recursive', value: String(config.recursive) },
    { key: 'watch_folder_poll_seconds', value: String(config.pollSeconds) },
    { key: 'watch_folder_stable_checks', value: String(config.stableChecksRequired) },
  ];

  const userClient = getUserClient();
  if (!userClient) {
    const fallbackProfile = await getFallbackUserProfile();
    if (!fallbackProfile) {
      throw new Error('User profile not found');
    }
    for (const update of updates) {
      await updateFallbackUserSetting(fallbackProfile.id, update.key, update.value);
    }
    return;
  }

  const currentProfile = await userClient.getDefaultUserProfile();
  if (!currentProfile) {
    throw new Error('User profile not found');
  }
  for (const update of updates) {
    await userClient.updateUserSetting(currentProfile.id, update.key, update.value);
  }
};

/**
 * GET /api/import/watch/config
 * Returns editable watch-folder configuration.
 */
router.get('/import/watch/config', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    return res.json(watchFolderService.getConfig());
  } catch (error: any) {
    console.error('Error fetching watch-folder config:', error);
    return res.status(500).json({ error: 'Failed to fetch watch-folder config' });
  }
});

/**
 * PUT /api/import/watch/config
 * Updates watch-folder configuration and persists it in user settings.
 */
router.put('/import/watch/config', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const patch: Partial<WatchFolderConfig> = {};

    if (has('enabled')) {
      const parsed = parseBooleanLike(body.enabled);
      if (parsed === undefined) {
        return res.status(400).json({ error: 'Invalid "enabled" value' });
      }
      patch.enabled = parsed;
    }

    if (has('path')) {
      patch.path = String(body.path ?? '').trim();
    }

    if (has('recursive')) {
      const parsed = parseBooleanLike(body.recursive);
      if (parsed === undefined) {
        return res.status(400).json({ error: 'Invalid "recursive" value' });
      }
      patch.recursive = parsed;
    }

    if (has('pollSeconds')) {
      const parsed = Number(body.pollSeconds);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 3600) {
        return res.status(400).json({ error: 'Invalid "pollSeconds" value (allowed: 1..3600)' });
      }
      patch.pollSeconds = Math.floor(parsed);
    }

    if (has('stableChecksRequired')) {
      const parsed = Number(body.stableChecksRequired);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 20) {
        return res.status(400).json({ error: 'Invalid "stableChecksRequired" value (allowed: 1..20)' });
      }
      patch.stableChecksRequired = Math.floor(parsed);
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid config fields provided' });
    }

    const nextConfig: WatchFolderConfig = {
      ...watchFolderService.getConfig(),
      ...patch,
    };

    if (nextConfig.path && !path.isAbsolute(nextConfig.path)) {
      return res.status(400).json({ error: 'Watch-folder path must be an absolute path' });
    }
    if (nextConfig.enabled && !nextConfig.path) {
      return res.status(400).json({ error: 'Watch-folder path is required when enabled=true' });
    }

    await watchFolderService.updateConfig(nextConfig);
    await persistWatchFolderConfig(nextConfig);

    return res.json({
      message: 'Watch-folder config updated',
      config: watchFolderService.getConfig(),
      status: watchFolderService.getStatus(),
    });
  } catch (error: any) {
    console.error('Error updating watch-folder config:', error);
    return res.status(500).json({ error: 'Failed to update watch-folder config' });
  }
});

/**
 * POST /api/import/watch/rescan
 * Trigger a manual scan cycle for watch-folder imports.
 */
router.post('/import/watch/rescan', requireCapabilities(['supportsFiles'], 'file import'), async (req: Request, res: Response) => {
  try {
    await watchFolderService.rescanNow();
    return res.json({
      message: 'Watch-folder rescan completed',
      status: watchFolderService.getStatus(),
    });
  } catch (error: any) {
    console.error('Error triggering watch-folder rescan:', error);
    return res.status(500).json({ error: 'Failed to trigger watch-folder rescan' });
  }
});

export default router;
