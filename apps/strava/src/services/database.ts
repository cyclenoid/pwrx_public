import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root (apps/strava) - override existing env vars
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });
const SYNC_LOCK_KEY = 0x50575258; // "PWRX" advisory lock key

export interface Activity {
  id?: number;
  user_id?: number;
  strava_activity_id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: Date;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  average_cadence?: number;
  kilojoules?: number;
  calories?: number;
  gear_id?: string;
  device_name?: string;
  kudos_count?: number;
  comment_count?: number;
  achievement_count?: number;
  photo_count?: number;
  source?: string;
  external_id?: string;
  fingerprint?: string;
  import_batch_id?: number | null;
}

export interface ActivityStream {
  id?: number;
  activity_id: number;
  stream_type: string;
  data: any[];
}

export interface Segment {
  id: number;
  name?: string;
  activity_type?: string;
  distance?: number;
  average_grade?: number;
  maximum_grade?: number;
  elevation_high?: number;
  elevation_low?: number;
  start_latlng?: [number, number] | null;
  end_latlng?: [number, number] | null;
  climb_category?: number;
  city?: string;
  state?: string;
  country?: string;
  source?: string;
  local_fingerprint?: string | null;
  is_auto_climb?: boolean;
}

export interface SegmentEffort {
  effort_id: number;
  segment_id: number;
  activity_id: number;
  user_id?: number | null;
  name?: string;
  start_date?: Date;
  start_date_local?: Date;
  elapsed_time?: number;
  moving_time?: number;
  distance?: number;
  average_watts?: number | null;
  average_heartrate?: number | null;
  pr_rank?: number | null;
  kom_rank?: number | null;
  rank?: number | null;
  start_index?: number | null;
  end_index?: number | null;
  device_watts?: boolean | null;
  hidden?: boolean | null;
  source?: string;
}

export interface AthleteStats {
  id?: number;
  recorded_at?: Date;
  recent_ride_totals_count?: number;
  recent_ride_totals_distance?: number;
  recent_ride_totals_time?: number;
  recent_run_totals_count?: number;
  recent_run_totals_distance?: number;
  recent_run_totals_time?: number;
  ytd_ride_totals_count?: number;
  ytd_ride_totals_distance?: number;
  ytd_run_totals_count?: number;
  ytd_run_totals_distance?: number;
  all_ride_totals_count?: number;
  all_ride_totals_distance?: number;
  all_run_totals_count?: number;
  all_run_totals_distance?: number;
}

export interface Gear {
  id: string;
  name: string;
  brand_name?: string;
  model_name?: string;
  description?: string;
  type?: string;
  distance?: number;
  retired?: boolean;
}

export interface SyncLog {
  id?: number;
  started_at?: Date;
  completed_at?: Date;
  status: string;
  items_processed?: number;
  error_message?: string;
}

export interface ActivityPhoto {
  id?: number;
  activity_id: number;
  unique_id: string;
  caption?: string;
  source: number;
  url_small?: string;
  url_medium?: string;
  url_large?: string;
  local_path?: string;  // Local file path for downloaded photo
  is_primary: boolean;
  location?: [number, number];
  uploaded_at?: Date;
}

