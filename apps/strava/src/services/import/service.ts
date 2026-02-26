import * as path from 'path';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import AdmZip from 'adm-zip';
import DatabaseService from '../database';
import { decodeImportBufferIfNeeded, detectImportFormat, isSupportedImportFilename } from './detector';
import { sha256Hex } from './hash';
import { parseActivity } from './parser';
import { normalizeSportType } from './parsers/utils';
import { rebuildLocalClimbsForActivity } from '../localSegments';
import { ActivityImportFormat, ImportFormat, ParsedActivity } from './types';
import type { ImportFileRecord, ImportSource, ImportStatus, ImportType } from '../database';

export interface UploadedImportFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface SingleImportResult {
  importId: number;
  importFileId?: number;
  status: 'done' | 'duplicate' | 'failed';
  detectedFormat?: ImportFormat;
  sha256: string;
  activityId?: number;
  message: string;
}

export interface BatchImportFileResult {
  originalFilename: string;
  status: 'done' | 'duplicate' | 'failed';
  importFileId?: number;
  detectedFormat?: ImportFormat;
  sha256: string;
  activityId?: number;
  message: string;
}

export interface BatchImportResult {
  importId: number;
  status: 'done' | 'partial' | 'error';
  filesTotal: number;
  filesOk: number;
  filesSkipped: number;
  filesFailed: number;
  files: BatchImportFileResult[];
}

export interface RetryFailedResult extends BatchImportResult {}
export interface QueuedSingleImportResult {
  importId: number;
  importFileId?: number;
  status: 'queued' | 'done' | 'duplicate' | 'failed';
  detectedFormat?: ImportFormat;
  sha256: string;
  activityId?: number;
  message: string;
}

export interface QueuedBatchFileResult {
  originalFilename: string;
  status: 'queued' | 'done' | 'duplicate' | 'failed';
  importFileId?: number;
  detectedFormat?: ImportFormat;
  sha256: string;
  activityId?: number;
  message: string;
}

export interface QueuedBatchImportResult {
  importId: number;
  status: 'queued' | 'done' | 'partial' | 'error';
  filesTotal: number;
  filesOk: number;
  filesSkipped: number;
  filesFailed: number;
  files: QueuedBatchFileResult[];
}

export interface ImportQueueWorkerStatus {
  enabled: boolean;
  running: boolean;
  pollMs: number;
  concurrency: number;
  activeWorkers: number;
  lastTickStartedAt: string | null;
  lastTickFinishedAt: string | null;
  lastError: string | null;
  stale: boolean;
  staleAfterMs: number;
}

export interface ImportQueueAlert {
  code: string;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

export interface ImportRunCompletedEvent {
  importId: number;
  status: ImportStatus;
  filesTotal: number;
  filesOk: number;
  filesSkipped: number;
  filesFailed: number;
}

type ImportRunCompletedHook = (event: ImportRunCompletedEvent) => void | Promise<void>;
const importRunCompletedHooks = new Set<ImportRunCompletedHook>();

export const registerImportRunCompletedHook = (hook: ImportRunCompletedHook): (() => void) => {
  importRunCompletedHooks.add(hook);
  return () => importRunCompletedHooks.delete(hook);
};

const IMPORT_STORAGE_ROOT = process.env.IMPORT_STORAGE_PATH
  || path.join(process.cwd(), 'storage', 'imports');
const PHOTO_STORAGE_ROOT = process.env.PHOTO_STORAGE_PATH
  || path.join(process.cwd(), 'photos');
const STRAVA_EXPORT_MEDIA_STAGING_DIR = path.join(PHOTO_STORAGE_ROOT, '_strava_export_staging');
const ZIP_MAX_ENTRIES = Math.max(1, Number(process.env.IMPORT_ZIP_MAX_ENTRIES || 500));
const STRAVA_EXPORT_ZIP_MAX_ENTRIES = Math.max(
  ZIP_MAX_ENTRIES,
  Number(process.env.IMPORT_STRAVA_EXPORT_ZIP_MAX_ENTRIES || 20000)
);
const ZIP_MAX_TOTAL_BYTES = Math.max(1024 * 1024, Number(process.env.IMPORT_ZIP_MAX_TOTAL_BYTES || (300 * 1024 * 1024)));
const STRAVA_EXPORT_ZIP_MAX_TOTAL_BYTES = Math.max(
  ZIP_MAX_TOTAL_BYTES,
  Number(process.env.IMPORT_STRAVA_EXPORT_ZIP_MAX_TOTAL_BYTES || (5 * 1024 * 1024 * 1024))
);
const SUPPORTED_IMPORT_FORMATS_LABEL = '.fit, .fit.gz, .gpx, .gpx.gz, .tcx, .tcx.gz, .csv';
const queueWorkerEnabled = ['1', 'true', 'yes', 'on']
  .includes(String(process.env.IMPORT_QUEUE_ENABLED || 'true').trim().toLowerCase());
const queuePollMs = Math.max(250, Number(process.env.IMPORT_QUEUE_POLL_MS || 2000));
const queueConcurrency = Math.max(1, Math.min(8, Number(process.env.IMPORT_QUEUE_CONCURRENCY || 2)));
const queueMaxAttempts = Math.max(1, Math.min(20, Number(process.env.IMPORT_QUEUE_MAX_ATTEMPTS || 3)));
const queueRetryBaseMs = Math.max(250, Number(process.env.IMPORT_QUEUE_RETRY_BASE_MS || 5000));
const queueRetryMaxMs = Math.max(queueRetryBaseMs, Number(process.env.IMPORT_QUEUE_RETRY_MAX_MS || 300000));
const queueHealthStaleMs = Math.max(2000, Number(process.env.IMPORT_QUEUE_HEALTH_STALE_MS || (queuePollMs * 6)));
const queueAlertFailed24hThreshold = Math.max(1, Number(process.env.IMPORT_QUEUE_ALERT_FAILED_24H || 5));
const queueAlertReadyThreshold = Math.max(1, Number(process.env.IMPORT_QUEUE_ALERT_READY || 20));
const queueAlertWebhookUrl = String(process.env.IMPORT_QUEUE_ALERT_WEBHOOK_URL || '').trim();
const queueAlertMonitorEnabled = ['1', 'true', 'yes', 'on']
  .includes(String(process.env.IMPORT_QUEUE_ALERT_MONITOR_ENABLED || 'true').trim().toLowerCase());
const queueAlertPollMs = Math.max(5000, Number(process.env.IMPORT_QUEUE_ALERT_POLL_MS || 30000));
const queueAlertCooldownMs = Math.max(1000, Number(process.env.IMPORT_QUEUE_ALERT_COOLDOWN_MS || 300000));
const PRIORITY_SINGLE = 120;
const PRIORITY_BATCH = 100;
const PRIORITY_WATCHFOLDER = 80;

const sanitizeFilename = (filename: string): string => {
  const trimmed = (filename || '').trim();
  const fallback = 'imported-file';
  return (trimmed || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);
};

const toBatchResultStatus = (counts: { ok: number; skipped: number; failed: number }): 'done' | 'partial' | 'error' => {
  if (counts.failed > 0 && counts.ok === 0 && counts.skipped === 0) return 'error';
  if (counts.failed > 0) return 'partial';
  return 'done';
};

const FIT_SKIPPABLE_MAX_BYTES = Math.max(512, Number(process.env.IMPORT_FIT_SKIPPABLE_MAX_BYTES || 2048));
const STRAVA_NAME_HINT_SOURCE = 'strava_activities_csv';
const STRAVA_GEAR_HINT_SOURCE = 'strava_activities_csv';
const STRAVA_EXPORT_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const isCsvLikeFilename = (filename: string): boolean => {
  const lower = String(filename || '').toLowerCase();
  return lower.endsWith('.csv') || lower.endsWith('.csv.gz');
};

const isStravaActivitiesCsvFilename = (filename: string): boolean => {
  const base = path.basename(String(filename || '').replace(/\\/g, '/')).toLowerCase();
  return base === 'activities.csv' || base === 'activities.csv.gz';
};

const isRelevantZipImportEntry = (entryName: string): boolean => {
  if (!isSupportedImportFilename(entryName || '')) return false;
  if (isCsvLikeFilename(entryName) && !isStravaActivitiesCsvFilename(entryName)) {
    return false;
  }
  return true;
};

const isStravaExportMediaEntry = (entryName: string): boolean => {
  const raw = String(entryName || '').replace(/\\/g, '/');
  const archiveRelative = raw.includes('::') ? raw.split('::').slice(1).join('::') : raw;
  const normalized = archiveRelative.toLowerCase();
  if (!normalized.includes('/media/') && !normalized.startsWith('media/')) return false;
  const ext = path.extname(normalized);
  return STRAVA_EXPORT_IMAGE_EXTENSIONS.has(ext);
};

const isRelevantStravaExportZipEntry = (
  entryName: string,
  options?: { includeMedia?: boolean }
): boolean => {
  if (isRelevantZipImportEntry(entryName)) return true;
  if (options?.includeMedia && isStravaExportMediaEntry(entryName)) return true;
  return false;
};

const normalizeCsvHeader = (value: string): string => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
);

