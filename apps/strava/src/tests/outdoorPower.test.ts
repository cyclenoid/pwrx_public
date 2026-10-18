import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { assessOutdoorPower, outdoorKind, powerParameters, runningCost, PowerActivity, PowerParameters, PowerStreams } from '../services/outdoorPower';
import { surfaceMatcher, SurfaceRoute } from '../services/powerSurface';
import { createPowerAssessmentsRouter } from '../api/powerAssessments';
import { outdoorCalories } from '../services/outdoorCalories';

const activity: PowerActivity = { strava_activity_id: -106, type: 'Ride', sport_type: 'Ride', average_watts: 74, calories: 456, updated_at: '2026-10-18T00:00:00.000Z' };
const params: PowerParameters = { riderKg: 85, equipmentKg: 15, tyres: 'gravel', posture: 'hoods', surface: 'asphalt',
  condition: 'dry', routeId: 'none', windKmh: 0, windFrom: 0 };
function fixture(grade = 0, speed = 5): Required<PowerStreams> {
  const time = Array.from({ length: 121 }, (_, i) => i), distance = time.map(i => i * speed);
  return { time, distance, altitude: distance.map(d => 100 + grade * d), velocity_smooth: time.map(() => speed),
    latlng: distance.map(d => [50, 8 + d / (111195 * Math.cos(50 * Math.PI / 180))]) };
}
const routeId = '00000000-0000-4000-8000-000000000001';
function route(surface = 'asphalt'): SurfaceRoute {
  const s = fixture();
  return { id: routeId, name: 'Test route', revision: 1, document: { draft: { legs: [{ source: 'routed', points: s.latlng.map(p => ({ lat: p[0], lng: p[1], way: { surface, highway: 'track' } })) }] } } };
}

test('only outdoor non-assisted rides and runs are eligible, virtual sport overrides generic type', () => {
  assert.equal(outdoorKind(activity), 'ride');
  assert.equal(outdoorKind({ ...activity, type: 'Run', sport_type: 'TrailRun' }), 'run');
  for (const value of [{ ...activity, type: 'VirtualRide' }, { ...activity, sport_type: 'VirtualRide' },
    { ...activity, type: 'VirtualRun', sport_type: 'Run' }, { ...activity, trainer: true }, { ...activity, indoor: true },
    { ...activity, sport_type: 'EBikeRide' }, { ...activity, type: 'Swim', sport_type: 'Swim' }, { ...activity, device_name: 'Zwift' }]) assert.equal(outdoorKind(value), null);
});

test('parameters are bounded and isolated from unrecognized client fields', () => {
  assert.deepEqual(powerParameters({ ...params, watts: 900 }), params);
  for (const value of [{ ...params, riderKg: NaN }, { ...params, riderKg: '85' }, { ...params, equipmentKg: -1 },
    { ...params, windFrom: 360 }, { ...params, routeId: '../../private' }, { ...params, surface: '__proto__' }]) assert.equal(powerParameters(value), null);
});

test('flat cruising agrees with the force balance; ascent costs power and steep descent coasts', () => {
  const flat = assessOutdoorPower(activity, fixture(), params);
  const expected = (100 * 9.80665 * .005 * 5 + .5 * 1.225 * .45 * 5 ** 3) / .96;
  assert.equal(flat.watts, Math.round(expected));
  assert.ok(flat.lowWatts <= flat.watts && flat.highWatts >= flat.watts);
  assert.equal(flat.seconds, 120);
  assert.ok(assessOutdoorPower(activity, fixture(.1), params).watts > flat.watts + 450);
  assert.equal(assessOutdoorPower(activity, fixture(-.1), params).watts, 0);
});

