import * as path from 'path';
import { promises as fs } from 'fs';
import DatabaseService from '../database';
import { importSingleFile } from './service';
import { isSupportedImportFilename } from './detector';

type FileState = {
  size: number;
  stableChecks: number;
};

type ProcessedState = {
  size: number;
  mtimeMs: number;
};

type WatchStats = {
  scans: number;
  scannedFiles: number;
  importedFiles: number;
  duplicates: number;
  failed: number;
  lastScanAt: string | null;
  lastImportAt: string | null;
  lastError: string | null;
};

const WATCH_SETTING_KEYS = [
  'watch_folder_enabled',
  'watch_folder_path',
  'watch_folder_recursive',
  'watch_folder_poll_seconds',
  'watch_folder_stable_checks',
] as const;

const envBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const envInt = (value: string | undefined, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(1, Math.floor(num)) : fallback;
};

const parseOptionalBool = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

export type WatchFolderConfig = {
  enabled: boolean;
  path: string;
  recursive: boolean;
  pollSeconds: number;
  stableChecksRequired: number;
  sharePathHint?: string | null;
};

export class WatchFolderService {
  private enabled: boolean;
  private folderPath: string;
  private recursive: boolean;
  private pollSeconds: number;
  private stableChecksRequired: number;
  private readonly sharePathHint: string | null;
  private timer: NodeJS.Timeout | null = null;
  private isScanning = false;
  private readonly fileStates = new Map<string, FileState>();
  private readonly processed = new Map<string, ProcessedState>();
  private readonly inFlight = new Set<string>();
  private readonly stats: WatchStats = {
    scans: 0,
    scannedFiles: 0,
    importedFiles: 0,
    duplicates: 0,
    failed: 0,
    lastScanAt: null,
    lastImportAt: null,
    lastError: null,
  };

  constructor() {
    this.enabled = envBool(process.env.WATCH_FOLDER_ENABLED, false);
    this.folderPath = process.env.WATCH_FOLDER_PATH || '';
    this.recursive = envBool(process.env.WATCH_FOLDER_RECURSIVE, true);
    this.pollSeconds = envInt(process.env.WATCH_FOLDER_POLL_SECONDS, 15);
    this.stableChecksRequired = envInt(process.env.WATCH_FOLDER_STABLE_CHECKS, 2);
    this.sharePathHint = String(
      process.env.WATCH_FOLDER_SMB_PATH
      || process.env.WATCH_FOLDER_SHARE_PATH
      || ''
    ).trim() || null;
  }

  async start(): Promise<void> {
    await this.loadConfigOverridesFromUserSettings();
    await this.restart();
  }