const normalizeGearName = (value: string): string => String(value || '').trim().replace(/\s+/g, ' ');

const buildStravaGearId = (type: 'bike' | 'shoes', name: string): string => {
  const normalized = normalizeGearName(name).toLowerCase();
  const hash = createHash('sha1').update(`${type}:${normalized}`).digest('hex').slice(0, 16);
  return `${type === 'bike' ? 'sb' : 'ss'}_${hash}`;
};

const normalizeImportedFilenameStem = (filename: string): string => {
  const withUnixSeparators = String(filename || '')
    .replace(/\\/g, '/')
    .split('::')
    .pop()
    || '';
  const base = path.basename(withUnixSeparators).toLowerCase();
  const withoutGz = base.endsWith('.gz') ? base.slice(0, -3) : base;
  return withoutGz.replace(/\.(fit|gpx|tcx|csv)$/i, '');
};

const extractExternalActivityIdFromFilename = (filename: string): string | null => {
  const stem = normalizeImportedFilenameStem(filename);
  const match = stem.match(/(\d{5,})/);
  return match ? match[1] : null;
};

const extractExternalActivityIdFromMediaPath = (entryName: string): string | null => {
  const normalized = String(entryName || '').replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    const segment = segments[i];
    if (/^\d{5,}$/.test(segment)) return segment;
  }
  return extractExternalActivityIdFromFilename(normalized);
};

const parseCsvRow = (line: string, delimiter: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      cells.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
};

type StravaActivitiesCsvBundle = {
  nameHints: Map<string, string>;
  bikeNames: Set<string>;
  shoeNames: Set<string>;
  gearHintsByExternalId: Map<string, string>;
};

const parseStravaActivitiesCsvBundle = (buffer: Buffer): StravaActivitiesCsvBundle => {
  const raw = decodeImportBufferIfNeeded('activities.csv', buffer);
  const text = raw.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error('CSV parse error: file has no data rows');
  }

  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  const header = parseCsvRow(headerLine, delimiter).map(normalizeCsvHeader);
  const idIndex = header.findIndex((value) => value === 'aktivitatsid' || value === 'activityid');
  const nameIndex = header.findIndex((value) => value === 'namederaktivitat' || value === 'activityname');
  const filenameIndex = header.findIndex((value) => value === 'dateiname' || value === 'filename');
  const bikeIndex = header.findIndex((value) => value === 'fahrrad' || value === 'bike' || value === 'bicycle');
  const gearIndex = header.findIndex((value) => (
    value === 'ausrustung'
    || value === 'gear'
    || value === 'activitygear'
    || value === 'aktivitatsausrustung'
    || value === 'shoe'
    || value === 'shoes'
  ));

  if (nameIndex < 0 || (idIndex < 0 && filenameIndex < 0)) {
    throw new Error('CSV parse error: unsupported Strava activities.csv header');
  }

  const hints = new Map<string, string>();
  const bikeNames = new Set<string>();
  const shoeNames = new Set<string>();
  const gearHintsByExternalId = new Map<string, string>();
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvRow(lines[i], delimiter);
    const activityName = String(cells[nameIndex] || '').trim();
    const externalId = idIndex >= 0
      ? String(cells[idIndex] || '').trim().replace(/\D+/g, '')
      : '';
    const bikeName = bikeIndex >= 0 ? normalizeGearName(String(cells[bikeIndex] || '')) : '';
    const gearName = gearIndex >= 0 ? normalizeGearName(String(cells[gearIndex] || '')) : '';

    if (bikeName) bikeNames.add(bikeName);
    if (gearName) shoeNames.add(gearName);

    if (externalId) {
      const chosen = bikeName || gearName;
      if (chosen) {
        const gearType = bikeName ? 'bike' : 'shoes';
        const gearId = buildStravaGearId(gearType, chosen);
        gearHintsByExternalId.set(externalId, gearId);
      }
    }

    if (!activityName) continue;

    if (idIndex >= 0) {
      if (externalId) hints.set(`id:${externalId}`, activityName);
    }

    if (filenameIndex >= 0) {
      const stem = normalizeImportedFilenameStem(String(cells[filenameIndex] || ''));
      if (stem) hints.set(`file:${stem}`, activityName);
    }
  }

  if (!hints.size) {
    throw new Error('CSV parse error: no activity name mappings found');
  }

  return {
    nameHints: hints,
    bikeNames,
    shoeNames,
    gearHintsByExternalId,
  };
};

const upsertImportNameHints = async (
  db: DatabaseService,
  hints: Map<string, string>
): Promise<number> => {
  let upserted = 0;
  for (const [hintKey, activityName] of hints.entries()) {
    await db.query(
      `
      INSERT INTO import_activity_name_hints (hint_key, activity_name, source)
      VALUES ($1, $2, $3)
      ON CONFLICT (hint_key)
      DO UPDATE SET
        activity_name = EXCLUDED.activity_name,
        source = EXCLUDED.source,
        updated_at = CURRENT_TIMESTAMP
      `,
      [hintKey, activityName, STRAVA_NAME_HINT_SOURCE]
    );
    upserted += 1;
  }
  return upserted;
};

const upsertImportGearHints = async (
  db: DatabaseService,
  hintsByExternalId: Map<string, string>
): Promise<number> => {
  let upserted = 0;
  for (const [externalId, gearId] of hintsByExternalId.entries()) {
    await db.query(
      `
      INSERT INTO import_activity_gear_hints (external_id, gear_id, source)
      VALUES ($1, $2, $3)
      ON CONFLICT (external_id)
      DO UPDATE SET
        gear_id = EXCLUDED.gear_id,
        source = EXCLUDED.source,
        updated_at = CURRENT_TIMESTAMP
      `,
      [externalId, gearId, STRAVA_GEAR_HINT_SOURCE]
    );
    upserted += 1;
  }
  return upserted;
};

const upsertStravaExportGearCatalog = async (
  db: DatabaseService,
  bundle: StravaActivitiesCsvBundle
): Promise<number> => {
  let upserted = 0;
  for (const name of bundle.bikeNames) {
    await db.upsertGear({
      id: buildStravaGearId('bike', name),
      name,
      type: 'bike',
      description: 'Imported from Strava export (activities.csv)',
      retired: false,
    });
    upserted += 1;
  }
  for (const name of bundle.shoeNames) {
    await db.upsertGear({
      id: buildStravaGearId('shoes', name),
      name,
      type: 'shoes',
      description: 'Imported from Strava export (activities.csv)',
      retired: false,
    });
    upserted += 1;
  }
  return upserted;
};

const backfillMissingExternalIdsFromImportFiles = async (db: DatabaseService): Promise<number> => {
  const result = await db.query(
    `
    SELECT DISTINCT ON (f.activity_id)
      f.activity_id,
      f.original_filename
    FROM import_files f
    JOIN activities a ON a.strava_activity_id = f.activity_id
    WHERE f.activity_id IS NOT NULL
      AND a.source = 'file'
      AND COALESCE(a.external_id, '') = ''
    ORDER BY f.activity_id, f.id DESC
    `
  );

  let updated = 0;
  for (const row of result.rows) {
    const activityId = Number(row.activity_id);
    const externalId = extractExternalActivityIdFromFilename(String(row.original_filename || ''));
    if (!externalId) continue;
    const updateResult = await db.query(
      `
      UPDATE activities
      SET external_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE strava_activity_id = $2
        AND source = 'file'
        AND COALESCE(external_id, '') = ''
      `,
      [externalId, activityId]
    );
    updated += Number(updateResult.rowCount || 0);
  }

  return updated;
};

const applyNameHintsToActivities = async (
  db: DatabaseService,
  hints: Map<string, string>
): Promise<number> => {
  const byExternalId: Array<[string, string]> = [];
  for (const [key, value] of hints.entries()) {
    if (!key.startsWith('id:')) continue;
    byExternalId.push([key.slice(3), value]);
  }
  if (!byExternalId.length) return 0;

  let renamed = 0;
  const chunkSize = 250;
  for (let offset = 0; offset < byExternalId.length; offset += chunkSize) {
    const chunk = byExternalId.slice(offset, offset + chunkSize);
    const params: string[] = [];
    const values: Array<string> = [];
    chunk.forEach(([externalId, activityName], index) => {
      const first = index * 2 + 1;
      params.push(`($${first}, $${first + 1})`);
      values.push(externalId, activityName);
    });

    const updateResult = await db.query(
      `
      UPDATE activities a
      SET name = v.activity_name, updated_at = CURRENT_TIMESTAMP
      FROM (VALUES ${params.join(', ')}) AS v(external_id, activity_name)
      WHERE a.source = 'file'
        AND a.external_id = v.external_id
      `,
      values
    );
    renamed += Number(updateResult.rowCount || 0);
  }

  return renamed;
};

const applyGearHintsToActivities = async (db: DatabaseService): Promise<number> => {
  const result = await db.query(
    `
    UPDATE activities a
    SET gear_id = h.gear_id, updated_at = CURRENT_TIMESTAMP
    FROM import_activity_gear_hints h
    WHERE a.source = 'file'
      AND a.external_id = h.external_id
      AND (a.gear_id IS DISTINCT FROM h.gear_id)
    `
  );
  return Number(result.rowCount || 0);
};

