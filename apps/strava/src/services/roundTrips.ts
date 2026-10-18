import type { Way } from './routeWays';

export type TripPoint = { lat: number; lng: number; ele?: number; way?: Way };
export type TripInput = { start: TripPoint; lengthKm: number; profile: 'road' | 'gravel' | 'touring' | 'mtb'; terrain: 'flat' | 'hilly' | 'mountain'; variation: number };
export function roundTripInput(value: unknown): TripInput | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as TripInput, p = v.start;
  if (!p || !Number.isFinite(p.lat) || Math.abs(p.lat) > 80 || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180
    || !Number.isFinite(v.lengthKm) || v.lengthKm < 10 || v.lengthKm > 200
    || !['road', 'gravel', 'touring', 'mtb'].includes(v.profile) || !['flat', 'hilly', 'mountain'].includes(v.terrain)
    || !Number.isSafeInteger(v.variation) || v.variation < 0 || v.variation > 999) return null;
  return { start: { lat: p.lat, lng: p.lng }, lengthKm: v.lengthKm, profile: v.profile, terrain: v.terrain, variation: v.variation };
}
export function tripDistance(a: TripPoint, b: TripPoint) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function tripStats(points: TripPoint[]) {
  let meters = 0, ascent = 0, complete = true, repeated = 0;
  const surfaces = { asphalt: 0, paved: 0, gravel: 0, natural: 0, unknown: 0 };
  const edges = new Set<string>(), cells = new Set<string>();
  const coordinate = (p: TripPoint) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  let nextSample = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], ds = tripDistance(a, b);
    if (!Number.isFinite(ds) || ds > 10000 || meters + ds > 600000) throw new Error('INVALID_ROUTE_RESPONSE');
    const edge = [coordinate(a), coordinate(b)].sort().join('|');
    if (edges.has(edge)) repeated += ds; else edges.add(edge);
    // Distance-spaced spatial coverage makes reverse/near-identical routes duplicates too.
    while (nextSample <= meters + ds && ds > 0) {
      const fraction = Math.max(0, (nextSample - meters) / ds);
      const lat = a.lat + (b.lat - a.lat) * fraction, lng = a.lng + (b.lng - a.lng) * fraction;
      cells.add(`${Math.round(lat * 111195 / 150)},${Math.round(lng * 111195 * Math.cos(points[0].lat * Math.PI / 180) / 150)}`);
      nextSample += 100;
    }
    meters += ds;
    if (a.ele === undefined || b.ele === undefined) complete = false;
    else ascent += Math.max(0, b.ele - a.ele);
    const s = b.way?.surface;
    const key = s === 'asphalt' ? 'asphalt' : ['paved', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'sett', 'cobblestone'].includes(s || '') ? 'paved'
      : ['gravel', 'fine_gravel', 'compacted', 'pebblestone'].includes(s || '') ? 'gravel'
        : ['ground', 'dirt', 'earth', 'grass', 'sand', 'mud', 'unpaved', 'woodchips'].includes(s || '') ? 'natural' : 'unknown';
    surfaces[key] += ds;
  }
  return { meters, ascent: complete ? ascent : null, surfaces, repeatedRatio: meters ? repeated / meters : 0, cells };
}
type Stats = ReturnType<typeof tripStats>;
export function tripOverlap(a: Set<string>, b: Set<string>) {
  let matches = 0;
  for (const key of a) if (b.has(key)) matches++;
  return matches / Math.max(1, Math.min(a.size, b.size));
}
export function tripScore(stats: Stats, input: TripInput) {
  const deviation = Math.abs(stats.meters / (input.lengthKm * 1000) - 1);
  const density = stats.ascent === null ? null : stats.ascent / (stats.meters / 1000);
  const target = { flat: 3, hilly: 12, mountain: 25 }[input.terrain];
  return deviation * 5 + (density === null ? 1 : Math.abs(density - target) / 25) + stats.repeatedRatio;
}