  async restart(): Promise<void> {
    this.stop();

    if (!this.enabled) {
      console.log('⏸️  Watch folder disabled');
      return;
    }
    if (!this.folderPath) {
      console.warn('⚠️  Watch folder enabled but WATCH_FOLDER_PATH is empty');
      return;
    }

    try {
      await fs.mkdir(this.folderPath, { recursive: true });
    } catch (error: any) {
      console.error('❌ Failed to initialize watch folder:', error?.message || error);
      return;
    }

    console.log(
      `👀 Watch folder enabled: ${this.folderPath} (recursive=${this.recursive}, poll=${this.pollSeconds}s, stableChecks=${this.stableChecksRequired})`
    );

    await this.scanOnce();
    this.timer = setInterval(() => {
      this.scanOnce().catch((error: any) => {
        this.stats.lastError = error?.message || String(error);
        console.error('❌ Watch folder scan failed:', this.stats.lastError);
      });
    }, this.pollSeconds * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async updateConfig(config: Partial<WatchFolderConfig>): Promise<void> {
    const previousPath = this.folderPath;

    if (config.enabled !== undefined) this.enabled = Boolean(config.enabled);
    if (config.path !== undefined) this.folderPath = String(config.path || '').trim();
    if (config.recursive !== undefined) this.recursive = Boolean(config.recursive);
    if (config.pollSeconds !== undefined) this.pollSeconds = Math.max(1, Math.floor(config.pollSeconds));
    if (config.stableChecksRequired !== undefined) this.stableChecksRequired = Math.max(1, Math.floor(config.stableChecksRequired));

    if (previousPath !== this.folderPath) {
      this.fileStates.clear();
      this.processed.clear();
      this.inFlight.clear();
    }

    await this.restart();
  }

  getConfig(): WatchFolderConfig {
    return {
      enabled: this.enabled,
      path: this.folderPath || '',
      recursive: this.recursive,
      pollSeconds: this.pollSeconds,
      stableChecksRequired: this.stableChecksRequired,
      sharePathHint: this.sharePathHint,
    };
  }

  async rescanNow(): Promise<void> {
    await this.scanOnce();
  }

  getStatus() {
    return {
      enabled: this.enabled,
      running: Boolean(this.timer),
      path: this.folderPath || null,
      recursive: this.recursive,
      pollSeconds: this.pollSeconds,
      stableChecksRequired: this.stableChecksRequired,
      sharePathHint: this.sharePathHint,
      inFlight: this.inFlight.size,
      trackedFiles: this.fileStates.size,
      stats: this.stats,
    };
  }

  private async loadConfigOverridesFromUserSettings(): Promise<void> {
    let db: DatabaseService | null = null;
    try {
      db = new DatabaseService();
      const profileResult = await db.query(
        'SELECT id FROM strava.user_profile WHERE is_active = true ORDER BY id LIMIT 1'
      );
      const userId = Number(profileResult.rows?.[0]?.id);
      if (!Number.isFinite(userId) || userId <= 0) return;

      const settingsResult = await db.query(
        `
          SELECT key, value
          FROM strava.user_settings
          WHERE user_id = $1
            AND key = ANY($2::text[])
        `,
        [userId, WATCH_SETTING_KEYS]
      );
      const settings = Object.fromEntries(
        settingsResult.rows.map((row: any) => [String(row.key), String(row.value ?? '')])
      ) as Record<string, string>;

      const enabled = parseOptionalBool(settings.watch_folder_enabled);
      if (enabled !== undefined) this.enabled = enabled;

      if (Object.prototype.hasOwnProperty.call(settings, 'watch_folder_path')) {
        this.folderPath = String(settings.watch_folder_path || '').trim();
      }

      const recursive = parseOptionalBool(settings.watch_folder_recursive);
      if (recursive !== undefined) this.recursive = recursive;

      if (Object.prototype.hasOwnProperty.call(settings, 'watch_folder_poll_seconds')) {
        this.pollSeconds = envInt(settings.watch_folder_poll_seconds, this.pollSeconds);
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'watch_folder_stable_checks')) {
        this.stableChecksRequired = envInt(settings.watch_folder_stable_checks, this.stableChecksRequired);
      }
    } catch (error: any) {
      console.warn('⚠️  Failed to load watch-folder settings from DB:', error?.message || error);
    } finally {
      if (db) {
        await db.close();
      }
    }
  }

  private async scanOnce(): Promise<void> {
    if (!this.enabled || !this.folderPath) return;
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const files = await this.listCandidateFiles(this.folderPath);
      this.stats.scans += 1;
      this.stats.scannedFiles += files.length;
      this.stats.lastScanAt = new Date().toISOString();

      for (const filePath of files) {
        await this.handleCandidate(filePath);
      }
    } finally {
      this.isScanning = false;
    }
  }

  private async handleCandidate(filePath: string): Promise<void> {
    if (this.inFlight.has(filePath)) return;

    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return;

    if (!isSupportedImportFilename(path.basename(filePath))) return;

    const lastProcessed = this.processed.get(filePath);
    if (lastProcessed && lastProcessed.size === stat.size && lastProcessed.mtimeMs === stat.mtimeMs) {
      return;
    }

    const state = this.fileStates.get(filePath);
    if (!state) {
      this.fileStates.set(filePath, { size: stat.size, stableChecks: 0 });
      return;
    }

    if (state.size === stat.size) {
      state.stableChecks += 1;
    } else {
      state.size = stat.size;
      state.stableChecks = 0;
      return;
    }

    if (state.stableChecks < this.stableChecksRequired) return;

    this.inFlight.add(filePath);
    try {
      const buffer = await fs.readFile(filePath);
      const db = new DatabaseService();
      try {
        const result = await importSingleFile(
          db,
          {
            originalname: path.basename(filePath),
            buffer,
            size: stat.size,
          },
          {
            type: 'watchfolder',
            source: 'watchfolder',
          }
        );

        this.stats.lastImportAt = new Date().toISOString();
        if (result.status === 'done') this.stats.importedFiles += 1;
        if (result.status === 'duplicate') this.stats.duplicates += 1;
        if (result.status === 'failed') this.stats.failed += 1;

        console.log(`📥 Watch import [${result.status}] ${path.basename(filePath)} -> ${result.message}`);
      } finally {
        await db.close();
      }
    } catch (error: any) {
      this.stats.failed += 1;
      this.stats.lastError = error?.message || String(error);
      console.error(`❌ Watch import failed for ${filePath}:`, this.stats.lastError);
    } finally {
      this.processed.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs });
      this.inFlight.delete(filePath);
      this.fileStates.delete(filePath);
    }
  }

  private async listCandidateFiles(baseDir: string): Promise<string[]> {
    const files: string[] = [];
    const walk = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (this.recursive) {
            await walk(fullPath);
          }
          continue;
        }
        if (entry.isFile()) {
          if (isSupportedImportFilename(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    };

    await walk(baseDir);
    return files;
  }
}

export const watchFolderService = new WatchFolderService();