const applyStravaActivitiesCsvHints = async (
  db: DatabaseService,
  buffer: Buffer
): Promise<{
  hintsUpserted: number;
  externalBackfilled: number;
  renamedActivities: number;
  gearCreated: number;
  gearHintsUpserted: number;
  gearAssigned: number;
}> => {
  const bundle = parseStravaActivitiesCsvBundle(buffer);
  const [hintsUpserted, gearCreated, externalBackfilled] = await Promise.all([
    upsertImportNameHints(db, bundle.nameHints),
    upsertStravaExportGearCatalog(db, bundle),
    backfillMissingExternalIdsFromImportFiles(db),
  ]);
  const gearHintsUpserted = await upsertImportGearHints(db, bundle.gearHintsByExternalId);
  const renamedActivities = await applyNameHintsToActivities(db, bundle.nameHints);
  const gearAssigned = await applyGearHintsToActivities(db);
  return {
    hintsUpserted,
    externalBackfilled,
    renamedActivities,
    gearCreated,
    gearHintsUpserted,
    gearAssigned,
  };
};

const processStravaActivitiesCsvFile = async (
  db: DatabaseService,
  importId: number,
  file: UploadedImportFile,
  storageMode: 'sync' | 'queue',
  options?: {
    existingImportFileId?: number;
    sha256Override?: string;
    path?: string | null;
  }
): Promise<BatchImportFileResult> => {
  let hintsUpserted = 0;
  let externalBackfilled = 0;
  let renamedActivities = 0;
  let gearCreated = 0;
  let gearHintsUpserted = 0;
  let gearAssigned = 0;
  try {
    const applied = await applyStravaActivitiesCsvHints(db, file.buffer);
    hintsUpserted = applied.hintsUpserted;
    externalBackfilled = applied.externalBackfilled;
    renamedActivities = applied.renamedActivities;
    gearCreated = applied.gearCreated;
    gearHintsUpserted = applied.gearHintsUpserted;
    gearAssigned = applied.gearAssigned;
  } catch (error: any) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    const missingHintTable = code === '42P01' && (
      message.includes('import_activity_name_hints') || message.includes('import_activity_gear_hints')
    );
    if (missingHintTable) {
      throw new Error('CSV import requires latest DB migrations for import hint tables');
    }
    throw error;
  }
  const markerSha = options?.sha256Override || sha256Hex(
    Buffer.from(`${sha256Hex(file.buffer)}:${importId}:${file.originalname}:${Date.now()}:name-hints`)
  );

  let importFileId = options?.existingImportFileId;
  if (importFileId) {
    await db.updateImportFile(importFileId, {
      status: 'ok',
      errorMessage: null,
      detectedFormat: 'csv',
    });
  } else {
    importFileId = await db.createImportFile({
      import_id: importId,
      original_filename: file.originalname,
      path: options?.path || null,
      size_bytes: file.size,
      sha256: markerSha,
      detected_format: 'csv',
      status: 'ok',
    });
  }

  const queueNote = storageMode === 'queue' ? ' (applied before queue processing)' : '';
  return {
    originalFilename: file.originalname,
    status: 'done',
    importFileId,
    detectedFormat: 'csv',
    sha256: markerSha,
    message: `Imported ${hintsUpserted} name hints, ${gearHintsUpserted} gear hints, created/updated ${gearCreated} gear entries, backfilled ${externalBackfilled} external IDs, renamed ${renamedActivities} activities, assigned gear on ${gearAssigned} activities${queueNote}`,
  };
};

const resolveImportNameHint = async (
  db: DatabaseService,
  input: { filename: string; externalId?: string | null }
): Promise<string | null> => {
  const keys: string[] = [];
  const byId = String(input.externalId || '').trim();
  if (byId) keys.push(`id:${byId}`);

  const stem = normalizeImportedFilenameStem(input.filename);
  if (stem) keys.push(`file:${stem}`);
  if (!keys.length) return null;

  let result: { rows: any[] };
  try {
    result = await db.query(
      `
      SELECT hint_key, activity_name
      FROM import_activity_name_hints
      WHERE hint_key = ANY($1::text[])
      `,
      [keys]
    );
  } catch (error: any) {
    // Keep imports functional on instances where migrations were not applied yet.
    if (error?.code === '42P01') {
      return null;
    }
    throw error;
  }

  if (!result.rows.length) return null;
  const byKey = new Map<string, string>();
  for (const row of result.rows) {
    byKey.set(String(row.hint_key), String(row.activity_name));
  }

  for (const key of keys) {
    const value = byKey.get(key);
    if (value) return value;
  }
  return null;
};

const resolveImportGearHint = async (
  db: DatabaseService,
  externalId?: string | null
): Promise<string | null> => {
  const key = String(externalId || '').trim();
  if (!key) return null;

  try {
    const result = await db.query(
      `
      SELECT gear_id
      FROM import_activity_gear_hints
      WHERE external_id = $1
      LIMIT 1
      `,
      [key]
    );
    return result.rows.length ? String(result.rows[0].gear_id) : null;
  } catch (error: any) {
    if (error?.code === '42P01') return null;
    throw error;
  }
};

const sanitizeMediaFilename = (filename: string): string => {
  const base = path.basename(String(filename || 'media'));
  return base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').slice(0, 180) || 'media';
};

const getImportedActivityIdByExternalId = async (
  db: DatabaseService,
  externalId: string
): Promise<number | null> => {
  const result = await db.query(
    `
    SELECT strava_activity_id
    FROM activities
    WHERE source = 'file'
      AND external_id = $1
    ORDER BY updated_at DESC, start_date DESC
    LIMIT 1
    `,
    [externalId]
  );
  if (!result.rows.length) return null;
  return Number(result.rows[0].strava_activity_id);
};

const refreshActivityPhotoCount = async (db: DatabaseService, activityId: number): Promise<void> => {
  const countResult = await db.query(
    'SELECT COUNT(*)::int AS count FROM activity_photos WHERE activity_id = $1',
    [activityId]
  );
  const count = Number(countResult.rows[0]?.count || 0);
  await db.query(
    'UPDATE activities SET photo_count = $1, updated_at = CURRENT_TIMESTAMP WHERE strava_activity_id = $2',
    [count, activityId]
  );
};

const attachStravaExportMediaToActivity = async (
  db: DatabaseService,
  activityId: number,
  file: UploadedImportFile,
  externalId: string
): Promise<void> => {
  const contentHash = sha256Hex(file.buffer);
  const safeName = sanitizeMediaFilename(file.originalname);
  const finalFilename = `${contentHash.slice(0, 12)}-${safeName}`;
  const activityDir = path.join(PHOTO_STORAGE_ROOT, String(activityId));
  await fs.mkdir(activityDir, { recursive: true });
  const absolutePath = path.join(activityDir, finalFilename);
  await fs.writeFile(absolutePath, file.buffer);
  const relativePath = `${activityId}/${finalFilename}`.replace(/\\/g, '/');

  const existingPrimary = await db.getActivityPrimaryPhoto(activityId);
  const uniqueId = `strava_export_${externalId}_${contentHash.slice(0, 24)}`;
  await db.upsertActivityPhoto({
    activity_id: activityId,
    unique_id: uniqueId,
    caption: 'Imported from Strava export',
    source: 1,
    local_path: relativePath,
    is_primary: !existingPrimary,
    uploaded_at: new Date(),
  });
  await refreshActivityPhotoCount(db, activityId);
};

const stageStravaExportMediaForExternalId = async (
  file: UploadedImportFile,
  externalId: string
): Promise<string> => {
  const dir = path.join(STRAVA_EXPORT_MEDIA_STAGING_DIR, externalId);
  await fs.mkdir(dir, { recursive: true });
  const contentHash = sha256Hex(file.buffer);
  const safeName = sanitizeMediaFilename(file.originalname);
  const filename = `${contentHash.slice(0, 12)}-${safeName}`;
  const absolute = path.join(dir, filename);
  await fs.writeFile(absolute, file.buffer);
  return absolute;
};

const attachStagedStravaExportMediaForActivity = async (
  db: DatabaseService,
  activityId: number,
  externalId?: string | null
): Promise<number> => {
  const key = String(externalId || '').trim();
  if (!key) return 0;
  const dir = path.join(STRAVA_EXPORT_MEDIA_STAGING_DIR, key);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return 0;
  }

  const files = names.sort();
  let attached = 0;
  for (const name of files) {
    const absolute = path.join(dir, name);
    try {
      const stat = await fs.stat(absolute);
      if (!stat.isFile()) continue;
      const buffer = await fs.readFile(absolute);
      await attachStravaExportMediaToActivity(db, activityId, {
        originalname: name,
        buffer,
        size: buffer.length,
      }, key);
      await fs.unlink(absolute).catch(() => undefined);
      attached += 1;
    } catch {
      // keep broken staging file for manual inspection
    }
  }
  try {
    const remaining = await fs.readdir(dir);
    if (!remaining.length) {
      await fs.rmdir(dir).catch(() => undefined);
    }
  } catch {
    // ignore cleanup errors
  }
  return attached;
};