test('surface, tyres, softness, weight and directional wind change power independently', () => {
  const base = assessOutdoorPower(activity, fixture(), params).watts;
  assert.ok(assessOutdoorPower(activity, fixture(), { ...params, surface: 'gravel' }).watts > base);
  assert.ok(assessOutdoorPower(activity, fixture(), { ...params, tyres: 'mtb' }).watts > base);
  assert.ok(assessOutdoorPower(activity, fixture(), { ...params, condition: 'soft' }).watts > base);
  assert.ok(assessOutdoorPower(activity, fixture(), { ...params, riderKg: 100 }).watts > base);
  assert.ok(assessOutdoorPower(activity, fixture(), { ...params, windKmh: 18, windFrom: 90 }).watts > base);
  assert.ok(assessOutdoorPower(activity, fixture(), { ...params, windKmh: 18, windFrom: 270 }).watts < base);
});

test('recording gaps are excluded, unknown surfaces have a wider scenario range and stationary GPS is rejected', () => {
  const streams = fixture();
  streams.time = streams.time.map((t, i) => t + (i >= 60 ? 600 : 0));
  const result = assessOutdoorPower(activity, streams, { ...params, surface: 'auto' });
  assert.equal(result.excludedSeconds, 601);
  assert.equal(result.seconds, 119);
  assert.equal(result.surfaceCoverage, 0);
  assert.ok(result.warnings.includes('GAPS'));
  const s = fixture(); s.latlng = s.latlng.map(() => [50, 8]);
  assert.throws(() => assessOutdoorPower(activity, s, params), /POWER_DATA_INSUFFICIENT/);
  for (const malformed of [{ ...fixture(), altitude: [0] }, { ...fixture(), time: [2, 1, 0] },
    { ...fixture(), altitude: fixture().altitude.map(() => NaN) }]) assert.throws(() => assessOutdoorPower(activity, malformed, params), /POWER_DATA_INSUFFICIENT/);
});

test('GPS-to-way matching preserves gaps, ambiguity and the distinction between surface and highway', () => {
  const r = route('compacted'), s = fixture();
  const match = surfaceMatcher(r, { lat: 50, lng: 8 });
  assert.equal(match({ lat: s.latlng[30][0], lng: s.latlng[30][1] })?.surface, 'compacted');
  assert.equal(match({ lat: 50.01, lng: 8 }), undefined);
  const duplicate = route('asphalt').document.draft.legs[0];
  r.document.draft.legs.push(null, duplicate);
  assert.equal(surfaceMatcher(r, { lat: 50, lng: 8 })({ lat: s.latlng[30][0], lng: s.latlng[30][1] }), undefined);
  const imported = route(); imported.document.draft.legs[0]!.source = 'imported';
  assert.equal(surfaceMatcher(imported, { lat: 50, lng: 8 })({ lat: 50, lng: 8 }), undefined);
  const assessment = assessOutdoorPower(activity, fixture(), { ...params, surface: 'auto', routeId }, route());
  assert.equal(assessment.surfaceCoverage, 100);
  assert.equal(assessment.matchedPercent, 100);
  assert.equal(assessment.surfaces[0].surface, 'asphalt');
});

test('the running energy model is explicit, independent of cycling tyres and sensitive to hills and surface', () => {
  assert.equal(runningCost(0), 3.6);
  assert.ok(runningCost(.1) > runningCost(0));
  assert.ok(runningCost(-.1) < runningCost(0));
  const run = { ...activity, type: 'Run', sport_type: 'TrailRun' };
  const result = assessOutdoorPower(run, fixture(0, 3), params);
  assert.equal(result.kind, 'run');
  assert.equal(result.metabolicWatts, 1080);
  assert.ok(result.watts >= 270 && result.watts < 290);
  assert.ok(result.warnings.includes('RUNNING_EQUIVALENT'));
  assert.equal(assessOutdoorPower(run, fixture(0, 3), { ...params, tyres: 'mtb' }).watts, result.watts);
  assert.ok(assessOutdoorPower(run, fixture(0, 3), { ...params, surface: 'ground' }).watts > result.watts);
});

