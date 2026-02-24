import * as path from 'path';
import { parseFit } from './parsers/fitParser';
import { parseGpx } from './parsers/gpxParser';
import { parseTcx } from './parsers/tcxParser';
import { ActivityImportFormat, ParsedActivity } from './types';

const basenameWithoutExt = (filename: string): string => {
  const base = path.basename(filename || '');
  const ext = path.extname(base);
  return base.slice(0, Math.max(0, base.length - ext.length)) || 'Imported Activity';
};

export const parseActivity = async (
  format: ActivityImportFormat,
  buffer: Buffer,
  filename: string
): Promise<ParsedActivity> => {
  const fallbackName = basenameWithoutExt(filename);
  if (format === 'fit') return parseFit(buffer, fallbackName);
  if (format === 'gpx') return parseGpx(buffer, fallbackName);
  if (format === 'tcx') return parseTcx(buffer, fallbackName);
  throw new Error(`Unsupported import format: ${format}`);
};