const processStravaExportMediaFile = async (
  db: DatabaseService,
  importId: number,
  file: UploadedImportFile
): Promise<BatchImportFileResult> => {
  const sha256 = sha256Hex(file.buffer);
  const externalId = extractExternalActivityIdFromMediaPath(file.originalname);
  let importFileId: number | undefined;

  try {
    const existingFile = await db.getImportFileBySha256(sha256);
    if (existingFile) {
      const markerSha = sha256Hex(
        Buffer.from(`${sha256}:${importId}:${file.originalname}:${Date.now()}:media-duplicate`)
      );
      importFileId = await db.createImportFile({
        import_id: importId,
        original_filename: file.originalname,
        size_bytes: file.size,
        sha256: markerSha,
        detected_format: null,
        status: 'skipped_duplicate',
      });
      if (existingFile.activity_id) {
        await db.updateImportFile(importFileId, {
          activityId: existingFile.activity_id,
        });
      }
      return {
        originalFilename: file.originalname,
        status: 'duplicate',
        importFileId,
        sha256,
        activityId: existingFile.activity_id ?? undefined,
        message: 'Media file already imported (sha256 duplicate)',
      };
    }

    importFileId = await db.createImportFile({
      import_id: importId,
      original_filename: file.originalname,
      size_bytes: file.size,
      sha256,
      detected_format: null,
      status: 'processing',
    });

    if (!externalId) {
      throw new Error('Media import skipped: could not derive Strava activity ID from media path');
    }

    const activityId = await getImportedActivityIdByExternalId(db, externalId);
    if (activityId) {
      await attachStravaExportMediaToActivity(db, activityId, file, externalId);
      await db.updateImportFile(importFileId, {
        status: 'ok',
        activityId,
        errorMessage: null,
      });
      return {
        originalFilename: file.originalname,
        status: 'done',
        importFileId,
        sha256,
        activityId,
        message: 'Media attached to imported activity',
      };
    }

    await stageStravaExportMediaForExternalId(file, externalId);
    await db.updateImportFile(importFileId, {
      status: 'ok',
      errorMessage: null,
    });
    return {
      originalFilename: file.originalname,
      status: 'done',
      importFileId,
      sha256,
      message: `Media staged for activity ${externalId} until activity import is available`,
    };
  } catch (error: any) {
    const message = error?.message || 'Media import failed';
    if (importFileId) {
      await db.updateImportFile(importFileId, {
        status: 'failed',
        errorMessage: message,
      });
    }
    return {
      originalFilename: file.originalname,
      status: 'failed',
      importFileId,
      sha256,
      message,
    };
  }
};

const isSkippableFitImportError = (
  format: ImportFormat,
  buffer: Buffer,
  message: string
): boolean => {
  if (format !== 'fit') return false;
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('fit parse skip: metadata-only fit file')) return true;
  if (
    normalized.includes('fit parse error: no valid start time found')
    && buffer.length <= FIT_SKIPPABLE_MAX_BYTES
  ) {
    return true;
  }
  return false;
};

const resolveStoredFilePath = (relativePath: string): string => {
  if (path.isAbsolute(relativePath)) return relativePath;
  return path.join(IMPORT_STORAGE_ROOT, relativePath);
};

const isZipFile = (filename: string): boolean => path.extname(filename || '').toLowerCase() === '.zip';

const iterateZipEntriesSequentially = async (
  archive: AdmZip,
  archiveFilename: string,
  options: {
    maxEntries: number;
    maxRelevantBytes: number;
    isRelevant: (entryName: string) => boolean;
  },
  onEntry: (file: UploadedImportFile) => Promise<void>
): Promise<{ relevantEntries: number; totalRelevantBytes: number }> => {
  const entries = archive.getEntries().filter((entry) => !entry.isDirectory);

  let totalBytes = 0;
  let relevantEntries = 0;
  for (const entry of entries) {
    if (!options.isRelevant(entry.entryName || '')) continue;
    relevantEntries += 1;
    if (relevantEntries > options.maxEntries) {
      throw new Error(`ZIP archive exceeds max supported entries (${options.maxEntries})`);
    }

    const data = entry.getData();
    totalBytes += data.length;
    if (totalBytes > options.maxRelevantBytes) {
      throw new Error(`ZIP archive exceeds max extracted size (${options.maxRelevantBytes} bytes)`);
    }

    await onEntry({
      originalname: `${path.basename(archiveFilename)}::${entry.entryName}`,
      buffer: data,
      size: data.length,
    });
  }

  if (!relevantEntries) {
    throw new Error(`ZIP archive contains no supported files (${SUPPORTED_IMPORT_FORMATS_LABEL})`);
  }

  return { relevantEntries, totalRelevantBytes: totalBytes };
};

export const computeImportQueueRetryDelayMs = (attemptCount: number): number => {
  const exponent = Math.max(0, attemptCount - 1);
  const raw = queueRetryBaseMs * (2 ** exponent);
  return Math.min(queueRetryMaxMs, raw);
};