test('source snapshots, route revisions and assumptions affect the fingerprint without modifying inputs', () => {
  const streams = fixture(), r = route(), before = JSON.stringify({ activity, streams, params, r });
  const result = assessOutdoorPower(activity, streams, params, r);
  assert.equal(assessOutdoorPower(activity, streams, params, r).fingerprint, result.fingerprint);
  assert.notEqual(assessOutdoorPower(activity, streams, { ...params, riderKg: 90 }, r).fingerprint, result.fingerprint);
  assert.notEqual(assessOutdoorPower(activity, streams, params, { ...r, revision: 2 }).fingerprint, result.fingerprint);
  assert.equal(JSON.stringify({ activity, streams, params, r }), before);
});

test('cycling calories convert mechanical work using explicit efficiency, never just kJ to kcal', () => {
  const basis = { kind: 'ride' as const, watts: 100, lowWatts: 80, highWatts: 120, seconds: 3600, metabolicWatts: null };
  const result = outdoorCalories(basis, '600');
  assert.equal(result.kcal, Math.round(360000 / .22 / 4184));
  assert.equal(result.lowKcal, Math.round(288000 / .25 / 4184));
  assert.equal(result.highKcal, Math.round(432000 / .18 / 4184));
  assert.equal(result.originalKcal, 600);
  assert.equal(result.efficiency, .22);
  assert.equal(outdoorCalories({ ...basis, seconds: 7200 }, null).kcal, Math.round(720000 / .22 / 4184));
  for (const missing of [null, undefined, '', ' ', 'bad', -10]) assert.equal(outdoorCalories(basis, missing).originalKcal, null);
  assert.equal(outdoorCalories(basis, 0).originalKcal, 0);
  assert.equal(outdoorCalories({ ...basis, watts: 0, lowWatts: 0, highWatts: 0 }, null).kcal, 0);
});

test('running calories use metabolic cost independently of the arbitrary watt equivalent', () => {
  const basis = { kind: 'run' as const, watts: 270, lowWatts: 230, highWatts: 325, seconds: 3600, metabolicWatts: 1080 };
  const result = outdoorCalories(basis, null);
  assert.equal(result.kcal, Math.round(1080 * 3600 / 4184));
  assert.equal(result.lowKcal, Math.round(1080 * 3600 * .85 / 4184));
  assert.equal(result.highKcal, Math.round(1080 * 3600 * 1.2 / 4184));
  assert.equal(result.efficiency, null);
  assert.deepEqual(outdoorCalories({ ...basis, watts: 900 }, null), result);
  const run = { ...activity, type: 'Run', sport_type: 'TrailRun' };
  const flat = assessOutdoorPower(run, fixture(0, 3), params);
  assert.ok(assessOutdoorPower(run, fixture(.1, 3), params).calories.kcal > flat.calories.kcal);
  assert.ok(assessOutdoorPower(run, fixture(0, 3), { ...params, surface: 'gravel' }).calories.kcal > flat.calories.kcal);
  const gaps = fixture(); gaps.time = gaps.time.map((t, i) => t + (i >= 60 ? 600 : 0));
  const ride = assessOutdoorPower(activity, gaps, params);
  assert.equal(ride.calories.kcal, Math.round(ride.watts * ride.seconds / .22 / 4184));
  assert.equal(ride.seconds, 119);
});

