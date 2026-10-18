import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export function routingTile(name: string) {
  const match = /^([EW])(\d{1,3})_([NS])(\d{1,2})\.rd5$/.exec(name);
  if (!match) return null;
  const lng = Number(match[2]) * (match[1] === 'W' ? -1 : 1);
  const lat = Number(match[4]) * (match[3] === 'S' ? -1 : 1);
  if (lng < -180 || lng >= 180 || lat < -90 || lat >= 90 || lng % 5 || lat % 5) return null;
  return { name, bounds: [[lat, lng], [lat + 5, lng + 5]] };
}

export async function routingCoverage(directory = process.env.BROUTER_SEGMENTS_DIR || '') {
  if (!directory) return { status: 'unknown', tiles: [] };
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const tiles = [];
    for (const entry of entries) {
      const tile = entry.isFile() && routingTile(entry.name);
      if (!tile) continue;
      const info = await stat(path.join(directory, entry.name));
      if (info.size > 0) tiles.push({ ...tile, bytes: info.size, updatedAt: info.mtime.toISOString() });
    }
    tiles.sort((a, b) => a.name.localeCompare(b.name));
    return { status: 'known', tiles };
  } catch { return { status: 'unavailable', tiles: [] }; }
}
