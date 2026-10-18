import { Router, raw } from 'express';
import axios from 'axios';
import { MAX_FIT_BYTES, parseFitRoute } from '../services/fitRoute';
import { addRouteWays, Way } from '../services/routeWays';
import { routingCoverage, routingTile } from '../services/routingCoverage';

const profiles = { road: 'fastbike', gravel: 'gravel', touring: 'trekking' } as const;
type Point = { lat: number; lng: number; ele?: number; way?: Way };

export function validPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const p = value as Point;
  return Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
    && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
}

export function routingParams(body: unknown): URLSearchParams | null {
  if (!body || typeof body !== 'object') return null;
  const { points, profile } = body as { points?: unknown; profile?: unknown };
  if (!Array.isArray(points) || points.length < 2 || points.length > 80
    || !points.every(validPoint) || typeof profile !== 'string'
    || !Object.prototype.hasOwnProperty.call(profiles, profile)) return null;
  const params = new URLSearchParams({
    lonlats: points.map(p => `${p.lng},${p.lat}`).join('|'),
    profile: profiles[profile as keyof typeof profiles],
    alternativeidx: '0', format: 'geojson',
    'profile:processUnusedTags': '1',
  });
  if (profile === 'touring') {
    params.set('profile:stick_to_cycleroutes', '1');
    params.set('profile:allow_steps', '0');
  }
  if (profile === 'road') params.set('profile:allow_steps', '0');
  return params;
}

export function parseRoutingResponse(data: unknown): Point[] | null {
  const features = (data as { features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }> })?.features;
  if (!Array.isArray(features)) return null;
  const geometry = features.find(f => f?.geometry?.type === 'LineString')?.geometry;
  if (!Array.isArray(geometry?.coordinates) || geometry.coordinates.length < 2
    || geometry.coordinates.length > 150000) return null;
  const result: Point[] = [];
  for (const coord of geometry.coordinates) {
    if (!Array.isArray(coord)) return null;
    const point: Point = { lat: coord[1], lng: coord[0] };
    if (!validPoint(point)) return null;
    if (Number.isFinite(coord[2])) point.ele = coord[2];
    result.push(point);
  }
  const feature = (features.find(f => f?.geometry?.type === 'LineString') as { properties?: { messages?: unknown } });
  addRouteWays(result, feature?.properties?.messages);
  return result;
}

// The endpoint is operator-controlled, never supplied by the browser.
export function createRoutePlannerRouter(getEndpoint = () => process.env.BROUTER_URL || '') {
  const router = Router();
  let active = 0;
  let imports = 0;
  const readFit = raw({ type: 'application/octet-stream', limit: MAX_FIT_BYTES, inflate: false });
  router.post('/import-fit', (req, res) => {
    if (!req.is('application/octet-stream')) { res.status(415).json({ code: 'INVALID_FIT' }); return; }
    if (imports >= 2) { res.status(429).json({ code: 'FIT_BUSY' }); return; }
    imports++;
    const abort = new AbortController();
    let released = false;
    const release = () => { if (!released) { released = true; imports--; } };
    res.once('close', () => { abort.abort(); release(); });
    readFit(req, res, async error => {
      try {
        if (error) {
          res.status(error.type === 'entity.too.large' ? 413 : 400)
            .json({ code: error.type === 'entity.too.large' ? 'FIT_SIZE' : 'INVALID_FIT' });
          return;
        }
        if (!Buffer.isBuffer(req.body)) { res.status(400).json({ code: 'INVALID_FIT' }); return; }
        const segments = await parseFitRoute(req.body, abort.signal);
        res.json({ segments });
      } catch (reason) {
        if (abort.signal.aborted) return;
        const code = reason instanceof Error ? reason.message : 'INVALID_FIT';
        const allowed = ['FIT_SIZE', 'FIT_NO_GPS', 'FIT_SEGMENTS', 'INVALID_FIT'];
        res.status(code === 'FIT_SIZE' ? 413 : 422).json({ code: allowed.includes(code) ? code : 'INVALID_FIT' });
      } finally { release(); }
    });
  });
  router.get('/status', (_req, res) => {
    res.json({ configured: Boolean(getEndpoint()), profiles: Object.keys(profiles) });
  });
  router.get('/coverage', async (_req, res) => {
    res.set('Cache-Control', 'private, no-cache').json(await routingCoverage());
  });
  router.post('/calculate', async (req, res) => {
    const params = routingParams(req.body);
    if (!params) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
    const endpoint = getEndpoint();
    if (!endpoint) { res.status(503).json({ code: 'ROUTING_NOT_CONFIGURED' }); return; }
    if (active >= 2) { res.status(429).json({ code: 'ROUTING_BUSY' }); return; }
    active++;
    try {
      const response = await axios.get(endpoint, {
        params, timeout: 30000, maxContentLength: 20 * 1024 * 1024,
        maxRedirects: 0, responseType: 'json',
      });
      const points = parseRoutingResponse(response.data);
      if (!points) { res.status(502).json({ code: 'INVALID_ROUTE_RESPONSE' }); return; }
      res.json({ points });
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const body = axios.isAxiosError(error) ? error.response?.data : undefined;
      const missing = typeof body === 'string' && body.match(/\b[EW]\d{1,3}_[NS]\d{1,2}\.rd5\b/)?.[0];
      if (status === 400 && missing && routingTile(missing) && /not found|does not exist|missing/i.test(body)) {
        res.status(422).json({ code: 'ROUTING_REGION_MISSING', tile: missing });
        return;
      }
      // BRouter uses 400 for missing regional data, disconnected points and no route.
      res.status(status === 400 ? 422 : 502).json({
        code: status === 400 ? 'NO_ROUTE' : 'ROUTING_UNAVAILABLE',
      });
    } finally { active--; }
  });
  return router;
}