test('API computes on the server, preserves activity watts and supports reversible revision-guarded acceptance', async () => {
  let saved: Record<string, unknown> | undefined;
  let current = { ...activity }, streams = fixture();
  const mutations: string[] = [];
  const api = express().use(express.json()).use(createPowerAssessmentsRouter({ async query(sql, values = []) {
    if (sql.startsWith('SELECT to_jsonb')) return { rows: values[0] === '-106' ? [{ activity: current, gear_name: 'Canyon Grizl' }] : [] };
    if (sql.includes('jsonb_array_length')) return { rows: Object.entries(streams).map(([stream_type, data]) => ({ stream_type, length: data.length, signature: createHash('md5').update(JSON.stringify(data)).digest('hex') })) };
    if (sql.includes('SELECT stream_type, data')) return { rows: Object.entries(streams).map(([stream_type, data]) => ({ stream_type, data, signature: createHash('md5').update(JSON.stringify(data)).digest('hex') })) };
    if (sql.includes('FROM user_settings')) return { rows: [{ value: '91,0' }] };
    if (sql.includes('FROM saved_routes')) return { rows: sql.includes('WHERE id=') ? [route() as unknown as Record<string, unknown>] : [{ id: routeId, name: 'Test route', revision: 1, start_lat: 50, start_lng: 8 }] };
    if (sql.startsWith('SELECT payload')) return { rows: saved ? [saved] : [] };
    mutations.push(sql);
    assert.ok(sql.includes('activity_power_assessments'));
    if (sql.startsWith('DELETE')) {
      if (saved?.revision !== values[1]) return { rows: [] };
      saved = undefined; return { rows: [{ activity_id: -106 }] };
    }
    if ((sql.startsWith('INSERT') && saved) || (sql.startsWith('UPDATE') && saved?.revision !== values[2])) return { rows: [] };
    saved = { payload: JSON.parse(values[1] as string), revision: Number(saved?.revision || 0) + 1, updated_at: '2026-10-18T01:00:00Z' };
    return { rows: [saved] };
  } }));
  const context = await request(api).get('/-106');
  assert.equal(context.body.defaults.riderKg, 91);
  assert.equal(context.body.defaults.tyres, 'gravel');
  assert.equal(context.body.stored, null);
  assert.equal((await request(api).get('/bad')).status, 400);
  assert.equal((await request(api).get('/123')).status, 404);
  assert.equal((await request(api).post('/-106/preview').send({ parameters: { ...params, riderKg: -1 } })).status, 400);
  const preview = await request(api).post('/-106/preview').send({ parameters: { ...params, surface: 'auto', routeId: 'auto' } });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.calories.originalKcal, 456);
  assert.ok(preview.body.calories.kcal > 0);
  assert.equal(preview.body.route.id, routeId);
  const body = { parameters: preview.body.parameters, fingerprint: preview.body.fingerprint, revision: null };
  assert.equal((await request(api).put('/-106').send({ ...body, fingerprint: 'client-invented-watts' })).status, 409);
  assert.equal((await request(api).put('/-106').send(body)).body.revision, 1);
  assert.equal((await request(api).put('/-106').send(body)).status, 409);
  assert.equal((await request(api).get('/-106')).body.stored.stale, false);
  // Old assessments acquire a derived comparison on read, with no database rewrite.
  const legacyPayload = saved!.payload as Record<string, unknown>;
  delete legacyPayload.calories;
  const beforeLegacyRead = JSON.stringify(saved), writesBefore = mutations.length;
  const legacy = (await request(api).get('/-106')).body.stored;
  assert.equal(legacy.revision, 1);
  assert.equal(legacy.stale, false);
  assert.equal(legacy.payload.calories.kcal, preview.body.calories.kcal);
  assert.equal(JSON.stringify(saved), beforeLegacyRead);
  assert.equal(mutations.length, writesBefore);
  streams.velocity_smooth[10] = 6;
  assert.equal((await request(api).get('/-106')).body.stored.stale, true);
  streams.velocity_smooth[10] = 5;
  current = { ...current, updated_at: '2026-10-19T00:00:00Z' };
  assert.equal((await request(api).put('/-106').send({ ...body, revision: 1 })).body.code, 'POWER_STALE');
  assert.equal((await request(api).get('/-106')).body.stored.stale, true);
  assert.equal((await request(api).delete('/-106?revision=2')).status, 409);
  assert.equal((await request(api).delete('/-106?revision=1')).status, 204);
  current = { ...activity, sport_type: 'VirtualRide' };
  assert.equal((await request(api).get('/-106')).body.eligible, false);
  assert.equal((await request(api).post('/-106/preview').send({ parameters: params })).status, 422);
  current = { ...activity }; streams = { ...fixture(), altitude: [0] };
  assert.equal((await request(api).post('/-106/preview').send({ parameters: params })).status, 422);
  assert.equal(activity.average_watts, 74);
  assert.equal(activity.calories, 456);
  assert.equal(mutations.length, 4);
});
