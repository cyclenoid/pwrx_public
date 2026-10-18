import { Router } from 'express';
import { createHash } from 'node:crypto';
import { assessOutdoorPower, outdoorKind, powerParameters, preparePowerStreams, PowerActivity, PowerAssessment, PowerParameters, PowerStreams } from '../services/outdoorPower';
import { surfaceMatcher, SurfaceRoute } from '../services/powerSurface';
import { outdoorCalories } from '../services/outdoorCalories';

type DB = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
type Meta = { id: string; name: string; revision: number; start_lat: number; start_lng: number };
type Stored = { payload: PowerAssessment; revision: number; updated_at: string };
type ActivityRow = { activity: PowerActivity; gear_name?: string };
const streamSignature = (rows: Record<string, unknown>[]) => createHash('sha256')
  .update(JSON.stringify(rows.map(row => [row.stream_type, row.signature]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest('hex');

export function createPowerAssessmentsRouter(db: DB) {
  const router = Router();
  let active = 0;
  router.param('id', (_req, res, next, id) => {
    if (!/^-?\d{1,15}$/.test(id) || !Number.isSafeInteger(Number(id))) res.status(400).json({ code: 'POWER_INVALID_ID' }); else next();
  });
  const base = async (id: string) => {
    const result = await db.query('SELECT to_jsonb(a) AS activity, g.name AS gear_name FROM activities a LEFT JOIN gear g ON g.id=a.gear_id WHERE a.strava_activity_id=$1', [id]);
    if (!result.rows.length) throw new Error('POWER_NOT_FOUND');
    return result.rows[0] as unknown as ActivityRow;
  };
  const routes = async () => (await db.query(`SELECT id, name, revision,
    (document->'draft'->'anchors'->0->>'lat')::double precision AS start_lat,
    (document->'draft'->'anchors'->0->>'lng')::double precision AS start_lng
    FROM saved_routes ORDER BY updated_at DESC LIMIT 100`)).rows as unknown as Meta[];
  const stored = async (id: string) => (await db.query('SELECT payload, revision, updated_at FROM activity_power_assessments WHERE activity_id=$1', [id])).rows[0] as unknown as Stored | undefined;
  const calculate = async (id: string, value: unknown) => {
    const parameters = powerParameters(value);
    if (!parameters) throw new Error('POWER_INVALID_PARAMETERS');
    const { activity } = await base(id);
    if (!outdoorKind(activity)) throw new Error('POWER_OUTDOOR_ONLY');
    const result = await db.query(`SELECT stream_type, data, md5(data::text) AS signature FROM activity_streams WHERE activity_id=$1
      AND stream_type IN ('time','distance','altitude','latlng','velocity_smooth') ORDER BY stream_type`, [id]);
    const streams = Object.fromEntries(result.rows.map(row => [row.stream_type, row.data])) as PowerStreams;
    const prepared = preparePowerStreams(streams);
    let chosen: SurfaceRoute | undefined;
    if (parameters.surface === 'auto' && parameters.routeId !== 'none' && streams.latlng?.length) {
      const first = streams.latlng[0];
      let ids: string[];
      if (parameters.routeId === 'auto') {
        ids = (await routes()).filter(row => Number.isFinite(row.start_lat) && Number.isFinite(row.start_lng))
          .map(row => ({ ...row, distance: Math.hypot((row.start_lat - first[0]) * 111195, (row.start_lng - first[1]) * 111195 * Math.cos(first[0] * Math.PI / 180)) }))
          .filter(row => row.distance < 20000).sort((a, b) => a.distance - b.distance).slice(0, 3).map(row => row.id);
      } else ids = [parameters.routeId];
      let best = .3;
      for (const routeId of ids) {
        const row = (await db.query('SELECT id, name, revision, document FROM saved_routes WHERE id=$1', [routeId])).rows[0] as unknown as SurfaceRoute | undefined;
        if (!row) { if (parameters.routeId !== 'auto') throw new Error('POWER_ROUTE_NOT_FOUND'); continue; }
        if (parameters.routeId !== 'auto') { chosen = row; break; }
        const match = surfaceMatcher(row, { lat: first[0], lng: first[1] });
        let matches = 0, count = 0;
        const distances = streams.distance;
        if (distances?.length === streams.latlng.length) {
          const spacing = Math.max(50, (distances.at(-1)! - distances[0]) / 200);
          let next = distances[0];
          for (let i = 0; i < distances.length; i++) if (distances[i] >= next) {
            count++; if (match({ lat: streams.latlng[i][0], lng: streams.latlng[i][1] })) matches++;
            next = distances[i] + spacing;
          }
        }
        if (count && matches / count > best) { chosen = row; best = matches / count; }
      }
    }
    const assessment = assessOutdoorPower(activity, streams, parameters, chosen, prepared);
    assessment.source.streamSignature = streamSignature(result.rows);
    return assessment;
  };
  const fail = (res: import('express').Response, error: unknown) => {
    const code = error instanceof Error ? error.message : '';
    const allowed: Record<string, number> = { POWER_NOT_FOUND: 404, POWER_ROUTE_NOT_FOUND: 404, POWER_OUTDOOR_ONLY: 422,
      POWER_DATA_INSUFFICIENT: 422, POWER_INVALID_PARAMETERS: 400, POWER_STALE: 409, POWER_CONFLICT: 409, POWER_ROUTE_TOO_LARGE: 422 };
    res.status(allowed[code] || 500).json({ code: allowed[code] ? code : 'POWER_FAILED' });
  };
  router.get('/:id', async (req, res) => {
    try {
      const { activity, gear_name } = await base(req.params.id);
      const kind = outdoorKind(activity);
      if (!kind) { res.json({ eligible: false, reason: 'POWER_OUTDOOR_ONLY' }); return; }
      const inventory = (await db.query(`SELECT stream_type, jsonb_array_length(data) AS length, md5(data::text) AS signature FROM activity_streams
        WHERE activity_id=$1 AND stream_type IN ('time','distance','altitude','latlng','velocity_smooth') ORDER BY stream_type`, [req.params.id])).rows;
      const lengths = Object.fromEntries(inventory.map(row => [row.stream_type, Number(row.length)]));
      const sufficient = lengths.time >= 3 && lengths.time <= 200000 && ['distance', 'altitude', 'latlng'].every(key => lengths[key] === lengths.time);
      const weight = (await db.query("SELECT value FROM user_settings WHERE key='athlete_weight' LIMIT 1")).rows[0]?.value;
      const kg = typeof weight === 'string' || typeof weight === 'number' ? Number(String(weight).replace(',', '.')) : NaN;
      const gravel = /gravel|grizl/i.test(gear_name || ''), mtb = /mountain|mtb|cirex|spectral|hardtail/i.test(gear_name || '');
      const defaults: PowerParameters = { riderKg: Number.isFinite(kg) && kg >= 25 && kg <= 250 ? kg : 0,
        equipmentKg: kind === 'run' ? .5 : gravel ? 14 : mtb ? 16 : 10, tyres: mtb ? 'mtb' : gravel ? 'gravel' : 'road',
        posture: 'hoods', condition: 'dry', surface: 'auto', routeId: 'auto', windKmh: 0, windFrom: 0 };
      const available = await routes(), saved = await stored(req.params.id);
      const route = saved?.payload.route;
      let currentRoute = route && available.find(row => row.id === route.id);
      if (route && !currentRoute) {
        const row = (await db.query('SELECT id, name, revision FROM saved_routes WHERE id=$1', [route.id])).rows[0] as unknown as Meta | undefined;
        if (row) { currentRoute = row; available.push(row); }
      }
      const stale = !!saved && (new Date(saved.payload.source.activityUpdatedAt || 0).getTime() !== new Date(activity.updated_at || 0).getTime()
        || saved.payload.source.streamSignature !== streamSignature(inventory)
        || (route && currentRoute?.revision !== route.revision));
      res.set('Cache-Control', 'private, no-store').json({ eligible: true, kind, sufficient, defaults, gearName: gear_name || null,
        routes: available.map(({ id, name, revision }) => ({ id, name, revision })), stored: saved ? { ...saved, stale,
          payload: { ...saved.payload, calories: saved.payload.calories || outdoorCalories(saved.payload, activity.calories) } } : null });
    } catch (error) { fail(res, error); }
  });
  router.post('/:id/preview', async (req, res) => {
    if (active >= 2) { res.status(429).json({ code: 'POWER_BUSY' }); return; }
    active++;
    try { res.set('Cache-Control', 'private, no-store').json(await calculate(req.params.id, req.body?.parameters)); }
    catch (error) { fail(res, error); } finally { active--; }
  });
  router.put('/:id', async (req, res) => {
    const revision = req.body?.revision;
    if (revision !== null && (!Number.isSafeInteger(revision) || revision < 1)) { res.status(400).json({ code: 'POWER_INVALID_PARAMETERS' }); return; }
    if (active >= 2) { res.status(429).json({ code: 'POWER_BUSY' }); return; }
    active++;
    try {
      const payload = await calculate(req.params.id, req.body?.parameters);
      if (payload.fingerprint !== req.body?.fingerprint) throw new Error('POWER_STALE');
      const result = revision === null
        ? await db.query(`INSERT INTO activity_power_assessments (activity_id,payload) VALUES ($1,$2::jsonb)
          ON CONFLICT (activity_id) DO NOTHING RETURNING payload, revision, updated_at`, [req.params.id, JSON.stringify(payload)])
        : await db.query(`UPDATE activity_power_assessments SET payload=$2::jsonb, revision=revision+1, updated_at=CURRENT_TIMESTAMP
          WHERE activity_id=$1 AND revision=$3 RETURNING payload, revision, updated_at`, [req.params.id, JSON.stringify(payload), revision]);
      if (!result.rows.length) throw new Error('POWER_CONFLICT');
      res.json({ ...result.rows[0], stale: false });
    } catch (error) { fail(res, error); } finally { active--; }
  });
  router.delete('/:id', async (req, res) => {
    try {
      const revision = Number(req.query.revision);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('POWER_INVALID_PARAMETERS');
      await base(req.params.id);
      const result = await db.query('DELETE FROM activity_power_assessments WHERE activity_id=$1 AND revision=$2 RETURNING activity_id', [req.params.id, revision]);
      if (!result.rows.length) throw new Error('POWER_CONFLICT');
      res.status(204).end();
    } catch (error) { fail(res, error); }
  });
  return router;
}
