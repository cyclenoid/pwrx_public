export type Way = { surface?: string; highway?: string; tracktype?: string; smoothness?: string };
type Point = { lat: number; lng: number; way?: Way };

// BRouter messages aggregate tags up to their endpoint, not from it onwards.
// Match endpoints in travel order (including loops); never guess an unmatched range.
export function addRouteWays(points: Point[], messages: unknown): void {
  if (!Array.isArray(messages) || !Array.isArray(messages[0])) return;
  const header = messages[0];
  const lon = header.indexOf('Longitude'), lat = header.indexOf('Latitude'), tags = header.indexOf('WayTags');
  if (Math.min(lon, lat, tags) < 0) return;
  const indices = new Map<string, number[]>();
  const key = (lng: number, latitude: number) => `${Math.round(lng * 1e6)},${Math.round(latitude * 1e6)}`;
  points.forEach((p, i) => { const k = key(p.lng, p.lat); const list = indices.get(k) || []; list.push(i); indices.set(k, list); });
  let start = 0, uncertain = false;
  for (const row of messages.slice(1)) {
    if (!Array.isArray(row)) { uncertain = true; continue; }
    const lng = Number(row[lon]), latitude = Number(row[lat]);
    const end = indices.get(`${lng},${latitude}`)?.find(i => i >= start);
    if (end === undefined) { uncertain = true; continue; }
    const way: Way = {};
    if (typeof row[tags] === 'string') {
      for (const tag of row[tags].split(/\s+/)) {
        const [name, value] = tag.split('=');
        if (['surface', 'highway', 'tracktype', 'smoothness'].includes(name) && value && value.length <= 80) {
          way[name as keyof Way] = value;
        }
      }
    }
    if (!uncertain && Object.keys(way).length) {
      for (let i = start + 1; i <= end; i++) points[i].way = way;
    }
    start = end;
    uncertain = false;
  }
}
