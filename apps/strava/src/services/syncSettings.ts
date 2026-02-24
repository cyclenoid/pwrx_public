import DatabaseService from './database';

export interface SyncSettings {
  timezone: string;
  startup: {
    enabled: boolean;
    staleHours: number;
  };
  activity: {
    enabled: boolean;
    cron: string;
    recentDays: number;
    includeStreams: boolean;
    includeSegments: boolean;
  };
  backfill: {
    enabled: boolean;
    cron: string;
    streamsLimit: number;
    segmentsLimit: number;
    photosLimit: number;
    downloadsLimit: number;
  };
}

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  timezone: process.env.SYNC_TIMEZONE || process.env.TZ || 'UTC',
  startup: {
    enabled: true,
    staleHours: 18,
  },
  activity: {
    enabled: true,
    cron: process.env.CRON_SCHEDULE || '0 3 * * *',
    recentDays: 7,
    includeStreams: true,
    includeSegments: true,
  },
  backfill: {
    enabled: true,
    cron: process.env.BACKFILL_CRON_SCHEDULE || '30 3 * * *',
    streamsLimit: 500,
    segmentsLimit: 200,
    photosLimit: 200,
    downloadsLimit: 100,
  },
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeCron(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${minute} ${hour} * * *`;
    }
  }
  return trimmed;
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

export async function loadSyncSettings(db: DatabaseService): Promise<SyncSettings> {
  const userId = await getActiveUserId(db);
  if (!userId) {
    return DEFAULT_SYNC_SETTINGS;
  }

  const settingsResult = await db.query(
    'SELECT key, value FROM strava.user_settings WHERE user_id = $1',
    [userId]
  );

  const map = new Map<string, string>();
  settingsResult.rows.forEach((row: any) => {
    map.set(String(row.key), String(row.value));
  });

  const activitySettings = {
    enabled: parseBoolean(map.get('sync_activity_enabled'), DEFAULT_SYNC_SETTINGS.activity.enabled),
    cron: normalizeCron(map.get('sync_activity_cron'), DEFAULT_SYNC_SETTINGS.activity.cron),
    recentDays: parseNumber(map.get('sync_activity_recent_days'), DEFAULT_SYNC_SETTINGS.activity.recentDays, 1, 90),
    includeStreams: parseBoolean(map.get('sync_activity_include_streams'), DEFAULT_SYNC_SETTINGS.activity.includeStreams),
    includeSegments: parseBoolean(map.get('sync_activity_include_segments'), DEFAULT_SYNC_SETTINGS.activity.includeSegments),
  };

  if (activitySettings.enabled) {
    activitySettings.includeStreams = true;
    activitySettings.includeSegments = true;
  }

  const backfillSettings = {
    enabled: parseBoolean(map.get('sync_backfill_enabled'), DEFAULT_SYNC_SETTINGS.backfill.enabled),
    cron: normalizeCron(map.get('sync_backfill_cron'), DEFAULT_SYNC_SETTINGS.backfill.cron),
    streamsLimit: parseNumber(map.get('sync_backfill_streams_limit'), DEFAULT_SYNC_SETTINGS.backfill.streamsLimit, 0, 2000),
    segmentsLimit: parseNumber(map.get('sync_backfill_segments_limit'), DEFAULT_SYNC_SETTINGS.backfill.segmentsLimit, 0, 1000),
    photosLimit: parseNumber(map.get('sync_backfill_photos_limit'), DEFAULT_SYNC_SETTINGS.backfill.photosLimit, 0, 1000),
    downloadsLimit: parseNumber(map.get('sync_backfill_downloads_limit'), DEFAULT_SYNC_SETTINGS.backfill.downloadsLimit, 0, 1000),
  };

  if (backfillSettings.enabled) {
    if (backfillSettings.streamsLimit <= 0) backfillSettings.streamsLimit = DEFAULT_SYNC_SETTINGS.backfill.streamsLimit;
    if (backfillSettings.segmentsLimit <= 0) backfillSettings.segmentsLimit = DEFAULT_SYNC_SETTINGS.backfill.segmentsLimit;
    if (backfillSettings.photosLimit <= 0) backfillSettings.photosLimit = DEFAULT_SYNC_SETTINGS.backfill.photosLimit;
    if (backfillSettings.downloadsLimit <= 0) backfillSettings.downloadsLimit = DEFAULT_SYNC_SETTINGS.backfill.downloadsLimit;
  }

  return {
    timezone: map.get('sync_timezone') || DEFAULT_SYNC_SETTINGS.timezone,
    startup: {
      enabled: parseBoolean(map.get('sync_on_startup'), DEFAULT_SYNC_SETTINGS.startup.enabled),
      staleHours: parseNumber(map.get('sync_startup_stale_hours'), DEFAULT_SYNC_SETTINGS.startup.staleHours, 1, 168),
    },
    activity: activitySettings,
    backfill: backfillSettings,
  };
}

export function getDefaultSyncSettings(): SyncSettings {
  return DEFAULT_SYNC_SETTINGS;
}
