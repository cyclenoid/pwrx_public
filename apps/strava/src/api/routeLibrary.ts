import { Router, json, ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

type Point = { lat: number; lng: number; ele?: number; way?: Record<string, string> };
type Document = { draft: { name: string; anchors: Point[]; legs: ({ source: string; points: Point[] } | null)[] }; profile: string; mode: string };
type Row = { id: string; name: string; revision: number; distance_m: number; updated_at: string; document?: Document };
export type RouteDatabase = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const summary = 'id, name, revision, distance_m, updated_at';

function point(p: Point): boolean {
  return !!p && typeof p === 'object' && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
    && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 && (p.ele === undefined || Number.isFinite(p.ele))
    && (p.way === undefined || (!!p.way && typeof p.way === 'object' && !Array.isArray(p.way)
      && Object.entries(p.way).every(([k, v]) => ['surface', 'highway', 'tracktype', 'smoothness'].includes(k)
        && typeof v === 'string' && v.length <= 80)));
}

export function validDocument(value: unknown): value is Document {
  if (!value || typeof value !== 'object') return false;
  const { draft: d, profile, mode } = value as Document;
  if (!['road', 'gravel', 'touring'].includes(profile) || !['direct', 'routed'].includes(mode)
    || !d || typeof d.name !== 'string' || !d.name.trim() || d.name.length > 200
    || !Array.isArray(d.anchors) || d.anchors.length < 2 || d.anchors.length > 80 || !d.anchors.every(point)
    || !Array.isArray(d.legs) || d.legs.length !== d.anchors.length - 1 || !d.legs.some(Boolean)) return false;
  let total = 0;
  return d.legs.every(leg => {
    if (leg === null) return true;
    if (!leg || !['imported', 'routed', 'direct'].includes(leg.source) || !Array.isArray(leg.points) || leg.points.length < 2) return false;
    total += leg.points.length;
    return total <= 160000 && leg.points.every(point);
  });
}

export function documentDistance(document: Document): number {
  let sum = 0;
  const rad = Math.PI / 180;
  for (const leg of document.draft.legs) {
    if (!leg) continue;
    for (let i = 1; i < leg.points.length; i++) {
      const a = leg.points[i - 1], b = leg.points[i];
      const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
        + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
      sum += 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
    }
  }
  return sum;
}

export function routePreview(document: Document) {
  const legs = document.draft.legs.filter(leg => leg !== null);
  const total = legs.reduce((sum, leg) => sum + leg.points.length, 0);
  const budget = Math.max(0, 1000 - legs.length * 2);
  let south = 90, west = 180, north = -90, east = -180;
  const segments = legs.map(leg => {
    for (const p of leg.points) {
      south = Math.min(south, p.lat); north = Math.max(north, p.lat);
      west = Math.min(west, p.lng); east = Math.max(east, p.lng);
    }
    // Bound preview size, retain both endpoints and keep every leg separate.
    const count = Math.min(leg.points.length, 2 + Math.floor(budget * leg.points.length / total));
    return Array.from({ length: count }, (_, i) => {
      const p = leg.points[Math.round(i * (leg.points.length - 1) / (count - 1))];
      return [p.lat, p.lng];
    });
  });
  return { segments, bounds: segments.length ? [[south, west], [north, east]] : null };
}

export function createRouteLibraryRouter(db: RouteDatabase) {
  const router = Router();
  router.use(json({ limit: '20mb' }));
  router.param('id', (_req, res, next, id) => { if (!uuid.test(id)) res.status(400).json({ code: 'INVALID_ROUTE_ID' }); else next(); });
  router.get('/', async (req, res, next) => {
    try {
      const offset = Number(req.query.offset || 0);
      if (!Number.isSafeInteger(offset) || offset < 0) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
      const search = String(req.query.search || '').slice(0, 200);
      const result = await db.query(`SELECT ${summary} FROM saved_routes WHERE strpos(lower(name), lower($1)) > 0 ORDER BY updated_at DESC, id LIMIT 51 OFFSET $2`, [search, offset]);
      res.json({ routes: result.rows.slice(0, 50), more: result.rows.length > 50 });
    } catch (e) { next(e); }
  });
  router.get('/:id/preview', async (req, res, next) => {
    try {
      const result = await db.query(`SELECT ${summary}, document FROM saved_routes WHERE id=$1`, [req.params.id]);
      const row = result.rows[0];
      if (!row?.document) { res.status(404).json({ code: 'ROUTE_NOT_FOUND' }); return; }
      res.set('Cache-Control', 'private, no-cache').json(routePreview(row.document));
    } catch (e) { next(e); }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const result = await db.query(`SELECT ${summary}, document FROM saved_routes WHERE id=$1`, [req.params.id]);
      if (!result.rows.length) { res.status(404).json({ code: 'ROUTE_NOT_FOUND' }); return; }
      res.json(result.rows[0]);
    } catch (e) { next(e); }
  });
  for (const method of ['post', 'put'] as const) router[method](method === 'post' ? '/' : '/:id', async (req, res, next) => {
    try {
      const revision = req.body?.revision;
      if (!validDocument(req.body)) { res.status(400).json({ code: 'INVALID_ROUTE' }); return; }
      if (method === 'put' && (!Number.isSafeInteger(revision) || revision < 1)) { res.status(400).json({ code: 'INVALID_REVISION' }); return; }
      const document = { draft: req.body.draft, profile: req.body.profile, mode: req.body.mode };
      const values = [('id' in req.params ? req.params.id : undefined) || randomUUID(), document.draft.name.trim(), JSON.stringify(document), documentDistance(document)];
      const result = method === 'post'
        ? await db.query(`INSERT INTO saved_routes (id, name, document, distance_m) VALUES ($1,$2,$3::jsonb,$4) RETURNING ${summary}`, values)
        : await db.query(`UPDATE saved_routes SET name=$2, document=$3::jsonb, distance_m=$4, revision=revision+1, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND revision=$5 RETURNING ${summary}`, [...values, revision]);
      if (!result.rows.length) { res.status(409).json({ code: 'ROUTE_CONFLICT' }); return; }
      res.status(method === 'post' ? 201 : 200).json(result.rows[0]);
    } catch (e) { next(e); }
  });
  router.delete('/:id', async (req, res, next) => {
    try {
      const revision = Number(req.query.revision);
      if (!Number.isSafeInteger(revision) || revision < 1) { res.status(400).json({ code: 'INVALID_REVISION' }); return; }
      const result = await db.query('DELETE FROM saved_routes WHERE id=$1 AND revision=$2 RETURNING id', [req.params.id, revision]);
      if (!result.rows.length) { res.status(409).json({ code: 'ROUTE_CONFLICT' }); return; }
      res.status(204).end();
    } catch (e) { next(e); }
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500)
      .json({ code: error.type === 'entity.too.large' ? 'ROUTE_TOO_LARGE' : 'ROUTE_STORAGE_ERROR' });
  };
  router.use(errors);
  return router;
}
