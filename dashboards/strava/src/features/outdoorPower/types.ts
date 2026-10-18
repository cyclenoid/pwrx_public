export type Parameters = {
  riderKg: number; equipmentKg: number; tyres: 'road' | 'gravel' | 'mtb'; posture: 'aero' | 'hoods' | 'upright';
  condition: 'dry' | 'wet' | 'soft'; surface: 'auto' | 'asphalt' | 'compacted' | 'gravel' | 'ground';
  routeId: string; windKmh: number; windFrom: number;
}
export type Assessment = {
  modelVersion: string; fingerprint: string; kind: 'ride' | 'run'; parameters: Parameters;
  watts: number; lowWatts: number; highWatts: number; originalWatts: number | null; metabolicWatts: number | null;
  calories: { modelVersion: string; method: string; kcal: number; lowKcal: number; highKcal: number; originalKcal: number | null; efficiency: number | null };
  seconds: number; movingSeconds: number; excludedSeconds: number; distanceM: number;
  surfaceCoverage: number; matchedPercent: number; surfaces: { surface: string; distanceM: number; percent: number }[];
  route: { id: string; name: string; revision: number } | null; warnings: string[];
}
export type Stored = { payload: Assessment; revision: number; updated_at: string; stale: boolean }
export type Context = { eligible: boolean; kind: 'ride' | 'run'; sufficient: boolean; defaults: Parameters; gearName: string | null;
  routes: { id: string; name: string; revision: number }[]; stored: Stored | null }
export type Activity = { strava_activity_id: number | string; type: string; sport_type?: string; trainer?: boolean; indoor?: boolean; gear_id?: string | null;
  device_name?: string | null; streams?: { latlng?: [number, number][] } }

export function canAssess(activity: Activity) {
  const types = [activity.type, activity.sport_type || ''];
  const points = activity.streams?.latlng || [];
  const valid = (p: [number, number]) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const first = points.find(valid);
  const moves = first && points.some((p, i) => valid(p) && i % Math.max(1, Math.floor(points.length / 200)) === 0 && Math.hypot(
    (p[0] - first[0]) * 111195, (p[1] - first[1]) * 111195 * Math.cos(first[0] * Math.PI / 180)) >= 20);
  return !!moves && !activity.trainer && !activity.indoor && !types.some(type => /virtual|indoor|ebike/i.test(type))
    && !/zwift|rouvy|trainerroad|mywhoosh/i.test(activity.device_name || '')
    && types.some(type => ['Ride', 'GravelRide', 'MountainBikeRide', 'Run', 'TrailRun'].includes(type))
    && (activity.streams?.latlng?.length || 0) >= 3;
}
