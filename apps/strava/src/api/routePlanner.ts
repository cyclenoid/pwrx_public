import { Router } from 'express';
import axios from 'axios';

const profiles = { road: 'fastbike', gravel: 'gravel', touring: 'trekking' } as const;
type Point = { lat: number; lng: number; ele?: number };

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
  return result;
}

// The endpoint is operator-controlled, never supplied by the browser.
export function createRoutePlannerRouter(getEndpoint = () => process.env.BROUTER_URL || '') {
  const router = Router();
  let active = 0;
  router.get('/status', (_req, res) => {
    res.json({ configured: Boolean(getEndpoint()), profiles: Object.keys(profiles) });
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
      // BRouter uses 400 for missing regional data, disconnected points and no route.
      res.status(status === 400 ? 422 : 502).json({
        code: status === 400 ? 'NO_ROUTE' : 'ROUTING_UNAVAILABLE',
      });
    } finally { active--; }
  });
  return router;
}