export async function generateRoundTrips(input: TripInput,
  calculate: (radius: number, bearing: number, signal: AbortSignal) => Promise<TripPoint[]>, signal: AbortSignal) {
  const deadline = Date.now() + 65000;
  const candidates: { points: TripPoint[]; stats: Stats; score: number; bearing: number; radius: number }[] = [];
  const missingTiles = new Set<string>();
  let failures = 0;
  const radius = Math.round(input.lengthKm * 1000 / 6);
  const tasks = [0, 90, 180, 270].map(offset => ({ radius, bearing: (input.variation * 47 + offset) % 360 }));
  for (let attempt = 0; attempt < 6; attempt++) {
    if (signal.aborted || Date.now() >= deadline) break;
    // Refine two promising directions once; never do an unbounded length search.
    if (attempt === 4) {
      const best = [...candidates].sort((a, b) => a.score - b.score).slice(0, 2);
      for (const c of best) if (Math.abs(c.stats.meters / (input.lengthKm * 1000) - 1) > .1) tasks.push({
        radius: Math.round(Math.max(1000, Math.min(45000, c.radius * input.lengthKm * 1000 / c.stats.meters))), bearing: c.bearing,
      });
    }
    const task = tasks[attempt];
    if (!task) break;
    try {
      const points = await calculate(task.radius, task.bearing, AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now())))]));
      if (points.length < 3 || points.length > 50000 || tripDistance(points[0], points.at(-1)!) > 30
        || tripDistance(input.start, points[0]) > 300) { failures++; continue; }
      const stats = tripStats(points);
      if (stats.meters < input.lengthKm * 1000 * .4 || stats.meters > input.lengthKm * 1000 * 2.5) { failures++; continue; }
      candidates.push({ points, stats, score: tripScore(stats, input), ...task });
    } catch (e) {
      failures++;
      const tile = /^ROUTING_REGION_MISSING:([EW]\d{1,3}_[NS]\d{1,2}\.rd5)$/.exec(e instanceof Error ? e.message : '')?.[1];
      if (tile) missingTiles.add(tile);
    }
  }
  const selected: typeof candidates = [];
  for (const candidate of candidates.sort((a, b) => a.score - b.score)) {
    if (selected.every(other => tripOverlap(candidate.stats.cells, other.stats.cells) < .8)) selected.push(candidate);
    if (selected.length === 3) break;
  }
  if (!selected.length) throw new Error(missingTiles.size ? `ROUTING_REGION_MISSING:${[...missingTiles][0]}` : 'NO_ROUND_TRIP');
  return { missingTiles: [...missingTiles], partial: selected.length < 3 || failures > 0,
    routes: selected.map((c, i) => {
      const density = c.stats.ascent === null ? null : c.stats.ascent / (c.stats.meters / 1000);
      const elevationMatch = density !== null && (input.terrain === 'flat' ? density <= 8 : input.terrain === 'hilly' ? density >= 5 && density <= 20 : density >= 18);
      return { id: String(i + 1), points: c.points, meters: Math.round(c.stats.meters), ascent: c.stats.ascent === null ? null : Math.round(c.stats.ascent),
        durationMinutes: Math.round((c.stats.meters / 1000 / { road: 24, gravel: 17, touring: 19, mtb: 13 }[input.profile] + (c.stats.ascent || 0) / 600) * 60),
        surfaces: Object.fromEntries(Object.entries(c.stats.surfaces).map(([key, meters]) => [key, Math.round(meters / c.stats.meters * 100)])),
        warnings: [Math.abs(c.stats.meters / (input.lengthKm * 1000) - 1) > .15 ? 'LENGTH' : '', !elevationMatch ? 'ELEVATION' : '',
          c.stats.surfaces.unknown / c.stats.meters > .2 ? 'SURFACE' : '', c.stats.repeatedRatio > .25 ? 'REPEATED' : ''].filter(Boolean),
      };
    }),
  };
}
