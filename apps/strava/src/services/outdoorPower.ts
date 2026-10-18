import { createHash } from 'node:crypto';
import { surfaceMatcher, SurfaceRoute, Way } from './powerSurface';
import { outdoorCalories } from './outdoorCalories';

export const POWER_MODEL_VERSION = 'pwrx-outdoor-1';
export type PowerParameters = {
  riderKg: number; equipmentKg: number; tyres: 'road' | 'gravel' | 'mtb';
  posture: 'aero' | 'hoods' | 'upright'; condition: 'dry' | 'wet' | 'soft';
  surface: 'auto' | 'asphalt' | 'compacted' | 'gravel' | 'ground';
  routeId: string; windKmh: number; windFrom: number;
};
export type PowerActivity = {
  strava_activity_id: string | number; type: string; sport_type?: string; trainer?: boolean; indoor?: boolean;
  device_name?: string | null; average_watts?: string | number | null; calories?: string | number | null; updated_at?: string;
};
export type PowerStreams = { time?: number[]; distance?: number[]; altitude?: number[]; latlng?: [number, number][]; velocity_smooth?: number[] };

export function outdoorKind(activity: PowerActivity): 'ride' | 'run' | null {
  const types = [activity.type, activity.sport_type || ''];
  if (activity.trainer === true || activity.indoor === true || types.some(type => /virtual|indoor|ebike/i.test(type))
    || /zwift|rouvy|trainerroad|mywhoosh/i.test(activity.device_name || '')) return null;
  if (types.some(type => ['Run', 'TrailRun'].includes(type))) return 'run';
  if (types.some(type => ['Ride', 'GravelRide', 'MountainBikeRide'].includes(type))) return 'ride';
  return null;
}

export function powerParameters(value: unknown): PowerParameters | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as PowerParameters;
  if (![p.riderKg, p.equipmentKg, p.windKmh, p.windFrom].every(Number.isFinite)
    || p.riderKg < 25 || p.riderKg > 250 || p.equipmentKg < 0 || p.equipmentKg > 80
    || p.windKmh < 0 || p.windKmh > 80 || p.windFrom < 0 || p.windFrom >= 360
    || !['road', 'gravel', 'mtb'].includes(p.tyres) || !['aero', 'hoods', 'upright'].includes(p.posture)
    || !['dry', 'wet', 'soft'].includes(p.condition) || !['auto', 'asphalt', 'compacted', 'gravel', 'ground'].includes(p.surface)
    || typeof p.routeId !== 'string' || !/^(auto|none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(p.routeId)) return null;
  return { riderKg: p.riderKg, equipmentKg: p.equipmentKg, tyres: p.tyres, posture: p.posture,
    condition: p.condition, surface: p.surface, routeId: p.routeId, windKmh: p.windKmh, windFrom: p.windFrom };
}

export function preparePowerStreams(streams: PowerStreams) {
  const { time, distance, altitude, latlng } = streams;
  if (!time || time.length < 3 || time.length > 200000 || !distance || !altitude || !latlng
    || distance.length !== time.length || altitude.length !== time.length || latlng.length !== time.length) throw new Error('POWER_DATA_INSUFFICIENT');
  for (let i = 0; i < time.length; i++) {
    const ll = latlng[i];
    if (![time[i], distance[i], altitude[i]].every(Number.isFinite) || !Array.isArray(ll)
      || ll.length !== 2 || !ll.every(Number.isFinite) || Math.abs(ll[0]) > 85 || Math.abs(ll[1]) > 180
      || (i > 0 && (time[i] < time[i - 1] || distance[i] < distance[i - 1]))) throw new Error('POWER_DATA_INSUFFICIENT');
  }
  const intervals = time.map((t, i) => i > 0 && t > time[i - 1] && t - time[i - 1] <= 10);
  const supplied = streams.velocity_smooth;
  const raw = time.map((_, i) => supplied?.length === time.length && Number.isFinite(supplied[i]) && supplied[i] >= 0
    ? supplied[i] : intervals[i] ? (distance[i] - distance[i - 1]) / (time[i] - time[i - 1]) : 0);
  const velocity = raw.map((v, i) => {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(time.length - 1, i + 2); j++) {
      if (Math.abs(time[j] - time[i]) <= 3) { sum += raw[j]; count++; }
    }
    return count ? sum / count : v;
  });
  // Slopes are fitted over distance, so altitude noise at one GPS sample does not become a climb.
  const pre = Array.from({ length: 5 }, () => new Float64Array(time.length + 1));
  for (let i = 0; i < time.length; i++) {
    const x = distance[i], y = altitude[i];
    [1, x, y, x * x, x * y].forEach((v, k) => { pre[k][i + 1] = pre[k][i] + v; });
  }
  let left = 0, right = 0;
  const slope = distance.map(d => {
    while (left < distance.length && distance[left] < d - 50) left++;
    while (right < distance.length && distance[right] <= d + 50) right++;
    const [n, x, y, xx, xy] = pre.map(p => p[right] - p[left]);
    return n * xx - x * x > 1 ? (n * xy - x * y) / (n * xx - x * x) : 0;
  });
  return { time, distance, altitude, latlng, intervals, velocity, slope };
}