const expandZipEntries = (file: UploadedImportFile): UploadedImportFile[] => {
  const zip = new AdmZip(file.buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (entries.length > ZIP_MAX_ENTRIES) {
    throw new Error(`ZIP archive exceeds max entries (${ZIP_MAX_ENTRIES})`);
  }

  let totalBytes = 0;
  const extracted: UploadedImportFile[] = [];
  for (const entry of entries) {
    if (!isRelevantZipImportEntry(entry.entryName || '')) continue;

    const data = entry.getData();
    totalBytes += data.length;
    if (totalBytes > ZIP_MAX_TOTAL_BYTES) {
      throw new Error(`ZIP archive exceeds max extracted size (${ZIP_MAX_TOTAL_BYTES} bytes)`);
    }

    extracted.push({
      originalname: `${path.basename(file.originalname)}::${entry.entryName}`,
      buffer: data,
      size: data.length,
    });
  }

  if (!extracted.length) {
    throw new Error(`ZIP archive contains no supported files (${SUPPORTED_IMPORT_FORMATS_LABEL})`);
  }

  return extracted;
};

const summarizeImportFiles = (files: ImportFileRecord[]) => {
  const ok = files.filter((file) => file.status === 'ok').length;
  const skipped = files.filter((file) => file.status === 'skipped_duplicate').length;
  const failed = files.filter((file) => file.status === 'failed').length;
  const total = files.length;
  return { total, ok, skipped, failed };
};

export const refreshImportRunFromFiles = async (
  db: DatabaseService,
  importId: number
): Promise<{
  status: ImportStatus;
  filesTotal: number;
  filesOk: number;
  filesSkipped: number;
  filesFailed: number;
  pending: number;
}> => {
  const files = await db.getImportFiles(importId);
  const counts = summarizeImportFiles(files);
  const processing = files.filter((file) => file.status === 'processing').length;
  const queued = files.filter((file) => file.status === 'queued').length;
  const pending = processing + queued;

  let status: ImportStatus;
  let finishedAt: Date | null;

  if (processing > 0) {
    status = 'processing';
    finishedAt = null;
  } else if (queued > 0) {
    status = 'queued';
    finishedAt = null;
  } else {
    status = toBatchResultStatus({
      ok: counts.ok,
      skipped: counts.skipped,
      failed: counts.failed,
    });
    finishedAt = new Date();
  }

  await db.updateImportRun(importId, {
    status,
    filesTotal: counts.total,
    filesOk: counts.ok,
    filesSkipped: counts.skipped,
    filesFailed: counts.failed,
    finishedAt,
  });

  if (pending === 0 && counts.ok > 0 && importRunCompletedHooks.size > 0) {
    const event: ImportRunCompletedEvent = {
      importId,
      status,
      filesTotal: counts.total,
      filesOk: counts.ok,
      filesSkipped: counts.skipped,
      filesFailed: counts.failed,
    };
    for (const hook of importRunCompletedHooks) {
      Promise.resolve(hook(event)).catch((error: any) => {
        console.warn(`⚠️  Import completion hook failed for import ${importId}: ${error?.message || error}`);
      });
    }
  }

  return {
    status,
    filesTotal: counts.total,
    filesOk: counts.ok,
    filesSkipped: counts.skipped,
    filesFailed: counts.failed,
    pending,
  };
};

export const buildImportQueueAlerts = (
  stats: { failedLast24h: number; ready: number },
  worker: { stale: boolean; staleAfterMs: number }
): ImportQueueAlert[] => {
  const alerts: ImportQueueAlert[] = [];

  if (stats.failedLast24h >= queueAlertFailed24hThreshold) {
    alerts.push({
      code: 'QUEUE_FAILED_24H',
      severity: 'critical',
      message: `Failed jobs in last 24h reached ${stats.failedLast24h}`,
      value: stats.failedLast24h,
      threshold: queueAlertFailed24hThreshold,
    });
  }

  if (stats.ready >= queueAlertReadyThreshold) {
    alerts.push({
      code: 'QUEUE_BACKLOG_READY',
      severity: 'warning',
      message: `Ready queue backlog is ${stats.ready}`,
      value: stats.ready,
      threshold: queueAlertReadyThreshold,
    });
  }

  if (worker.stale) {
    alerts.push({
      code: 'QUEUE_WORKER_STALE',
      severity: 'critical',
      message: 'Import queue worker heartbeat is stale',
      value: worker.staleAfterMs,
      threshold: worker.staleAfterMs,
    });
  }

  return alerts;
};

const buildActivityFingerprint = (input: {
  startTimeUtc: Date;
  durationSec: number;
  distanceM?: number;
  sportType: string;
}): string => {
  const roundedDuration = Math.max(0, Math.round(input.durationSec));
  const roundedDistance = Math.max(0, Math.round((input.distanceM || 0) / 10) * 10);
  const sport = normalizeSportType(input.sportType).sportType.toLowerCase();
  const raw = `${input.startTimeUtc.toISOString()}|${roundedDuration}|${roundedDistance}|${sport}`;
  return createHash('sha1').update(raw).digest('hex');
};

const saveImportFile = async (
  importId: number,
  originalFilename: string,
  buffer: Buffer
): Promise<{ absolutePath: string; relativePath: string }> => {
  const importDir = path.join(IMPORT_STORAGE_ROOT, String(importId));
  await fs.mkdir(importDir, { recursive: true });

  const safeName = sanitizeFilename(originalFilename);
  const storedFilename = `${Date.now()}-${safeName}`;
  const absolutePath = path.join(importDir, storedFilename);
  await fs.writeFile(absolutePath, buffer);

  return {
    absolutePath,
    relativePath: path.join(String(importId), storedFilename).replace(/\\/g, '/'),
  };
};

const persistStreams = async (
  db: DatabaseService,
  activityId: number,
  parsed: ParsedActivity
): Promise<void> => {
  const candidates: Array<{ streamType: string; data?: any[] }> = [
    { streamType: 'time', data: parsed.streams.time },
    { streamType: 'latlng', data: parsed.streams.latlng as any[] | undefined },
    { streamType: 'altitude', data: parsed.streams.altitude },
    { streamType: 'heartrate', data: parsed.streams.heartrate },
    { streamType: 'watts', data: parsed.streams.watts },
    { streamType: 'cadence', data: parsed.streams.cadence },
    { streamType: 'distance', data: parsed.streams.distance },
    { streamType: 'velocity_smooth', data: parsed.streams.velocity_smooth },
  ];

  for (const stream of candidates) {
    if (!stream.data || stream.data.length === 0) continue;
    await db.insertActivityStream({
      activity_id: activityId,
      stream_type: stream.streamType,
      data: stream.data,
    });
  }
};

export const importSingleFile = async (
  db: DatabaseService,
  file: UploadedImportFile,
  options?: {
    type?: ImportType;
    source?: ImportSource;
  }
): Promise<SingleImportResult> => {
  const importId = await db.createImportRun({
    type: options?.type || 'single',
    status: 'processing',
    source: options?.source || 'file',
    filesTotal: 1,
  });

  const item = await processOneFile(db, importId, file);
  const runStatus = item.status === 'failed' ? 'error' : 'done';
  await db.updateImportRun(importId, {
    status: runStatus,
    filesOk: item.status === 'done' ? 1 : 0,
    filesSkipped: item.status === 'duplicate' ? 1 : 0,
    filesFailed: item.status === 'failed' ? 1 : 0,
    finishedAt: new Date(),
  });

  return {
    importId,
    importFileId: item.importFileId,
    status: item.status,
    detectedFormat: item.detectedFormat,
    sha256: item.sha256,
    activityId: item.activityId,
    message: item.message,
  };
};

const processOneFile = async (
  db: DatabaseService,
  importId: number,
  file: UploadedImportFile
): Promise<BatchImportFileResult> => {
  const sha256 = sha256Hex(file.buffer);
  const detectedFormat = detectImportFormat(file.originalname, file.buffer);
  let importFileId: number | undefined;

  try {
    if (detectedFormat === 'csv' || isCsvLikeFilename(file.originalname)) {
      return await processStravaActivitiesCsvFile(db, importId, file, 'sync');
    }

    const existingFile = await db.getImportFileBySha256(sha256);
    if (existingFile) {
      return {
        originalFilename: file.originalname,
        status: 'duplicate',
        detectedFormat: detectedFormat || undefined,
        sha256,
        activityId: existingFile.activity_id ?? undefined,
        message: 'File already imported (sha256 duplicate)',
      };
    }

    const stored = await saveImportFile(importId, file.originalname, file.buffer);

    importFileId = await db.createImportFile({
      import_id: importId,
      original_filename: file.originalname,
      path: stored.relativePath,
      size_bytes: file.size,
      sha256,
      detected_format: detectedFormat || null,
      status: 'processing',
    });

    if (!detectedFormat) {
      throw new Error(`Unsupported file format. Supported extensions: ${SUPPORTED_IMPORT_FORMATS_LABEL}`);
    }

    const persisted = await parseAndPersistActivity(db, {
      importId,
      filename: file.originalname,
      buffer: file.buffer,
      detectedFormat,
    });

    await db.updateImportFile(importFileId, {
      status: persisted.status === 'done' ? 'ok' : 'skipped_duplicate',
      activityId: persisted.activityId,
      errorMessage: null,
      detectedFormat,
    });

    return {
      originalFilename: file.originalname,
      status: persisted.status === 'done' ? 'done' : 'duplicate',
      importFileId,
      detectedFormat,
      sha256,
      activityId: persisted.activityId,
      message: persisted.message,
    };
  } catch (error: any) {
    const message = error?.message || 'Unknown import error';
    if (importFileId) {
      await db.updateImportFile(importFileId, {
        status: 'failed',
        errorMessage: message,
      });
    } else if (detectedFormat === 'csv' || isCsvLikeFilename(file.originalname)) {
      const markerSha = sha256Hex(
        Buffer.from(`${sha256}:${importId}:${file.originalname}:${Date.now()}:csv-failed`)
      );
      importFileId = await db.createImportFile({
        import_id: importId,
        original_filename: file.originalname,
        size_bytes: file.size,
        sha256: markerSha,
        detected_format: 'csv',
        status: 'failed',
      });
      await db.updateImportFile(importFileId, {
        errorMessage: message,
      });
      return {
        originalFilename: file.originalname,
        status: 'failed',
        importFileId,
        detectedFormat: 'csv',
        sha256: markerSha,
        message,
      };
    }

    return {
      originalFilename: file.originalname,
      status: 'failed',
      importFileId,
      detectedFormat: detectedFormat || undefined,
      sha256,
      message,
    };
  }
};

const parseAndPersistActivity = async (
  db: DatabaseService,
  input: {
    importId: number;
    filename: string;
    buffer: Buffer;
    detectedFormat: ActivityImportFormat;
  }
): Promise<{ status: 'done' | 'duplicate' | 'skipped'; activityId?: number; message: string }> => {
  let parsed: ParsedActivity;
  const parseBuffer = decodeImportBufferIfNeeded(input.filename, input.buffer);
  try {
    parsed = await parseActivity(input.detectedFormat, parseBuffer, input.filename);
  } catch (error: any) {
    const message = error?.message || 'Import parse failed';
    if (isSkippableFitImportError(input.detectedFormat, parseBuffer, message)) {
      return {
        status: 'skipped',
        message: 'Skipped FIT metadata file (no activity stream data found)',
      };
    }
    throw error;
  }

  const sport = normalizeSportType(parsed.metadata.sportType);
  const resolvedExternalId = parsed.metadata.externalId
    || extractExternalActivityIdFromFilename(input.filename)
    || undefined;
  const resolvedNameHint = await resolveImportNameHint(db, {
    filename: input.filename,
    externalId: resolvedExternalId,
  });
  const resolvedGearId = await resolveImportGearHint(db, resolvedExternalId);
  const resolvedName = resolvedNameHint || parsed.metadata.name || `${sport.type} Import`;
  const fingerprint = buildActivityFingerprint({
    startTimeUtc: parsed.metadata.startTimeUtc,
    durationSec: parsed.metadata.durationSec,
    distanceM: parsed.metadata.distanceM,
    sportType: parsed.metadata.sportType,
  });

  const existingActivity = await db.getActivityByFingerprint(fingerprint);
  if (existingActivity?.strava_activity_id) {
    return {
      status: 'duplicate',
      activityId: existingActivity.strava_activity_id,
      message: 'Activity already imported (fingerprint duplicate)',
    };
  }

  const activityId = await db.getNextImportActivityId();
  const averageSpeed = parsed.metadata.durationSec > 0 && (parsed.metadata.distanceM || 0) > 0
    ? (parsed.metadata.distanceM as number) / parsed.metadata.durationSec
    : undefined;
  const speedSamples = (parsed.streams.velocity_smooth || []).filter(
    (value): value is number => Number.isFinite(value) && value >= 0
  );
  const maxSpeed = speedSamples.length > 0
    ? Math.max(...speedSamples)
    : averageSpeed;
  await db.upsertActivity({
    strava_activity_id: activityId,
    name: resolvedName,
    type: sport.type,
    sport_type: sport.sportType,
    start_date: parsed.metadata.startTimeUtc,
    distance: parsed.metadata.distanceM,
    moving_time: parsed.metadata.durationSec,
    elapsed_time: parsed.metadata.durationSec,
    total_elevation_gain: parsed.metadata.elevationGainM,
    average_speed: averageSpeed,
    max_speed: maxSpeed,
    average_heartrate: parsed.metadata.avgHr,
    max_heartrate: parsed.metadata.maxHr ? Math.round(parsed.metadata.maxHr) : undefined,
    average_watts: parsed.metadata.avgPower,
    max_watts: parsed.metadata.maxPower ? Math.round(parsed.metadata.maxPower) : undefined,
    average_cadence: parsed.metadata.avgCadence,
    calories: parsed.metadata.calories,
    device_name: parsed.metadata.device,
    source: 'file',
    external_id: resolvedExternalId,
    gear_id: resolvedGearId || undefined,
    fingerprint,
    import_batch_id: input.importId,
  });

  await persistStreams(db, activityId, parsed);
  await attachStagedStravaExportMediaForActivity(db, activityId, resolvedExternalId);
  // Build local climb efforts for file imports so segments work without Strava.
  try {
    await rebuildLocalClimbsForActivity(db, activityId);
  } catch (error: any) {
    console.warn(
      `⚠️  Local climb detection skipped for activity ${activityId}: ${error?.message || error}`
    );
  }
  return {
    status: 'done',
    activityId,
    message: 'Activity imported successfully',
  };
};

const queueOneFile = async (
  db: DatabaseService,
  importId: number,
  file: UploadedImportFile,
  options?: {
    priority?: number;
    maxAttempts?: number;
  }
): Promise<QueuedBatchFileResult> => {
  const sha256 = sha256Hex(file.buffer);
  const detectedFormat = detectImportFormat(file.originalname, file.buffer);
  let importFileId: number | undefined;

  try {
    if (detectedFormat === 'csv' || isCsvLikeFilename(file.originalname)) {
      return await processStravaActivitiesCsvFile(db, importId, file, 'queue');
    }

    const existingFile = await db.getImportFileBySha256(sha256);
    if (existingFile) {
      const markerSha = sha256Hex(
        Buffer.from(`${sha256}:${importId}:${file.originalname}:${Date.now()}:duplicate-marker`)
      );
      importFileId = await db.createImportFile({
        import_id: importId,
        original_filename: file.originalname,
        size_bytes: file.size,
        sha256: markerSha,
        detected_format: detectedFormat || null,
        status: 'skipped_duplicate',
      });
      await db.updateImportFile(importFileId, {
        activityId: existingFile.activity_id ?? null,
      });

      return {
        originalFilename: file.originalname,
        status: 'duplicate',
        importFileId,
        detectedFormat: (detectedFormat as ImportFormat | null) || undefined,
        sha256,
        activityId: existingFile.activity_id ?? undefined,
        message: 'File already imported (sha256 duplicate)',
      };
    }

    if (!detectedFormat) {
      importFileId = await db.createImportFile({
        import_id: importId,
        original_filename: file.originalname,
        size_bytes: file.size,
        sha256,
        detected_format: null,
        status: 'failed',
      });
      await db.updateImportFile(importFileId, {
        errorMessage: `Unsupported file format. Supported extensions: ${SUPPORTED_IMPORT_FORMATS_LABEL}`,
      });

      return {
        originalFilename: file.originalname,
        status: 'failed',
        importFileId,
        sha256,
        message: `Unsupported file format. Supported extensions: ${SUPPORTED_IMPORT_FORMATS_LABEL}`,
      };
    }

    const stored = await saveImportFile(importId, file.originalname, file.buffer);
    importFileId = await db.createImportFile({
      import_id: importId,
      original_filename: file.originalname,
      path: stored.relativePath,
      size_bytes: file.size,
      sha256,
      detected_format: detectedFormat,
      status: 'queued',
    });
    await db.createImportJob({
      import_id: importId,
      import_file_id: importFileId,
      priority: options?.priority ?? PRIORITY_BATCH,
      max_attempts: options?.maxAttempts ?? queueMaxAttempts,
    });

    return {
      originalFilename: file.originalname,
      status: 'queued',
      importFileId,
      detectedFormat,
      sha256,
      message: 'File queued for background import',
    };
  } catch (error: any) {
    const message = error?.message || 'Failed to enqueue file';
    if (importFileId) {
      await db.updateImportFile(importFileId, {
        status: 'failed',
        errorMessage: message,
      });
    } else if (detectedFormat === 'csv' || isCsvLikeFilename(file.originalname)) {
      const markerSha = sha256Hex(
        Buffer.from(`${sha256}:${importId}:${file.originalname}:${Date.now()}:csv-failed`)
      );
      importFileId = await db.createImportFile({
        import_id: importId,
        original_filename: file.originalname,
        size_bytes: file.size,
        sha256: markerSha,
        detected_format: 'csv',
        status: 'failed',
      });
      await db.updateImportFile(importFileId, {
        errorMessage: message,
      });
      return {
        originalFilename: file.originalname,
        status: 'failed',
        importFileId,
        detectedFormat: 'csv',
        sha256: markerSha,
        message,
      };
    }
    return {
      originalFilename: file.originalname,
      status: 'failed',
      importFileId,
      detectedFormat: detectedFormat || undefined,
      sha256,
      message,
    };
  }
};

export const enqueueSingleFileImport = async (
  db: DatabaseService,
  file: UploadedImportFile,
  options?: {
    type?: ImportType;
    source?: ImportSource;
  }
): Promise<QueuedSingleImportResult> => {
  const importId = await db.createImportRun({
    type: options?.type || 'single',
    status: 'queued',
    source: options?.source || 'file',
    filesTotal: 1,
  });

  const priority = options?.source === 'watchfolder'
    ? PRIORITY_WATCHFOLDER
    : PRIORITY_SINGLE;
  const result = await queueOneFile(db, importId, file, {
    priority,
    maxAttempts: queueMaxAttempts,
  });
  await refreshImportRunFromFiles(db, importId);

  return {
    importId,
    importFileId: result.importFileId,
    status: result.status,
    detectedFormat: result.detectedFormat,
    sha256: result.sha256,
    activityId: result.activityId,
    message: result.message,
  };
};

export const enqueueBatchFilesImport = async (
  db: DatabaseService,
  files: UploadedImportFile[]
): Promise<QueuedBatchImportResult> => {
  const importId = await db.createImportRun({
    type: 'batch',
    status: 'queued',
    source: 'file',
    filesTotal: files.length,
  });

  const results: QueuedBatchFileResult[] = [];

  for (const file of files) {
    if (isZipFile(file.originalname)) {
      try {
        const extracted = expandZipEntries(file);
        for (const extractedFile of extracted) {
          results.push(await queueOneFile(db, importId, extractedFile, {
            priority: PRIORITY_BATCH,
            maxAttempts: queueMaxAttempts,
          }));
        }
      } catch (error: any) {
        const message = error?.message || 'ZIP import failed';
        const importFileId = await db.createImportFile({
          import_id: importId,
          original_filename: file.originalname,
          size_bytes: file.size,
          sha256: sha256Hex(file.buffer),
          detected_format: 'zip',
          status: 'failed',
        });
        await db.updateImportFile(importFileId, {
          errorMessage: message,
        });
        results.push({
          originalFilename: file.originalname,
          status: 'failed',
          importFileId,
          sha256: sha256Hex(file.buffer),
          message,
        });
      }
      continue;
    }

    results.push(await queueOneFile(db, importId, file, {
      priority: PRIORITY_BATCH,
      maxAttempts: queueMaxAttempts,
    }));
  }

  const summary = await refreshImportRunFromFiles(db, importId);
  const responseStatus: QueuedBatchImportResult['status'] = summary.pending > 0
    ? 'queued'
    : (summary.status === 'processing' ? 'queued' : summary.status);

  return {
    importId,
    status: responseStatus,
    filesTotal: summary.filesTotal,
    filesOk: summary.filesOk,
    filesSkipped: summary.filesSkipped,
    filesFailed: summary.filesFailed,
    files: results,
  };
};

const enqueueStravaExportZipImportIntoExistingRun = async (
  db: DatabaseService,
  importId: number,
  input: {
    originalFilename: string;
    absolutePath: string;
    sizeBytes: number;
  },
  options?: {
    includeMedia?: boolean;
  }
): Promise<QueuedBatchImportResult> => {
  const results: QueuedBatchFileResult[] = [];
  try {
    const archive = new AdmZip(input.absolutePath);
    await iterateZipEntriesSequentially(
      archive,
      input.originalFilename,
      {
        maxEntries: STRAVA_EXPORT_ZIP_MAX_ENTRIES,
        maxRelevantBytes: STRAVA_EXPORT_ZIP_MAX_TOTAL_BYTES,
        isRelevant: (entryName) => isRelevantStravaExportZipEntry(entryName, options),
      },
      async (entryFile) => {
        if (options?.includeMedia && isStravaExportMediaEntry(entryFile.originalname)) {
          results.push(await processStravaExportMediaFile(db, importId, entryFile));
          return;
        }
        results.push(await queueOneFile(db, importId, entryFile, {
          priority: PRIORITY_BATCH,
          maxAttempts: queueMaxAttempts,
        }));
      }
    );
  } catch (error: any) {
    const message = error?.message || 'Strava export ZIP import failed';
    const importFileId = await db.createImportFile({
      import_id: importId,
      original_filename: input.originalFilename,
      size_bytes: input.sizeBytes,
      sha256: sha256Hex(Buffer.from(`${input.originalFilename}:${input.sizeBytes}:${Date.now()}:strava-export-zip`)),
      detected_format: 'zip',
      status: 'failed',
    });
    await db.updateImportFile(importFileId, { errorMessage: message });
    results.push({
      originalFilename: input.originalFilename,
      status: 'failed',
      importFileId,
      sha256: sha256Hex(Buffer.from(`${input.originalFilename}:${input.sizeBytes}:${Date.now()}:strava-export-zip-result`)),
      message,
    });
  }

  const summary = await refreshImportRunFromFiles(db, importId);
  const responseStatus: QueuedBatchImportResult['status'] = summary.pending > 0
    ? 'queued'
    : (summary.status === 'processing' ? 'queued' : summary.status);

  return {
    importId,
    status: responseStatus,
    filesTotal: summary.filesTotal,
    filesOk: summary.filesOk,
    filesSkipped: summary.filesSkipped,
    filesFailed: summary.filesFailed,
    files: results,
  };
};

export const enqueueStravaExportZipImportFromPath = async (
  db: DatabaseService,
  input: {
    originalFilename: string;
    absolutePath: string;
    sizeBytes: number;
  },
  options?: {
    includeMedia?: boolean;
  }
): Promise<QueuedBatchImportResult> => {
  const importId = await db.createImportRun({
    type: 'batch',
    status: 'queued',
    source: 'file',
    filesTotal: 0,
  });

  return enqueueStravaExportZipImportIntoExistingRun(db, importId, input, options);
};

export const enqueueStravaExportZipImportFromPathWithImportId = async (
  db: DatabaseService,
  importId: number,
  input: {
    originalFilename: string;
    absolutePath: string;
    sizeBytes: number;
  },
  options?: {
    includeMedia?: boolean;
  }
): Promise<QueuedBatchImportResult> => {
  return enqueueStravaExportZipImportIntoExistingRun(db, importId, input, options);
};

class ImportQueueWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private activeWorkers = 0;
  private lastTickStartedAt: Date | null = null;
  private lastTickFinishedAt: Date | null = null;
  private lastError: string | null = null;
  private readonly enabled = queueWorkerEnabled;
  private readonly pollMs = queuePollMs;
  private readonly concurrency = queueConcurrency;

  start(): void {
    if (!this.enabled) {
      console.log('⏸️  Import queue worker disabled');
      return;
    }
    if (this.timer) return;

    console.log(`🧵 Import queue worker enabled (poll=${this.pollMs}ms, concurrency=${this.concurrency})`);
    this.timer = setInterval(() => {
      this.tick().catch((error: any) => {
        console.error('❌ Import queue tick failed:', error?.message || error);
      });
    }, this.pollMs);

    this.tick().catch((error: any) => {
      console.error('❌ Import queue startup tick failed:', error?.message || error);
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus(): ImportQueueWorkerStatus {
    const now = Date.now();
    const lastHeartbeat = this.lastTickFinishedAt?.getTime()
      || this.lastTickStartedAt?.getTime()
      || null;
    const stale = this.enabled && this.timer !== null && lastHeartbeat !== null
      ? (now - lastHeartbeat) > queueHealthStaleMs
      : false;

    return {
      enabled: this.enabled,
      running: this.timer !== null,
      pollMs: this.pollMs,
      concurrency: this.concurrency,
      activeWorkers: this.activeWorkers,
      lastTickStartedAt: this.lastTickStartedAt?.toISOString() || null,
      lastTickFinishedAt: this.lastTickFinishedAt?.toISOString() || null,
      lastError: this.lastError,
      stale,
      staleAfterMs: queueHealthStaleMs,
    };
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.lastTickStartedAt = new Date();
    try {
      await Promise.all(Array.from({ length: this.concurrency }, () => this.processSingleJob()));
      this.lastError = null;
    } finally {
      this.running = false;
      this.lastTickFinishedAt = new Date();
    }
  }

  private async processSingleJob(): Promise<void> {
    const db = new DatabaseService();
    let claimed: {
      id: number;
      import_id: number;
      import_file_id: number;
      attempt_count: number;
      max_attempts: number;
    } | null = null;

    try {
      this.activeWorkers += 1;
      const job = await db.claimNextImportJob();
      if (!job || !job.id) return;

      claimed = {
        id: Number(job.id),
        import_id: Number(job.import_id),
        import_file_id: Number(job.import_file_id),
        attempt_count: Number(job.attempt_count || 0),
        max_attempts: Number(job.max_attempts || queueMaxAttempts),
      };

      await db.updateImportRun(claimed.import_id, {
        status: 'processing',
        finishedAt: null,
      });

      const file = await db.getImportFileById(claimed.import_file_id);
      if (!file || !file.id) {
        throw new Error('Import file for queued job not found');
      }

      await db.updateImportFile(file.id, {
        status: 'processing',
        errorMessage: null,
      });

      if (!file.path) {
        throw new Error('Import file path is missing for queued job');
      }

      const absolutePath = resolveStoredFilePath(file.path);
      const buffer = await fs.readFile(absolutePath);
      const detectedFormat = detectImportFormat(file.original_filename, buffer);
      if (!detectedFormat) {
        throw new Error(`Unsupported file format. Supported extensions: ${SUPPORTED_IMPORT_FORMATS_LABEL}`);
      }
      if (detectedFormat === 'csv') {
        await processStravaActivitiesCsvFile(db, claimed.import_id, {
          originalname: file.original_filename,
          buffer,
          size: buffer.length,
        }, 'queue', {
          existingImportFileId: file.id as number,
          sha256Override: file.sha256,
          path: file.path,
        });
        await db.completeImportJob(claimed.id);
        await refreshImportRunFromFiles(db, claimed.import_id);
        return;
      }

      const persisted = await parseAndPersistActivity(db, {
        importId: claimed.import_id,
        filename: file.original_filename,
        buffer,
        detectedFormat,
      });

      await db.updateImportFile(file.id, {
        status: persisted.status === 'done' ? 'ok' : 'skipped_duplicate',
        activityId: persisted.activityId,
        errorMessage: null,
        detectedFormat,
      });
      await db.completeImportJob(claimed.id);
      await refreshImportRunFromFiles(db, claimed.import_id);
    } catch (error: any) {
      const message = error?.message || 'Queued import processing failed';
      this.lastError = message;
      if (claimed) {
        const file = await db.getImportFileById(claimed.import_file_id);
        const canRetry = claimed.attempt_count < claimed.max_attempts;
        if (canRetry) {
          const retryDelayMs = computeImportQueueRetryDelayMs(claimed.attempt_count);
          if (file?.id) {
            await db.updateImportFile(file.id, {
              status: 'queued',
              errorMessage: `Retry ${claimed.attempt_count}/${claimed.max_attempts}: ${message}`,
            });
          }
          await db.requeueImportJob(claimed.id, message, retryDelayMs);
          console.warn(
            `⚠️  Import queue job ${claimed.id} retry scheduled in ${retryDelayMs}ms (attempt ${claimed.attempt_count}/${claimed.max_attempts})`
          );
        } else {
          if (file?.id) {
            await db.updateImportFile(file.id, {
              status: 'failed',
              errorMessage: message,
            });
          }
          await db.failImportJob(claimed.id, message);
          console.error('❌ Import queue job failed permanently:', message);
        }
        await refreshImportRunFromFiles(db, claimed.import_id);
      }
    } finally {
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
      await db.close();
    }
  }
}

export const importQueueWorker = new ImportQueueWorker();

class ImportQueueAlertMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRunAt: Date | null = null;
  private lastError: string | null = null;
  private sentCount = 0;
  private failedCount = 0;
  private readonly lastSentByCode = new Map<string, number>();
  private readonly enabled = queueAlertMonitorEnabled && queueAlertWebhookUrl.length > 0;
  private readonly pollMs = queueAlertPollMs;
  private readonly cooldownMs = queueAlertCooldownMs;
  private readonly webhookUrl = queueAlertWebhookUrl;

  start(): void {
    if (!this.enabled) {
      if (queueAlertMonitorEnabled && !this.webhookUrl) {
        console.log('⏸️  Import queue alert monitor enabled but webhook URL is empty');
      } else {
        console.log('⏸️  Import queue alert monitor disabled');
      }
      return;
    }
    if (this.timer) return;

    console.log(`📣 Import queue alert monitor enabled (poll=${this.pollMs}ms, cooldown=${this.cooldownMs}ms)`);
    this.timer = setInterval(() => {
      this.tick().catch((error: any) => {
        this.lastError = error?.message || String(error);
        console.error('❌ Import queue alert monitor tick failed:', this.lastError);
      });
    }, this.pollMs);

    this.tick().catch((error: any) => {
      this.lastError = error?.message || String(error);
      console.error('❌ Import queue alert monitor startup tick failed:', this.lastError);
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus() {
    return {
      enabled: this.enabled,
      running: this.timer !== null,
      pollMs: this.pollMs,
      cooldownMs: this.cooldownMs,
      webhookConfigured: this.webhookUrl.length > 0,
      lastRunAt: this.lastRunAt?.toISOString() || null,
      lastError: this.lastError,
      sentCount: this.sentCount,
      failedCount: this.failedCount,
    };
  }

  private shouldSend(alert: ImportQueueAlert): boolean {
    const now = Date.now();
    const lastSent = this.lastSentByCode.get(alert.code);
    return !lastSent || (now - lastSent) >= this.cooldownMs;
  }

  private markSent(alert: ImportQueueAlert): void {
    this.lastSentByCode.set(alert.code, Date.now());
  }

  private async tick(): Promise<void> {
    if (!this.enabled) return;
    if (this.running) return;
    this.running = true;
    this.lastRunAt = new Date();

    const db = new DatabaseService();
    try {
      const stats = await db.getImportQueueStats();
      const worker = importQueueWorker.getStatus();
      const alerts = buildImportQueueAlerts(stats, worker);

      for (const alert of alerts) {
        if (!this.shouldSend(alert)) continue;

        try {
          const response = await fetch(this.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'import-queue',
              timestamp: new Date().toISOString(),
              alert,
              stats,
              worker,
            }),
          });

          if (!response.ok) {
            throw new Error(`Webhook responded with ${response.status}`);
          }

          this.sentCount += 1;
          this.markSent(alert);
          this.lastError = null;
        } catch (error: any) {
          this.failedCount += 1;
          this.lastError = error?.message || String(error);
          console.error(`❌ Failed to send queue alert webhook (${alert.code}):`, this.lastError);
        }
      }
    } finally {
      this.running = false;
      await db.close();
    }
  }
}

export const importQueueAlertMonitor = new ImportQueueAlertMonitor();

export const importBatchFiles = async (
  db: DatabaseService,
  files: UploadedImportFile[]
): Promise<BatchImportResult> => {
  const importId = await db.createImportRun({
    type: 'batch',
    status: 'processing',
    source: 'file',
    filesTotal: files.length,
  });

  const results: BatchImportFileResult[] = [];
  let filesOk = 0;
  let filesSkipped = 0;
  let filesFailed = 0;

  for (const file of files) {
    if (isZipFile(file.originalname)) {
      try {
        const extracted = expandZipEntries(file);
        for (const extractedFile of extracted) {
          const result = await processOneFile(db, importId, extractedFile);
          results.push(result);
          if (result.status === 'done') filesOk += 1;
          if (result.status === 'duplicate') filesSkipped += 1;
          if (result.status === 'failed') filesFailed += 1;
        }
      } catch (error: any) {
        const message = error?.message || 'ZIP import failed';
        results.push({
          originalFilename: file.originalname,
          status: 'failed',
          sha256: sha256Hex(file.buffer),
          message,
        });
        filesFailed += 1;
      }
      continue;
    }

    const result = await processOneFile(db, importId, file);
    results.push(result);

    if (result.status === 'done') filesOk += 1;
    if (result.status === 'duplicate') filesSkipped += 1;
    if (result.status === 'failed') filesFailed += 1;
  }

  let status: 'done' | 'partial' | 'error' = 'done';
  if (filesFailed > 0 && filesOk === 0 && filesSkipped === 0) {
    status = 'error';
  } else if (filesFailed > 0) {
    status = 'partial';
  }

  await db.updateImportRun(importId, {
    status,
    filesTotal: results.length,
    filesOk,
    filesSkipped,
    filesFailed,
    finishedAt: new Date(),
  });

  return {
    importId,
    status,
    filesTotal: results.length,
    filesOk,
    filesSkipped,
    filesFailed,
    files: results,
  };
};

export const importStravaExportZipFromPath = async (
  db: DatabaseService,
  input: {
    originalFilename: string;
    absolutePath: string;
    sizeBytes: number;
  },
  options?: {
    includeMedia?: boolean;
  }
): Promise<BatchImportResult> => {
  const importId = await db.createImportRun({
    type: 'batch',
    status: 'processing',
    source: 'file',
    filesTotal: 0,
  });

  const results: BatchImportFileResult[] = [];
  let filesOk = 0;
  let filesSkipped = 0;
  let filesFailed = 0;

  try {
    const archive = new AdmZip(input.absolutePath);
    await iterateZipEntriesSequentially(
      archive,
      input.originalFilename,
      {
        maxEntries: STRAVA_EXPORT_ZIP_MAX_ENTRIES,
        maxRelevantBytes: STRAVA_EXPORT_ZIP_MAX_TOTAL_BYTES,
        isRelevant: (entryName) => isRelevantStravaExportZipEntry(entryName, options),
      },
      async (entryFile) => {
        const result = (options?.includeMedia && isStravaExportMediaEntry(entryFile.originalname))
          ? await processStravaExportMediaFile(db, importId, entryFile)
          : await processOneFile(db, importId, entryFile);
        results.push(result);
        if (result.status === 'done') filesOk += 1;
        if (result.status === 'duplicate') filesSkipped += 1;
        if (result.status === 'failed') filesFailed += 1;
      }
    );
  } catch (error: any) {
    const message = error?.message || 'Strava export ZIP import failed';
    results.push({
      originalFilename: input.originalFilename,
      status: 'failed',
      sha256: sha256Hex(Buffer.from(`${input.originalFilename}:${input.sizeBytes}:${Date.now()}:strava-export-zip`)),
      message,
    });
    filesFailed += 1;
  }

  let status: 'done' | 'partial' | 'error' = 'done';
  if (filesFailed > 0 && filesOk === 0 && filesSkipped === 0) {
    status = 'error';
  } else if (filesFailed > 0) {
    status = 'partial';
  }

  await db.updateImportRun(importId, {
    status,
    filesTotal: results.length,
    filesOk,
    filesSkipped,
    filesFailed,
    finishedAt: new Date(),
  });

  return {
    importId,
    status,
    filesTotal: results.length,
    filesOk,
    filesSkipped,
    filesFailed,
    files: results,
  };
};

export const retryFailedImportFiles = async (
  db: DatabaseService,
  importId: number
): Promise<RetryFailedResult> => {
  const importRun = await db.getImportRunById(importId);
  if (!importRun) {
    throw new Error('Import run not found');
  }

  const allFiles = await db.getImportFiles(importId);
  const failedFiles = allFiles.filter((file) => file.status === 'failed');

  await db.updateImportRun(importId, {
    status: 'processing',
    finishedAt: null,
  });

  const retried: BatchImportFileResult[] = [];

  for (const file of failedFiles) {
    const fileName = file.original_filename;
    try {
      if (!file.path) {
        throw new Error('Retry failed: import file path is missing');
      }

      const absolutePath = resolveStoredFilePath(file.path);
      const buffer = await fs.readFile(absolutePath);
      const detectedFormat = detectImportFormat(file.original_filename, buffer);
      if (!detectedFormat) {
        throw new Error(`Unsupported file format. Supported extensions: ${SUPPORTED_IMPORT_FORMATS_LABEL}`);
      }

      await db.updateImportFile(file.id as number, {
        status: 'processing',
        errorMessage: null,
        detectedFormat,
      });
      if (detectedFormat === 'csv') {
        const csvResult = await processStravaActivitiesCsvFile(db, importId, {
          originalname: fileName,
          buffer,
          size: buffer.length,
        }, 'sync', {
          existingImportFileId: file.id as number,
          sha256Override: file.sha256,
          path: file.path,
        });

        retried.push({
          originalFilename: fileName,
          status: 'done',
          importFileId: file.id,
          detectedFormat: 'csv',
          sha256: csvResult.sha256,
          message: csvResult.message,
        });
        continue;
      }

      const persisted = await parseAndPersistActivity(db, {
        importId,
        filename: fileName,
        buffer,
        detectedFormat,
      });

      await db.updateImportFile(file.id as number, {
        status: persisted.status === 'done' ? 'ok' : 'skipped_duplicate',
        activityId: persisted.activityId,
        errorMessage: null,
        detectedFormat,
      });

      retried.push({
        originalFilename: fileName,
        status: persisted.status === 'done' ? 'done' : 'duplicate',
        importFileId: file.id,
        detectedFormat,
        sha256: file.sha256,
        activityId: persisted.activityId,
        message: persisted.message,
      });
    } catch (error: any) {
      const message = error?.message || 'Retry failed';
      await db.updateImportFile(file.id as number, {
        status: 'failed',
        errorMessage: message,
      });

      retried.push({
        originalFilename: fileName,
        status: 'failed',
        importFileId: file.id,
        detectedFormat: (file.detected_format as ImportFormat | null) || undefined,
        sha256: file.sha256,
        activityId: file.activity_id ?? undefined,
        message,
      });
    }
  }

  const updatedFiles = await db.getImportFiles(importId);
  const counts = summarizeImportFiles(updatedFiles);
  const status = toBatchResultStatus({
    ok: counts.ok,
    skipped: counts.skipped,
    failed: counts.failed,
  });

  await db.updateImportRun(importId, {
    status,
    filesTotal: counts.total,
    filesOk: counts.ok,
    filesSkipped: counts.skipped,
    filesFailed: counts.failed,
    finishedAt: new Date(),
  });

  return {
    importId,
    status,
    filesTotal: counts.total,
    filesOk: counts.ok,
    filesSkipped: counts.skipped,
    filesFailed: counts.failed,
    files: retried,
  };
};