export type ImportType = 'single' | 'batch' | 'watchfolder';
export type ImportStatus = 'queued' | 'processing' | 'done' | 'error' | 'partial';
export type ImportSource = 'file' | 'watchfolder' | 'api';
export type ImportFileStatus = 'queued' | 'processing' | 'ok' | 'skipped_duplicate' | 'failed';
export type ImportJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface ImportRun {
  id?: number;
  type: ImportType;
  status: ImportStatus;
  source: ImportSource;
  started_at?: Date;
  finished_at?: Date | null;
  files_total?: number;
  files_ok?: number;
  files_skipped?: number;
  files_failed?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface ImportFileRecord {
  id?: number;
  import_id: number;
  path?: string | null;
  original_filename: string;
  size_bytes?: number | null;
  sha256: string;
  detected_format?: string | null;
  status: ImportFileStatus;
  error_message?: string | null;
  activity_id?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface ImportJob {
  id?: number;
  import_id: number;
  import_file_id: number;
  status: ImportJobStatus;
  priority?: number;
  attempt_count?: number;
  max_attempts?: number;
  available_at?: Date;
  started_at?: Date | null;
  finished_at?: Date | null;
  last_error?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface ImportQueueStats {
  queued: number;
  ready: number;
  processing: number;
  done: number;
  failed: number;
  failedLast24h: number;
  doneLastHour: number;
  nextAvailableAt: Date | null;
}

export interface ImportFailedJobRecord {
  id: number;
  import_id: number;
  import_file_id: number;
  status: ImportJobStatus;
  attempt_count: number;
  max_attempts: number;
  priority: number;
  available_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  last_error: string | null;
  original_filename: string;
  detected_format: string | null;
  file_status: ImportFileStatus;
  import_status: ImportStatus;
}

export interface ImportMetrics {
  windowDays: number;
  runs: number;
  runsDone: number;
  runsPartial: number;
  runsError: number;
  runsInProgress: number;
  filesTotal: number;
  filesOk: number;
  filesSkipped: number;
  filesFailed: number;
  successRate: number;
  failureRate: number;
  avgFilesPerRun: number;
  avgDurationSec: number | null;
  lastRunAt: Date | null;
}

export class DatabaseService {
  private pool: Pool;
  private schema: string;

  constructor() {
    this.schema = process.env.DB_SCHEMA || 'public';
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

    // Set search_path to use our schema
    this.pool.on('connect', async (client: PoolClient) => {
      try {
        await client.query(`SET search_path TO ${this.schema}, public`);
      } catch (err) {
        console.error('Error setting schema:', err);
      }
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('💥 Unexpected database error:', err);
    });
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      return false;
    }
  }

  /**
   * Execute a raw SQL query
   */
  async query(sql: string, params?: any[]): Promise<any> {
    return await this.pool.query(sql, params);
  }

  /**
   * Acquire a global sync lock (session-level advisory lock).
   */
  async acquireSyncLock(): Promise<PoolClient | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [SYNC_LOCK_KEY]
      );
      if (!result.rows[0]?.locked) {
        client.release();
        return null;
      }
      return client;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  /**
   * Release the sync lock and return the client to the pool.
   */
  async releaseSyncLock(client: PoolClient): Promise<void> {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [SYNC_LOCK_KEY]);
    } finally {
      client.release();
    }
  }

  /**
   * Insert or update an activity
   */
  async upsertActivity(activity: Activity): Promise<number> {
    // If no user_id provided, get the active user
    let userId = activity.user_id;
    if (!userId) {
      const userResult = await this.pool.query(
        'SELECT id FROM user_profile WHERE is_active = true ORDER BY id LIMIT 1'
      );
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      } else {
        // Fallback to first user
        const firstUserResult = await this.pool.query(
          'SELECT id FROM user_profile ORDER BY id LIMIT 1'
        );
        userId = firstUserResult.rows[0]?.id;
      }
    }

    const query = `
      INSERT INTO activities (
        user_id, strava_activity_id, name, type, sport_type, start_date,
        distance, moving_time, elapsed_time, total_elevation_gain,
        average_speed, max_speed, average_heartrate, max_heartrate,
        average_watts, max_watts, average_cadence, kilojoules, calories, gear_id,
        device_name, kudos_count, comment_count, achievement_count, photo_count,
        source, external_id, fingerprint, import_batch_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
      ON CONFLICT (strava_activity_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        sport_type = EXCLUDED.sport_type,
        distance = EXCLUDED.distance,
        moving_time = EXCLUDED.moving_time,
        elapsed_time = EXCLUDED.elapsed_time,
        total_elevation_gain = EXCLUDED.total_elevation_gain,
        average_speed = EXCLUDED.average_speed,
        max_speed = EXCLUDED.max_speed,
        average_heartrate = EXCLUDED.average_heartrate,
        max_heartrate = EXCLUDED.max_heartrate,
        average_watts = EXCLUDED.average_watts,
        max_watts = EXCLUDED.max_watts,
        average_cadence = EXCLUDED.average_cadence,
        kilojoules = EXCLUDED.kilojoules,
        calories = EXCLUDED.calories,
        gear_id = EXCLUDED.gear_id,
        device_name = EXCLUDED.device_name,
        kudos_count = EXCLUDED.kudos_count,
        comment_count = EXCLUDED.comment_count,
        achievement_count = EXCLUDED.achievement_count,
        photo_count = EXCLUDED.photo_count,
        source = EXCLUDED.source,
        external_id = EXCLUDED.external_id,
        fingerprint = EXCLUDED.fingerprint,
        import_batch_id = EXCLUDED.import_batch_id,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `;

    const values = [
      userId,
      activity.strava_activity_id,
      activity.name,
      activity.type,
      activity.sport_type,
      activity.start_date,
      activity.distance,
      activity.moving_time,
      activity.elapsed_time,
      activity.total_elevation_gain,
      activity.average_speed,
      activity.max_speed,
      activity.average_heartrate,
      activity.max_heartrate,
      activity.average_watts,
      activity.max_watts,
      activity.average_cadence,
      activity.kilojoules,
      activity.calories,
      activity.gear_id,
      activity.device_name || null,
      activity.kudos_count || 0,
      activity.comment_count || 0,
      activity.achievement_count || 0,
      activity.photo_count || 0,
      activity.source || 'strava',
      activity.external_id || null,
      activity.fingerprint || null,
      activity.import_batch_id ?? null,
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Insert activity stream data
   */
  async insertActivityStream(stream: ActivityStream): Promise<void> {
    // Delete existing stream of this type for this activity
    await this.pool.query(
      'DELETE FROM activity_streams WHERE activity_id = $1 AND stream_type = $2',
      [stream.activity_id, stream.stream_type]
    );

    // Insert new stream
    const query = `
      INSERT INTO activity_streams (activity_id, stream_type, data)
      VALUES ($1, $2, $3)
    `;

    await this.pool.query(query, [
      stream.activity_id,
      stream.stream_type,
      JSON.stringify(stream.data),
    ]);
  }

  /**
   * Insert or update a segment definition
   */
  async upsertSegment(segment: Segment): Promise<void> {
    const query = `
      INSERT INTO segments (
        id, name, activity_type, distance, average_grade, maximum_grade,
        elevation_high, elevation_low, start_latlng, end_latlng,
        climb_category, city, state, country, source, local_fingerprint, is_auto_climb
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        activity_type = EXCLUDED.activity_type,
        distance = EXCLUDED.distance,
        average_grade = EXCLUDED.average_grade,
        maximum_grade = EXCLUDED.maximum_grade,
        elevation_high = EXCLUDED.elevation_high,
        elevation_low = EXCLUDED.elevation_low,
        start_latlng = EXCLUDED.start_latlng,
        end_latlng = EXCLUDED.end_latlng,
        climb_category = EXCLUDED.climb_category,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        country = EXCLUDED.country,
        source = EXCLUDED.source,
        local_fingerprint = EXCLUDED.local_fingerprint,
        is_auto_climb = EXCLUDED.is_auto_climb,
        updated_at = CURRENT_TIMESTAMP
    `;

    await this.pool.query(query, [
      segment.id,
      segment.name || null,
      segment.activity_type || null,
      segment.distance ?? null,
      segment.average_grade ?? null,
      segment.maximum_grade ?? null,
      segment.elevation_high ?? null,
      segment.elevation_low ?? null,
      segment.start_latlng ? JSON.stringify(segment.start_latlng) : null,
      segment.end_latlng ? JSON.stringify(segment.end_latlng) : null,
      segment.climb_category ?? null,
      segment.city || null,
      segment.state || null,
      segment.country || null,
      segment.source || 'strava',
      segment.local_fingerprint ?? null,
      segment.is_auto_climb ?? false,
    ]);
  }

  /**
   * Insert or update a segment effort
   */
  async upsertSegmentEffort(effort: SegmentEffort): Promise<void> {
    const query = `
      INSERT INTO segment_efforts (
        effort_id, segment_id, activity_id, user_id, name,
        start_date, start_date_local, elapsed_time, moving_time, distance,
        average_watts, average_heartrate, pr_rank, kom_rank, rank,
        start_index, end_index, device_watts, hidden, source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (effort_id)
      DO UPDATE SET
        segment_id = EXCLUDED.segment_id,
        activity_id = EXCLUDED.activity_id,
        user_id = EXCLUDED.user_id,
        name = EXCLUDED.name,
        start_date = EXCLUDED.start_date,
        start_date_local = EXCLUDED.start_date_local,
        elapsed_time = EXCLUDED.elapsed_time,
        moving_time = EXCLUDED.moving_time,
        distance = EXCLUDED.distance,
        average_watts = EXCLUDED.average_watts,
        average_heartrate = EXCLUDED.average_heartrate,
        pr_rank = EXCLUDED.pr_rank,
        kom_rank = EXCLUDED.kom_rank,
        rank = EXCLUDED.rank,
        start_index = EXCLUDED.start_index,
        end_index = EXCLUDED.end_index,
        device_watts = EXCLUDED.device_watts,
        hidden = EXCLUDED.hidden,
        source = EXCLUDED.source,
        updated_at = CURRENT_TIMESTAMP
    `;

    await this.pool.query(query, [
      effort.effort_id,
      effort.segment_id,
      effort.activity_id,
      effort.user_id ?? null,
      effort.name || null,
      effort.start_date || null,
      effort.start_date_local || null,
      effort.elapsed_time ?? null,
      effort.moving_time ?? null,
      effort.distance ?? null,
      effort.average_watts ?? null,
      effort.average_heartrate ?? null,
      effort.pr_rank ?? null,
      effort.kom_rank ?? null,
      effort.rank ?? null,
      effort.start_index ?? null,
      effort.end_index ?? null,
      effort.device_watts ?? null,
      effort.hidden ?? null,
      effort.source || 'strava',
    ]);
  }

  /**
   * Clear all segment efforts for an activity
   */
  async deleteSegmentEffortsForActivity(activityId: number, source?: string): Promise<void> {
    if (source) {
      await this.pool.query(
        'DELETE FROM segment_efforts WHERE activity_id = $1 AND source = $2',
        [activityId, source]
      );
      return;
    }
    await this.pool.query(
      'DELETE FROM segment_efforts WHERE activity_id = $1',
      [activityId]
    );
  }

  async getSegmentByLocalFingerprint(fingerprint: string): Promise<Segment | null> {
    const result = await this.pool.query(
      `SELECT * FROM segments WHERE local_fingerprint = $1 LIMIT 1`,
      [fingerprint]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getNextLocalSegmentId(): Promise<number> {
    const result = await this.pool.query(
      `SELECT nextval('local_segment_id_seq') AS id`
    );
    return Number(result.rows[0].id);
  }

  async getNextLocalSegmentEffortId(): Promise<number> {
    const result = await this.pool.query(
      `SELECT nextval('local_segment_effort_id_seq') AS id`
    );
    return Number(result.rows[0].id);
  }

  /**
   * Get activity by Strava ID
   */
  async getActivityByStravaId(stravaActivityId: number): Promise<Activity | null> {
    const result = await this.pool.query(
      'SELECT * FROM activities WHERE strava_activity_id = $1',
      [stravaActivityId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get activity streams
   */
  async getActivityStreams(stravaActivityId: number): Promise<ActivityStream[]> {
    const result = await this.pool.query(
      'SELECT * FROM activity_streams WHERE activity_id = $1',
      [stravaActivityId]
    );

    return result.rows.map(row => ({
      id: row.id,
      activity_id: row.activity_id,
      stream_type: row.stream_type,
      data: row.data,
    }));
  }

  /**
   * Upsert athlete stats
   */
  async upsertAthleteStats(stats: AthleteStats): Promise<void> {
    const query = `
      INSERT INTO athlete_stats (
        recorded_at,
        recent_ride_totals_count, recent_ride_totals_distance, recent_ride_totals_time,
        recent_run_totals_count, recent_run_totals_distance, recent_run_totals_time,
        ytd_ride_totals_count, ytd_ride_totals_distance,
        ytd_run_totals_count, ytd_run_totals_distance,
        all_ride_totals_count, all_ride_totals_distance,
        all_run_totals_count, all_run_totals_distance
      )
      VALUES (
        COALESCE($1, CURRENT_DATE),
        $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (recorded_at)
      DO UPDATE SET
        recent_ride_totals_count = EXCLUDED.recent_ride_totals_count,
        recent_ride_totals_distance = EXCLUDED.recent_ride_totals_distance,
        recent_ride_totals_time = EXCLUDED.recent_ride_totals_time,
        recent_run_totals_count = EXCLUDED.recent_run_totals_count,
        recent_run_totals_distance = EXCLUDED.recent_run_totals_distance,
        recent_run_totals_time = EXCLUDED.recent_run_totals_time,
        ytd_ride_totals_count = EXCLUDED.ytd_ride_totals_count,
        ytd_ride_totals_distance = EXCLUDED.ytd_ride_totals_distance,
        ytd_run_totals_count = EXCLUDED.ytd_run_totals_count,
        ytd_run_totals_distance = EXCLUDED.ytd_run_totals_distance,
        all_ride_totals_count = EXCLUDED.all_ride_totals_count,
        all_ride_totals_distance = EXCLUDED.all_ride_totals_distance,
        all_run_totals_count = EXCLUDED.all_run_totals_count,
        all_run_totals_distance = EXCLUDED.all_run_totals_distance
    `;

    await this.pool.query(query, [
      stats.recorded_at,
      stats.recent_ride_totals_count,
      stats.recent_ride_totals_distance,
      stats.recent_ride_totals_time,
      stats.recent_run_totals_count,
      stats.recent_run_totals_distance,
      stats.recent_run_totals_time,
      stats.ytd_ride_totals_count,
      stats.ytd_ride_totals_distance,
      stats.ytd_run_totals_count,
      stats.ytd_run_totals_distance,
      stats.all_ride_totals_count,
      stats.all_ride_totals_distance,
      stats.all_run_totals_count,
      stats.all_run_totals_distance,
    ]);
  }

  /**
   * Upsert gear
   */
  async upsertGear(gear: Gear): Promise<void> {
    const query = `
      INSERT INTO gear (id, name, brand_name, model_name, description, type, distance, retired)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        brand_name = EXCLUDED.brand_name,
        model_name = EXCLUDED.model_name,
        description = EXCLUDED.description,
        type = EXCLUDED.type,
        distance = EXCLUDED.distance,
        retired = EXCLUDED.retired,
        updated_at = CURRENT_TIMESTAMP
    `;

    await this.pool.query(query, [
      gear.id,
      gear.name,
      gear.brand_name,
      gear.model_name,
      gear.description,
      gear.type,
      gear.distance,
      gear.retired,
    ]);
  }

  /**
   * Get next synthetic activity id for non-Strava imports.
   * Sequence counts down from -1 to avoid collisions with Strava ids.
   */
  async getNextImportActivityId(): Promise<number> {
    const result = await this.pool.query(
      `SELECT nextval('import_activity_id_seq') AS id`
    );
    return Number(result.rows[0].id);
  }

  /**
   * Create an import run
   */
  async createImportRun(input: {
    type?: ImportType;
    status?: ImportStatus;
    source?: ImportSource;
    filesTotal?: number;
  } = {}): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO imports (type, status, source, files_total)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [
        input.type || 'single',
        input.status || 'queued',
        input.source || 'file',
        input.filesTotal || 0,
      ]
    );
    return Number(result.rows[0].id);
  }

  /**
   * Update status and counters for an import run
   */
  async updateImportRun(
    importId: number,
    updates: {
      status?: ImportStatus;
      filesTotal?: number;
      filesOk?: number;
      filesSkipped?: number;
      filesFailed?: number;
      finishedAt?: Date | null;
    }
  ): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.status) {
      values.push(updates.status);
      sets.push(`status = $${values.length}`);
    }
    if (typeof updates.filesTotal === 'number') {
      values.push(updates.filesTotal);
      sets.push(`files_total = $${values.length}`);
    }
    if (typeof updates.filesOk === 'number') {
      values.push(updates.filesOk);
      sets.push(`files_ok = $${values.length}`);
    }
    if (typeof updates.filesSkipped === 'number') {
      values.push(updates.filesSkipped);
      sets.push(`files_skipped = $${values.length}`);
    }
    if (typeof updates.filesFailed === 'number') {
      values.push(updates.filesFailed);
      sets.push(`files_failed = $${values.length}`);
    }
    if (updates.finishedAt !== undefined) {
      values.push(updates.finishedAt);
      sets.push(`finished_at = $${values.length}`);
    }

    if (sets.length === 0) return;

    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(importId);
    await this.pool.query(
      `UPDATE imports SET ${sets.join(', ')} WHERE id = $${values.length}`,
      values
    );
  }

  /**
   * Get import run by id
   */
  async getImportRunById(importId: number): Promise<ImportRun | null> {
    const result = await this.pool.query(
      `SELECT * FROM imports WHERE id = $1`,
      [importId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * List recent import runs
   */
  async listImportRuns(limit: number = 50): Promise<ImportRun[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;
    const result = await this.pool.query(
      `SELECT * FROM imports ORDER BY started_at DESC, id DESC LIMIT $1`,
      [safeLimit]
    );
    return result.rows;
  }

  /**
   * Aggregate import metrics for a time window.
   */
  async getImportMetrics(days: number = 30): Promise<ImportMetrics> {
    const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(Math.floor(days), 3650)) : 30;
    const result = await this.pool.query(
      `
      WITH windowed AS (
        SELECT
          status,
          COALESCE(files_total, 0) AS files_total,
          COALESCE(files_ok, 0) AS files_ok,
          COALESCE(files_skipped, 0) AS files_skipped,
          COALESCE(files_failed, 0) AS files_failed,
          started_at,
          finished_at,
          CASE
            WHEN finished_at IS NOT NULL THEN EXTRACT(EPOCH FROM (finished_at - started_at))
            ELSE NULL
          END AS duration_sec
        FROM imports
        WHERE started_at >= (NOW() - ($1::int * INTERVAL '1 day'))
      )
      SELECT
        COUNT(*)::int AS runs,
        COUNT(*) FILTER (WHERE status = 'done')::int AS runs_done,
        COUNT(*) FILTER (WHERE status = 'partial')::int AS runs_partial,
        COUNT(*) FILTER (WHERE status = 'error')::int AS runs_error,
        COUNT(*) FILTER (WHERE status IN ('queued', 'processing'))::int AS runs_in_progress,
        COALESCE(SUM(files_total), 0)::int AS files_total,
        COALESCE(SUM(files_ok), 0)::int AS files_ok,
        COALESCE(SUM(files_skipped), 0)::int AS files_skipped,
        COALESCE(SUM(files_failed), 0)::int AS files_failed,
        AVG(duration_sec) AS avg_duration_sec,
        MAX(started_at) AS last_run_at
      FROM windowed
      `,
      [safeDays]
    );

    const row = result.rows[0] || {};
    const filesTotal = Number(row.files_total || 0);
    const filesOk = Number(row.files_ok || 0);
    const filesSkipped = Number(row.files_skipped || 0);
    const filesFailed = Number(row.files_failed || 0);

    const successRate = filesTotal > 0 ? (filesOk + filesSkipped) / filesTotal : 0;
    const failureRate = filesTotal > 0 ? filesFailed / filesTotal : 0;
    const runs = Number(row.runs || 0);
    const avgFilesPerRun = runs > 0 ? filesTotal / runs : 0;

    return {
      windowDays: safeDays,
      runs,
      runsDone: Number(row.runs_done || 0),
      runsPartial: Number(row.runs_partial || 0),
      runsError: Number(row.runs_error || 0),
      runsInProgress: Number(row.runs_in_progress || 0),
      filesTotal,
      filesOk,
      filesSkipped,
      filesFailed,
      successRate,
      failureRate,
      avgFilesPerRun,
      avgDurationSec: row.avg_duration_sec !== null && row.avg_duration_sec !== undefined
        ? Number(row.avg_duration_sec)
        : null,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : null,
    };
  }

  /**
   * Create import file entry
   */
  async createImportFile(file: {
    import_id: number;
    path?: string | null;
    original_filename: string;
    size_bytes?: number | null;
    sha256: string;
    detected_format?: string | null;
    status?: ImportFileStatus;
  }): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO import_files (
        import_id, path, original_filename, size_bytes, sha256, detected_format, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
      `,
      [
        file.import_id,
        file.path || null,
        file.original_filename,
        file.size_bytes ?? null,
        file.sha256,
        file.detected_format || null,
        file.status || 'queued',
      ]
    );
    return Number(result.rows[0].id);
  }

  /**
   * Create one import job for async processing.
   */
  async createImportJob(input: {
    import_id: number;
    import_file_id: number;
    priority?: number;
    max_attempts?: number;
    status?: ImportJobStatus;
  }): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO import_jobs (
        import_id, import_file_id, priority, max_attempts, status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        input.import_id,
        input.import_file_id,
        input.priority ?? 100,
        input.max_attempts ?? 1,
        input.status ?? 'queued',
      ]
    );
    return Number(result.rows[0].id);
  }

  /**
   * Claim one queued import job (FIFO, skip locked) for worker processing.
   */
  async claimNextImportJob(): Promise<ImportJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${this.schema}, public`);

      const queued = await client.query(
        `
        SELECT *
        FROM import_jobs
        WHERE status = 'queued'
          AND available_at <= CURRENT_TIMESTAMP
        ORDER BY priority DESC, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
        `
      );

      if (queued.rows.length === 0) {
        await client.query('COMMIT');
        return null;
      }

      const jobId = Number(queued.rows[0].id);
      const updated = await client.query(
        `
        UPDATE import_jobs
        SET
          status = 'processing',
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          attempt_count = attempt_count + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
        `,
        [jobId]
      );

      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get import job by id.
   */
  async getImportJobById(jobId: number): Promise<ImportJob | null> {
    const result = await this.pool.query(
      `SELECT * FROM import_jobs WHERE id = $1`,
      [jobId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Mark an import job as finished successfully.
   */
  async completeImportJob(jobId: number): Promise<void> {
    await this.pool.query(
      `
      UPDATE import_jobs
      SET
        status = 'done',
        finished_at = CURRENT_TIMESTAMP,
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [jobId]
    );
  }

  /**
   * Mark an import job as failed.
   */
  async failImportJob(jobId: number, errorMessage: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE import_jobs
      SET
        status = 'failed',
        finished_at = CURRENT_TIMESTAMP,
        last_error = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [jobId, errorMessage]
    );
  }

  /**
   * Requeue an import job with delay/backoff.
   */
  async requeueImportJob(jobId: number, errorMessage: string, delayMs: number): Promise<void> {
    const safeDelay = Math.max(0, Math.floor(delayMs));
    await this.pool.query(
      `
      UPDATE import_jobs
      SET
        status = 'queued',
        available_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
        finished_at = NULL,
        last_error = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [jobId, safeDelay, errorMessage]
    );
  }

  /**
   * Get queue-level import job stats.
   */
  async getImportQueueStats(): Promise<ImportQueueStats> {
    const result = await this.pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
        COUNT(*) FILTER (WHERE status = 'queued' AND available_at <= CURRENT_TIMESTAMP)::int AS ready,
        COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'failed' AND finished_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::int AS failed_last_24h,
        COUNT(*) FILTER (WHERE status = 'done' AND finished_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour')::int AS done_last_hour,
        MIN(available_at) FILTER (WHERE status = 'queued') AS next_available_at
      FROM import_jobs
      `
    );

    const row = result.rows[0] || {};
    return {
      queued: Number(row.queued || 0),
      ready: Number(row.ready || 0),
      processing: Number(row.processing || 0),
      done: Number(row.done || 0),
      failed: Number(row.failed || 0),
      failedLast24h: Number(row.failed_last_24h || 0),
      doneLastHour: Number(row.done_last_hour || 0),
      nextAvailableAt: row.next_available_at ? new Date(row.next_available_at) : null,
    };
  }

  /**
   * List failed import jobs for DLQ-style inspection.
   */
  async listFailedImportJobs(limit: number = 50, importId?: number): Promise<ImportFailedJobRecord[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 50;
    const result = await this.pool.query(
      `
      SELECT
        j.id,
        j.import_id,
        j.import_file_id,
        j.status,
        j.attempt_count,
        j.max_attempts,
        j.priority,
        j.available_at,
        j.started_at,
        j.finished_at,
        j.last_error,
        f.original_filename,
        f.detected_format,
        f.status AS file_status,
        i.status AS import_status
      FROM import_jobs j
      JOIN import_files f ON f.id = j.import_file_id
      JOIN imports i ON i.id = j.import_id
      WHERE j.status = 'failed'
        AND ($2::bigint IS NULL OR j.import_id = $2)
      ORDER BY j.finished_at DESC NULLS LAST, j.id DESC
      LIMIT $1
      `,
      [safeLimit, importId ?? null]
    );
    return result.rows;
  }

  /**
   * Manually requeue a failed import job.
   * Resets attempts to allow a fresh retry window.
   */
  async requeueFailedImportJob(jobId: number, delayMs: number = 0): Promise<ImportJob | null> {
    const safeDelay = Math.max(0, Math.floor(delayMs));
    const result = await this.pool.query(
      `
      UPDATE import_jobs
      SET
        status = 'queued',
        attempt_count = 0,
        available_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
        started_at = NULL,
        finished_at = NULL,
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND status = 'failed'
      RETURNING *
      `,
      [jobId, safeDelay]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Delete one failed import queue job (DLQ cleanup).
   */
  async deleteFailedImportJob(jobId: number): Promise<ImportJob | null> {
    const result = await this.pool.query(
      `
      DELETE FROM import_jobs
      WHERE id = $1
        AND status = 'failed'
      RETURNING *
      `,
      [jobId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Delete failed import queue jobs in bulk (most recent first, optional import filter).
   */
  async deleteFailedImportJobs(limit: number = 50, importId?: number): Promise<ImportJob[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 50;
    const result = await this.pool.query(
      `
      DELETE FROM import_jobs j
      WHERE j.id IN (
        SELECT j2.id
        FROM import_jobs j2
        WHERE j2.status = 'failed'
          AND ($2::bigint IS NULL OR j2.import_id = $2)
        ORDER BY j2.finished_at DESC NULLS LAST, j2.id DESC
        LIMIT $1
      )
      RETURNING *
      `,
      [safeLimit, importId ?? null]
    );
    return result.rows;
  }

  /**
   * Update status fields for an import file
   */
  async updateImportFile(
    importFileId: number,
    updates: {
      status?: ImportFileStatus;
      errorMessage?: string | null;
      activityId?: number | null;
      detectedFormat?: string | null;
      path?: string | null;
      sizeBytes?: number | null;
    }
  ): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.status) {
      values.push(updates.status);
      sets.push(`status = $${values.length}`);
    }
    if (updates.errorMessage !== undefined) {
      values.push(updates.errorMessage);
      sets.push(`error_message = $${values.length}`);
    }
    if (updates.activityId !== undefined) {
      values.push(updates.activityId);
      sets.push(`activity_id = $${values.length}`);
    }
    if (updates.detectedFormat !== undefined) {
      values.push(updates.detectedFormat);
      sets.push(`detected_format = $${values.length}`);
    }
    if (updates.path !== undefined) {
      values.push(updates.path);
      sets.push(`path = $${values.length}`);
    }
    if (updates.sizeBytes !== undefined) {
      values.push(updates.sizeBytes);
      sets.push(`size_bytes = $${values.length}`);
    }

    if (sets.length === 0) return;

    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(importFileId);
    await this.pool.query(
      `UPDATE import_files SET ${sets.join(', ')} WHERE id = $${values.length}`,
      values
    );
  }

  /**
   * Get import file by sha256 (used for file-level dedupe)
   */
  async getImportFileBySha256(sha256: string): Promise<ImportFileRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM import_files WHERE sha256 = $1`,
      [sha256]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get import file by id.
   */
  async getImportFileById(importFileId: number): Promise<ImportFileRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM import_files WHERE id = $1`,
      [importFileId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * List files for one import run
   */
  async getImportFiles(importId: number): Promise<ImportFileRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM import_files WHERE import_id = $1 ORDER BY id ASC`,
      [importId]
    );
    return result.rows;
  }

  /**
   * Find existing activity by import fingerprint.
   */
  async getActivityByFingerprint(fingerprint: string): Promise<Activity | null> {
    const result = await this.pool.query(
      `SELECT * FROM activities WHERE fingerprint = $1 LIMIT 1`,
      [fingerprint]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Start a sync log
   */
  async startSyncLog(): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO sync_log (status) VALUES ('running') RETURNING id`
    );
    return result.rows[0].id;
  }

  /**
   * Complete a sync log
   */
  async completeSyncLog(
    id: number,
    itemsProcessed: number,
    error?: string,
    message?: string
  ): Promise<void> {
    const status = error ? 'failed' : 'completed';
    const logMessage = error || message || null;
    await this.pool.query(
      `UPDATE sync_log
       SET completed_at = CURRENT_TIMESTAMP, status = $1, items_processed = $2, error_message = $3
       WHERE id = $4`,
      [status, itemsProcessed, logMessage, id]
    );
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<any> {
    const totals = await this.pool.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(distance) / 1000, 0) as total_km,
        COALESCE(SUM(moving_time) / 3600.0, 0) as total_hours,
        COALESCE(SUM(total_elevation_gain), 0) as total_elevation
      FROM activities
    `);

    const activityTypes = await this.pool.query(`
      SELECT type, COUNT(*) as count, SUM(distance) / 1000 as total_km
      FROM activities
      GROUP BY type
      ORDER BY count DESC
    `);

    return {
      total_activities: parseInt(totals.rows[0].count),
      total_distance_km: parseFloat(totals.rows[0].total_km || 0).toFixed(2),
      total_time_hours: parseFloat(totals.rows[0].total_hours || 0),
      total_elevation_m: parseFloat(totals.rows[0].total_elevation || 0),
      by_type: activityTypes.rows,
    };
  }

  /**
   * Insert or update activity photo
   */
  async upsertActivityPhoto(photo: ActivityPhoto): Promise<void> {
    const query = `
      INSERT INTO activity_photos (
        activity_id, unique_id, caption, source,
        url_small, url_medium, url_large, local_path, is_primary, location, uploaded_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (unique_id)
      DO UPDATE SET
        caption = EXCLUDED.caption,
        url_small = EXCLUDED.url_small,
        url_medium = EXCLUDED.url_medium,
        url_large = EXCLUDED.url_large,
        local_path = COALESCE(EXCLUDED.local_path, activity_photos.local_path),
        is_primary = EXCLUDED.is_primary,
        location = EXCLUDED.location,
        uploaded_at = EXCLUDED.uploaded_at
    `;

    await this.pool.query(query, [
      photo.activity_id,
      photo.unique_id,
      photo.caption,
      photo.source,
      photo.url_small,
      photo.url_medium,
      photo.url_large,
      photo.local_path,
      photo.is_primary,
      photo.location ? JSON.stringify(photo.location) : null,
      photo.uploaded_at,
    ]);
  }

  /**
   * Get photos for an activity
   */
  async getActivityPhotos(activityId: number): Promise<ActivityPhoto[]> {
    const result = await this.pool.query(
      'SELECT * FROM activity_photos WHERE activity_id = $1 ORDER BY is_primary DESC, uploaded_at ASC',
      [activityId]
    );
    return result.rows;
  }

  /**
   * Get primary photo for an activity
   */
  async getActivityPrimaryPhoto(activityId: number): Promise<ActivityPhoto | null> {
    const result = await this.pool.query(
      'SELECT * FROM activity_photos WHERE activity_id = $1 AND is_primary = true LIMIT 1',
      [activityId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update local path for a photo
   */
  async updatePhotoLocalPath(uniqueId: string, localPath: string): Promise<void> {
    await this.pool.query(
      'UPDATE activity_photos SET local_path = $1 WHERE unique_id = $2',
      [localPath, uniqueId]
    );
  }

  /**
   * Get photos that need to be downloaded (no local_path)
   */
  async getPhotosWithoutLocalPath(limit: number = 100): Promise<ActivityPhoto[]> {
    const result = await this.pool.query(
      `SELECT * FROM activity_photos
       WHERE local_path IS NULL AND url_medium IS NOT NULL
       ORDER BY activity_id DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Close database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default DatabaseService;