export function runningCost(grade: number): number {
  const i = Math.max(-0.45, Math.min(0.45, grade));
  // Minetti et al., J Appl Physiol 2002, DOI 10.1152/japplphysiol.01177.2001 (J/kg/m).
  return Math.max(1, 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6);
}

const rolling: Record<string, number> = { asphalt: .005, paved: .006, concrete: .0055, compacted: .008,
  fine_gravel: .01, gravel: .013, paving_stones: .009, cobblestone: .014, sett: .012,
  ground: .016, dirt: .016, earth: .016, unpaved: .014, grass: .02, sand: .03, mud: .035, unknown: .01 };
const runningSurface: Record<string, number> = { asphalt: 1, paved: 1, concrete: 1, compacted: 1.025,
  fine_gravel: 1.05, gravel: 1.1, paving_stones: 1.015, ground: 1.08, dirt: 1.08, earth: 1.08,
  unpaved: 1.08, grass: 1.12, sand: 1.3, mud: 1.25, unknown: 1.05 };

export function assessOutdoorPower(activity: PowerActivity, streams: PowerStreams, parameters: PowerParameters, route?: SurfaceRoute, prepared?: ReturnType<typeof preparePowerStreams>) {
  const kind = outdoorKind(activity);
  if (!kind) throw new Error('POWER_OUTDOOR_ONLY');
  const p = powerParameters(parameters);
  if (!p) throw new Error('POWER_INVALID_PARAMETERS');
  const data = prepared || preparePowerStreams(streams), { time, distance, latlng, intervals, velocity, slope } = data;
  const origin = { lat: latlng[0][0], lng: latlng[0][1] };
  const match = route && p.surface === 'auto' ? surfaceMatcher(route, origin) : undefined;
  const mass = p.riderKg + p.equipmentKg, cda = kind === 'run' ? .6 : { aero: .32, hoods: .45, upright: .6 }[p.posture];
  let seconds = 0, movingSeconds = 0, excludedSeconds = 0, meters = 0, matchedMeters = 0, knownMeters = 0, clippedSlopes = 0;
  const work = [0, 0, 0], surfaces: Record<string, number> = {};
  let metabolicWork = 0;
  const factors = [.75, 1, 1.35];
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1], ds = distance[i] - distance[i - 1];
    const v = (velocity[i - 1] + velocity[i]) / 2;
    if (!intervals[i] || v > (kind === 'run' ? 15 : 40) || ds / Math.max(dt, 1) > 50) { excludedSeconds += Math.max(0, dt); continue; }
    seconds += dt;
    if (v < .5 || ds < .01) continue;
    movingSeconds += dt; meters += ds;
    const point = { lat: (latlng[i][0] + latlng[i - 1][0]) / 2, lng: (latlng[i][1] + latlng[i - 1][1]) / 2 };
    const way: Way | undefined = match?.(point);
    if (way) matchedMeters += ds;
    const surface = p.surface === 'auto' ? (way?.surface || 'unknown') : p.surface;
    const known = surface !== 'unknown' && (kind === 'ride' ? rolling[surface] !== undefined : runningSurface[surface] !== undefined);
    if (known) knownMeters += ds;
    surfaces[surface] = (surfaces[surface] || 0) + ds;
    const grade = Math.max(kind === 'ride' ? -.25 : -.45, Math.min(kind === 'ride' ? .25 : .45, slope[i]));
    if (grade !== slope[i]) clippedSlopes++;
    const acceleration = (velocity[i] - velocity[i - 1]) / dt;
    const north = latlng[i][0] - latlng[i - 1][0], east = (latlng[i][1] - latlng[i - 1][1]) * Math.cos(point.lat * Math.PI / 180);
    const bearing = Math.atan2(east, north), windAngle = p.windFrom * Math.PI / 180 - bearing;
    const headwind = p.windKmh / 3.6 * Math.cos(windAngle), crosswind = p.windKmh / 3.6 * Math.sin(windAngle);
    const air = .5 * 1.225 * cda * Math.hypot(v + headwind, crosswind) * (v + headwind) * v;
    if (kind === 'ride') {
      const tyre = p.tyres === 'mtb' ? 1.25 : p.tyres === 'road' ? (['asphalt', 'paved', 'concrete'].includes(surface) ? .8 : 1.1) : 1;
      const condition = p.condition === 'soft' ? 1.5 : p.condition === 'wet' ? 1.15 : 1;
      const roughness = way?.smoothness === 'very_bad' ? 1.4 : way?.smoothness === 'bad' ? 1.2 : 1;
      const crr = Math.min(.06, (rolling[surface] || rolling.unknown) * tyre * condition * roughness);
      const gravity = mass * 9.80665 * Math.sin(Math.atan(grade)) * v, inertia = 1.03 * mass * acceleration * v;
      factors.forEach((factor, k) => {
        const spread = known ? factor : k === 0 ? .5 : k === 2 ? 1.8 : 1;
        const value = (mass * 9.80665 * crr * spread * v + air * (k === 0 ? .85 : k === 2 ? 1.15 : 1) + gravity + inertia) / .96;
        work[k] += Math.max(0, value) * dt;
      });
    } else {
      const condition = p.condition === 'soft' ? 1.15 : p.condition === 'wet' ? 1.04 : 1;
      const metabolic = mass * runningCost(grade) * v * (runningSurface[surface] || runningSurface.unknown) * condition;
      metabolicWork += metabolic * dt;
      // Running watts are an explicitly defined equivalent, not crank power or a device calibration.
      const mechanical = Math.max(0, mass * acceleration * v) + Math.max(0, air);
      factors.forEach((_, k) => { work[k] += (metabolic * .25 * (k === 0 ? .85 : k === 2 ? 1.2 : 1) + mechanical) * dt; });
    }
  }
  const spatialExtent = Math.max(...latlng.filter((_, i) => i % Math.max(1, Math.floor(latlng.length / 200)) === 0)
    .map(ll => Math.hypot((ll[0] - origin.lat) * 111195, (ll[1] - origin.lng) * 111195 * Math.cos(origin.lat * Math.PI / 180))));
  if (seconds < 30 || movingSeconds < 20 || meters < 50 || spatialExtent < 20) throw new Error('POWER_DATA_INSUFFICIENT');
  const sourceHash = createHash('sha256').update(JSON.stringify({ activity, streams })).digest('hex');
  const routeHash = route ? createHash('sha256').update(JSON.stringify(route)).digest('hex') : null;
  const fingerprint = createHash('sha256').update(JSON.stringify({ sourceHash, routeHash, p, version: POWER_MODEL_VERSION })).digest('hex');
  const original = Number(activity.average_watts);
  const assessment = {
    modelVersion: POWER_MODEL_VERSION, fingerprint, kind, parameters: p,
    watts: Math.round(work[1] / seconds), lowWatts: Math.round(work[0] / seconds), highWatts: Math.round(work[2] / seconds),
    originalWatts: Number.isFinite(original) && original > 0 ? original : null,
    metabolicWatts: kind === 'run' ? Math.round(metabolicWork / seconds) : null,
    seconds, movingSeconds, excludedSeconds, distanceM: Math.round(meters),
    surfaceCoverage: Math.round(knownMeters / meters * 100), matchedPercent: Math.round(matchedMeters / meters * 100),
    surfaces: Object.entries(surfaces).map(([surface, distanceM]) => ({ surface, distanceM: Math.round(distanceM), percent: Math.round(distanceM / meters * 1000) / 10 })).sort((a, b) => b.distanceM - a.distanceM),
    route: route ? { id: route.id, name: route.name, revision: route.revision } : null,
    source: { activityUpdatedAt: activity.updated_at, sourceHash, routeHash, streamSignature: null as string | null },
    warnings: [excludedSeconds > 0 ? 'GAPS' : '', knownMeters / meters < .8 ? 'SURFACE_ASSUMED' : '', clippedSlopes ? 'STEEP_SLOPES' : '', kind === 'run' ? 'RUNNING_EQUIVALENT' : ''].filter(Boolean),
  };
  return { ...assessment, calories: outdoorCalories(assessment, activity.calories) };
}

export type PowerAssessment = ReturnType<typeof assessOutdoorPower>;
