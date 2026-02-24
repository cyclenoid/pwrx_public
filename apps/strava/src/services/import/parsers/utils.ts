export const toFiniteNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const toDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const average = (values: number[]): number | undefined => {
  if (!values.length) return undefined;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
};

export const max = (values: number[]): number | undefined => {
  if (!values.length) return undefined;
  return Math.max(...values);
};

export const positiveElevationGain = (values: number[]): number | undefined => {
  if (values.length < 2) return undefined;
  let gain = 0;
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gain += delta;
  }
  return gain;
};

export const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const r = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
};

export const normalizeSportType = (raw?: string | null): { type: string; sportType: string } => {
  const trimmed = String(raw || '').trim();
  const value = trimmed.toLowerCase();
  if (value.includes('run')) return { type: 'Run', sportType: 'Run' };
  if (value.includes('swim')) return { type: 'Swim', sportType: 'Swim' };
  if (value.includes('walk') || value.includes('hike')) return { type: 'Walk', sportType: 'Walk' };
  if (value.includes('ride') || value.includes('bike') || value.includes('bik') || value.includes('cycl')) {
    return { type: 'Ride', sportType: 'Ride' };
  }
  // Avoid surfacing MIME types (e.g. "text/html") as sport_type when parsers pick up
  // generic metadata <type> tags.
  if (value.includes('/')) return { type: 'Workout', sportType: 'Workout' };
  return { type: 'Workout', sportType: trimmed || 'Workout' };
};
