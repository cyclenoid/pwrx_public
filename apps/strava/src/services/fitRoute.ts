import { Worker } from 'node:worker_threads';

type Point = { lat: number; lng: number; ele?: number };
type RecordPoint = { position_lat?: number; position_long?: number; altitude?: number; enhanced_altitude?: number };
export const MAX_FIT_BYTES = 10 * 1024 * 1024;

function crc(bytes: Buffer): number {
  let value = 0;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xa001 : 0);
  }
  return value;
}

export function fitSegments(records: RecordPoint[]): Point[][] {
  if (records.length > 150000) throw new Error('FIT_SIZE');
  const segments: Point[][] = [];
  let current: Point[] = [];
  for (const record of records) {
    const lat = record?.position_lat, lng = record?.position_long;
    // fit-file-parser already converts semicircles into degrees. Never convert twice.
    if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90
      || typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180) {
      if (current.length) { segments.push(current); current = []; }
      continue;
    }
    const point: Point = { lat, lng };
    const elevation = Number.isFinite(record.enhanced_altitude) ? record.enhanced_altitude : record.altitude;
    if (typeof elevation === 'number' && Number.isFinite(elevation)) point.ele = elevation;
    current.push(point);
  }
  if (current.length) segments.push(current);
  if (!segments.some(segment => segment.length >= 2)) throw new Error('FIT_NO_GPS');
  if (segments.length > 30) throw new Error('FIT_SEGMENTS');
  return segments;
}

export async function parseFitRoute(buffer: Buffer, signal?: AbortSignal): Promise<Point[][]> {
  if (buffer.length > MAX_FIT_BYTES) throw new Error('FIT_SIZE');
  const header = buffer[0];
  if (buffer.length < 14 || ![12, 14].includes(header)
    || buffer.toString('ascii', 8, 12) !== '.FIT'
    || header + buffer.readUInt32LE(4) + 2 !== buffer.length
    || crc(buffer.subarray(0, -2)) !== buffer.readUInt16LE(buffer.length - 2)
    || (header === 14 && buffer.readUInt16LE(12) !== 0 && crc(buffer.subarray(0, 14)) !== 0)) {
    throw new Error('INVALID_FIT');
  }
  if (signal?.aborted) throw new Error('FIT_CANCELLED');
  // Untrusted binary parsing is isolated so malformed files cannot block the API.
  const records = await new Promise<RecordPoint[]>((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      try {
        const mod = require(workerData.parser);
        const Parser = typeof mod === 'function' ? mod : mod.default || mod.FitParser;
        // Header/length/CRC were validated by the caller. force:false silently
        // returns without a callback for some optional-header CRC variants.
        const parser = new Parser({ force: true, lengthUnit: 'm', mode: 'list' });
        parser.parse(Buffer.from(workerData.buffer), (error, data) => {
          if (error || !data) return parentPort.postMessage({ code: 'INVALID_FIT' });
          const records = Array.isArray(data.records) ? data.records : [];
          if (records.length > 150000) return parentPort.postMessage({ code: 'FIT_SIZE' });
          parentPort.postMessage({ records: records.map(r => ({
            position_lat: r.position_lat, position_long: r.position_long,
            altitude: r.altitude, enhanced_altitude: r.enhanced_altitude,
          })) });
        });
      } catch { parentPort.postMessage({ code: 'INVALID_FIT' }); }
    `, {
      eval: true, workerData: { buffer, parser: require.resolve('fit-file-parser') },
      resourceLimits: { maxOldGenerationSizeMb: 128 }, stdout: true, stderr: true,
    });
    let settled = false;
    const finish = (error?: string, result?: RecordPoint[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      void worker.terminate();
      if (error) reject(new Error(error)); else resolve(result!);
    };
    const cancel = () => finish('FIT_CANCELLED');
    const timer = setTimeout(() => finish('INVALID_FIT'), 10000);
    worker.stdout.resume(); worker.stderr.resume();
    signal?.addEventListener('abort', cancel, { once: true });
    worker.once('message', data => finish(data.code, data.records));
    worker.once('error', () => finish('INVALID_FIT'));
    worker.once('exit', () => finish('INVALID_FIT'));
  });
  return fitSegments(records);
}
