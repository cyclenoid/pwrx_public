export type Coordinate = { lat: number; lng: number };
export type Way = { surface?: string; smoothness?: string; tracktype?: string; highway?: string };
export type SurfaceRoute = { id: string; name: string; revision: number; document: { draft: { legs: ({ source: string; points: (Coordinate & { way?: Way })[] } | null)[] } } };
type Edge = { ax: number; ay: number; bx: number; by: number; way?: Way };

export function surfaceMatcher(route: SurfaceRoute, origin: Coordinate) {
  const scale = Math.cos(origin.lat * Math.PI / 180) * 111195;
  const xy = (p: Coordinate) => [(p.lng - origin.lng) * scale, (p.lat - origin.lat) * 111195];
  const grid = new Map<string, Edge[]>();
  const uncertainCells = new Set<string>();
  let edges = 0;
  for (const leg of route.document.draft.legs) {
    if (!leg || leg.source !== 'routed') continue;
    for (let i = 1; i < leg.points.length; i++) {
      if (++edges > 160000) throw new Error('POWER_ROUTE_TOO_LARGE');
      const [ax, ay] = xy(leg.points[i - 1]), [bx, by] = xy(leg.points[i]);
      // Long gaps and invalid coordinates must never become matching road edges.
      const length = Math.hypot(bx - ax, by - ay);
      if (!Number.isFinite(length) || length < 0.01 || length > 500) continue;
      const edge = { ax, ay, bx, by, way: leg.points[i].way };
      for (let x = Math.floor(Math.min(ax, bx) / 100); x <= Math.floor(Math.max(ax, bx) / 100); x++) {
        for (let y = Math.floor(Math.min(ay, by) / 100); y <= Math.floor(Math.max(ay, by) / 100); y++) {
          const key = `${x},${y}`, items = grid.get(key) || [];
          if (items.length < 512) items.push(edge);
          else uncertainCells.add(key);
          grid.set(key, items);
        }
      }
      if (grid.size > 100000) throw new Error('POWER_ROUTE_TOO_LARGE');
    }
  }
  return (point: Coordinate): Way | undefined => {
    const [px, py] = xy(point), x = Math.floor(px / 100), y = Math.floor(py / 100);
    const candidates = new Set<Edge>();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (uncertainCells.has(`${x + dx},${y + dy}`)) return undefined;
      for (const edge of grid.get(`${x + dx},${y + dy}`) || []) candidates.add(edge);
    }
    let best = Infinity, way: Way | undefined;
    const nearby: { distance: number; surface?: string }[] = [];
    for (const edge of candidates) {
      const vx = edge.bx - edge.ax, vy = edge.by - edge.ay;
      const t = Math.max(0, Math.min(1, ((px - edge.ax) * vx + (py - edge.ay) * vy) / (vx * vx + vy * vy)));
      const distance = Math.hypot(px - edge.ax - t * vx, py - edge.ay - t * vy);
      if (distance <= 30) {
        nearby.push({ distance, surface: edge.way?.surface });
        if (distance < best) { best = distance; way = edge.way; }
      }
    }
    // Parallel ways and overlapping legs with conflicting tags remain uncertain.
    if (nearby.some(item => item.distance <= best + 5 && item.surface !== way?.surface)) return undefined;
    return way;
  };
}
