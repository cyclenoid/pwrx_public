import * as path from 'path';
import * as zlib from 'zlib';
import { ImportFormat } from './types';

const FIT_SIGNATURE = '.FIT';
const SUPPORTED_IMPORT_SUFFIXES = ['.fit', '.gpx', '.tcx', '.csv', '.fit.gz', '.gpx.gz', '.tcx.gz', '.csv.gz'] as const;
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

const hasSuffix = (filename: string, suffix: string): boolean =>
  String(filename || '').toLowerCase().endsWith(suffix);

const isGzipBuffer = (buffer: Buffer): boolean =>
  buffer.length >= 2 && buffer[0] === GZIP_MAGIC_0 && buffer[1] === GZIP_MAGIC_1;

const stripGzipSuffix = (filename: string): string => {
  const value = String(filename || '');
  if (!value.toLowerCase().endsWith('.gz')) return value;
  return value.slice(0, -3);
};

export const isSupportedImportFilename = (filename: string): boolean =>
  SUPPORTED_IMPORT_SUFFIXES.some((suffix) => hasSuffix(filename, suffix));

export const decodeImportBufferIfNeeded = (filename: string, buffer: Buffer): Buffer => {
  const lower = String(filename || '').toLowerCase();
  const shouldGunzip = lower.endsWith('.gz') || isGzipBuffer(buffer);
  if (!shouldGunzip) return buffer;

  try {
    return zlib.gunzipSync(buffer);
  } catch (error: any) {
    if (lower.endsWith('.gz') || isGzipBuffer(buffer)) {
      throw new Error(`GZIP decompress error: ${error?.message || 'invalid gzip payload'}`);
    }
    return buffer;
  }
};

export const detectImportFormat = (
  filename: string,
  buffer: Buffer,
  depth: number = 0
): ImportFormat | null => {
  if (hasSuffix(filename, '.fit.gz')) return 'fit';
  if (hasSuffix(filename, '.gpx.gz')) return 'gpx';
  if (hasSuffix(filename, '.tcx.gz')) return 'tcx';
  if (hasSuffix(filename, '.csv.gz')) return 'csv';

  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.fit') return 'fit';
  if (ext === '.gpx') return 'gpx';
  if (ext === '.tcx') return 'tcx';
  if (ext === '.csv') return 'csv';

  if (buffer.length >= 12 && buffer.toString('ascii', 8, 12) === FIT_SIGNATURE) {
    return 'fit';
  }

  const head = buffer.toString('utf8', 0, Math.min(buffer.length, 4096)).toLowerCase();
  if (head.includes('<gpx')) return 'gpx';
  if (head.includes('<trainingcenterdatabase')) return 'tcx';

  if (depth === 0 && (ext === '.gz' || isGzipBuffer(buffer))) {
    try {
      const unpacked = decodeImportBufferIfNeeded(filename, buffer);
      if (unpacked !== buffer) {
        return detectImportFormat(stripGzipSuffix(filename), unpacked, depth + 1);
      }
    } catch {
      // Let caller decide how to report invalid gzip payload.
    }
  }

  return null;
};
