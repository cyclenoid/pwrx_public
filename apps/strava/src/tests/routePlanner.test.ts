import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { createRoutePlannerRouter, routingParams, parseRoutingResponse } from '../api/routePlanner';
import { fitSegments, parseFitRoute, MAX_FIT_BYTES } from '../services/fitRoute';
import { fitFixture } from './fitFixture';
import { routingCoverage, routingTile } from '../services/routingCoverage';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateRoundTrips, roundTripInput, tripOverlap, tripScore, tripStats } from '../services/roundTrips';

test('coverage handles cardinal signs, missing inventory, empty files and temporary downloads', async () => {
  assert.deepEqual(routingTile('W5_S10.rd5')?.bounds, [[-10, -5], [-5, 0]]);
  for (const invalid of ['E180_N50.rd5', 'E5_N90.rd5', 'E7_N50.rd5', '../E5_N50.rd5']) assert.equal(routingTile(invalid), null);
  assert.equal((await routingCoverage('')).status, 'unknown');
  const directory = await mkdtemp(path.join(tmpdir(), 'pwrx-coverage-'));
  try {
    await writeFile(path.join(directory, 'E5_N50.rd5'), 'fixture');
    await writeFile(path.join(directory, 'E10_N50.rd5'), '');
    await writeFile(path.join(directory, 'E5_N45.rd5.part'), 'unfinished');
    await mkdir(path.join(directory, 'W5_S10.rd5'));
    const inventory = await routingCoverage(directory);
    assert.equal(inventory.status, 'known');
    assert.equal(inventory.tiles.length, 1);
    assert.equal(inventory.tiles[0].name, 'E5_N50.rd5');
    assert.equal(inventory.tiles[0].bytes, 7);
  } finally { await rm(directory, { recursive: true, force: true }); }
  assert.equal((await routingCoverage(directory)).status, 'unavailable');
});

test('real FIT binary activity and course imports preserve GPS and per-record elevation without timestamps', async () => {
  for (const course of [false, true]) {
    for (const header of [12, 14] as const) {
      const segments = await parseFitRoute(fitFixture({ course, header }));
      assert.equal(segments.length, 1);
      assert.equal(segments[0].length, 5);
      assert.ok(Math.abs(segments[0][0].lat - 50) < 0.000001);
      assert.ok(Math.abs(segments[0][0].lng - 10) < 0.000001);
      assert.deepEqual(segments[0].map(p => p.ele), [200, 201, 202, 203, 104]);
    }
  }
});

test('FIT GPS gaps are separate and missing elevation is never shifted to another point', async () => {
  const segments = await parseFitRoute(fitFixture({ gap: true }));
  assert.deepEqual(segments.map(s => s.length), [2, 2]);
  assert.deepEqual(fitSegments([{ position_lat: 0, position_long: 0 },
    { position_lat: 0, position_long: 0.01, altitude: 20 }]), [[{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01, ele: 20 }]]);
  assert.throws(() => fitSegments(Array(150001).fill({})), /FIT_SIZE/);
  assert.throws(() => fitSegments(Array.from({ length: 31 }, () => [
    { position_lat: 50, position_long: 10 }, { position_lat: 50.1, position_long: 10 }, {},
  ]).flat()), /FIT_SEGMENTS/);
});

test('FIT validation rejects non-GPS, corrupt, truncated and oversized files', async () => {
  await assert.rejects(parseFitRoute(fitFixture({ noGps: true })), /FIT_NO_GPS/);
  await assert.rejects(parseFitRoute(Buffer.from('not FIT')), /INVALID_FIT/);
  const corrupt = fitFixture(); corrupt[40] ^= 1;
  await assert.rejects(parseFitRoute(corrupt), /INVALID_FIT/);
  await assert.rejects(parseFitRoute(fitFixture().subarray(0, -3)), /INVALID_FIT/);
  await assert.rejects(parseFitRoute(Buffer.alloc(MAX_FIT_BYTES + 1)), /FIT_SIZE/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(parseFitRoute(fitFixture(), abort.signal), /FIT_CANCELLED/);
});

test('FIT endpoint works without routing configured and returns safe explicit errors', async () => {
  const api = app();
  const upload = (buffer: Buffer) => request(api).post('/import-fit').type('application/octet-stream').send(buffer);
  const success = await upload(fitFixture());
  assert.equal(success.status, 200);
  assert.equal(success.body.segments[0].length, 5);
  const noGps = await upload(fitFixture({ noGps: true }));
  assert.equal(noGps.status, 422);
  assert.deepEqual(noGps.body, { code: 'FIT_NO_GPS' });
  assert.equal((await upload(Buffer.from('broken'))).body.code, 'INVALID_FIT');
  assert.equal((await request(api).post('/import-fit').send({})).status, 415);
  const tooLarge = await upload(Buffer.alloc(MAX_FIT_BYTES + 1));
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.body.code, 'FIT_SIZE');
  assert.equal((await upload(fitFixture())).status, 200);
});

const body = { points: [{ lat: 50, lng: 10 }, { lat: 50.01, lng: 10.01 }], profile: 'gravel' };
const app = (url = '') => express().use(express.json()).use(createRoutePlannerRouter(() => url));

test('profiles and coordinates are allowlisted, in BRouter longitude/latitude order', () => {
  assert.equal(routingParams({ ...body, profile: 'mtb' })?.get('profile'), 'mtb');
  assert.equal(routingParams({ ...body, profile: 'mtb' })?.get('profile:StrictNOBicycleaccess'), '1');
  assert.equal(routingParams(body)?.get('lonlats'), '10,50|10.01,50.01');
  assert.equal(routingParams({ ...body, profile: 'touring' })?.get('profile:stick_to_cycleroutes'), '1');
  assert.equal(routingParams({ ...body, profile: 'road' })?.get('profile:allow_steps'), '0');
  assert.equal(routingParams({ ...body, profile: '../../other' }), null);
  assert.equal(routingParams({ ...body, profile: 'toString' }), null);
  assert.equal(routingParams({ ...body, points: [{ lat: 91, lng: 0 }, body.points[1]] }), null);
  assert.equal(routingParams({ ...body, points: [{ lat: '50', lng: 10 }, body.points[1]] }), null);
  assert.equal(routingParams({ ...body, points: Array(81).fill(body.points[0]) }), null);
});

const tripRequest = { start: { lat: 50, lng: 10 }, lengthKm: 20, profile: 'gravel', terrain: 'flat', variation: 0 };
function loop(scale = 1, elevation = true) {
  const points = [{ lat: 50, lng: 10 }, { lat: 50 + .03 * scale, lng: 10 },
    { lat: 50 + .03 * scale, lng: 10 + .04 * scale }, { lat: 50, lng: 10 + .04 * scale }, { lat: 50, lng: 10 }];
  return points.map(p => ({ ...p, ...(elevation ? { ele: 100 } : {}), way: { surface: 'asphalt' } }));
}

test('round-trip validation bounds work and does not accept arbitrary profiles or client routing parameters', () => {
  assert.ok(roundTripInput(tripRequest));
  for (const change of [{ lengthKm: 1 }, { lengthKm: 201 }, { lengthKm: '60' }, { profile: '__proto__' }, { terrain: 'cliffs' },
    { variation: -1 }, { variation: .1 }, { start: { lat: 85, lng: 10 } }, { start: { lat: '50', lng: 10 } }]) assert.equal(roundTripInput({ ...tripRequest, ...change }), null);
  assert.deepEqual(roundTripInput({ ...tripRequest, endpoint: 'https://attacker', engineMode: 42 }), roundTripInput(tripRequest));
});

test('round-trip metrics preserve unknown elevation/surface and compare spatial coverage including reverse routes', () => {
  const points = loop(), stats = tripStats(points);
  assert.equal(stats.ascent, 0);
  assert.ok(stats.meters > 10000);
  assert.equal(Math.round(stats.surfaces.asphalt), Math.round(stats.meters));
  assert.equal(tripStats(loop(1, false)).ascent, null);
  assert.equal(tripOverlap(stats.cells, tripStats([...points].reverse()).cells) > .8, true);
  assert.equal(tripOverlap(stats.cells, new Set(['different'])), 0);
  assert.ok(tripScore(stats, roundTripInput({ ...tripRequest, terrain: 'flat' })!) < tripScore(stats, roundTripInput({ ...tripRequest, terrain: 'mountain' })!));
  assert.throws(() => tripStats([{ lat: 50, lng: 10 }, { lat: -50, lng: -10 }]), /INVALID_ROUTE_RESPONSE/);
});

test('round-trip search is bounded, deduplicates routes and never fabricates geometry or elevation', async () => {
  const input = roundTripInput(tripRequest)!;
  let calls = 0;
  const points = loop();
  const before = JSON.stringify(points);
  const result = await generateRoundTrips(input, async () => { calls++; return points; }, new AbortController().signal);
  assert.ok(calls <= 6); assert.equal(result.routes.length, 1); assert.equal(result.partial, true);
  assert.deepEqual(result.routes[0].points, points); assert.equal(JSON.stringify(points), before);
  assert.ok(result.routes[0].warnings.includes('LENGTH'));
  const missing = await generateRoundTrips(input, async (_radius, bearing) => {
    if (bearing === 0) return loop(1, false);
    throw new Error('ROUTING_REGION_MISSING:E10_N45.rd5');
  }, new AbortController().signal);
  assert.equal(missing.routes[0].ascent, null);
  assert.deepEqual(missing.missingTiles, ['E10_N45.rd5']);
  await assert.rejects(generateRoundTrips(input, async () => points.slice(0, -1), new AbortController().signal), /NO_ROUND_TRIP/);
  const abort = new AbortController(); calls = 0;
  await assert.rejects(generateRoundTrips(input, async () => { calls++; abort.abort(); throw new Error('cancel'); }, abort.signal), /NO_ROUND_TRIP/);
  assert.equal(calls, 1);
});

test('round-trip API uses only the configured router and reports missing tiles without private paths', async () => {
  assert.equal((await request(app()).post('/round-trips').send(tripRequest)).body.code, 'ROUTING_NOT_CONFIGURED');
  assert.equal((await request(app()).post('/round-trips').send({ ...tripRequest, lengthKm: 500 })).status, 400);
  let fail = false;
  const server = createServer((req, res) => {
    const params = new URL(req.url!, 'http://localhost').searchParams;
    assert.equal(params.get('engineMode'), '4'); assert.equal(params.get('profile'), 'mtb');
    assert.equal(params.get('lonlats'), '10,50'); assert.equal(params.get('roundTripPoints'), '5');
    assert.equal(params.get('profile:StrictNOBicycleaccess'), '1');
    assert.ok(Number(params.get('roundTripDistance')) <= 45000);
    if (fail) { res.writeHead(400).end('/private/path/E10_N45.rd5 not found'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ features: [{ geometry: { type: 'LineString', coordinates: loop().map(p => [p.lng, p.lat, p.ele]) } }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const api = app(`http://127.0.0.1:${(server.address() as AddressInfo).port}/brouter`);
    const result = await request(api).post('/round-trips').send({ ...tripRequest, profile: 'mtb' });
    assert.equal(result.status, 200); assert.equal(result.body.routes.length, 1);
    assert.equal(result.body.routes[0].surfaces.unknown, 100);
    fail = true;
    const missing = await request(api).post('/round-trips').send({ ...tripRequest, profile: 'mtb' });
    assert.equal(missing.status, 422); assert.deepEqual(missing.body, { code: 'ROUTING_REGION_MISSING', tile: 'E10_N45.rd5' });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('round-trip batches share the routing budget and cancellation releases slots without spawning more upstream work', async () => {
  let requests = 0, closed = 0;
  const server = createServer((_req, res) => { requests++; res.once('close', () => closed++); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const waitFor = async (condition: () => boolean) => {
    for (let i = 0; i < 100; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.fail('Timed out waiting for upstream cancellation');
  };
  const api = app(`http://127.0.0.1:${(server.address() as AddressInfo).port}/brouter`);
  const apiServer = createServer(api);
  await new Promise<void>(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/round-trips`;
  const controllers = [new AbortController(), new AbortController(), new AbortController()];
  const send = (signal: AbortSignal) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tripRequest), signal });
  const done = controllers.slice(0, 2).map(controller => send(controller.signal).then(() => {}, () => {}));
  try {
    await waitFor(() => requests === 2);
    assert.equal((await request(api).post('/round-trips').send(tripRequest)).status, 429);
    assert.equal((await request(api).post('/calculate').send(body)).status, 429);
    controllers[0].abort(); controllers[1].abort(); await Promise.all(done);
    await waitFor(() => closed === 2);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(requests, 2);
    const third = send(controllers[2].signal).then(() => {}, () => {});
    await waitFor(() => requests === 3);
    controllers[2].abort(); await third; await waitFor(() => closed === 3);
  } finally {
    controllers.forEach(controller => controller.abort()); server.closeAllConnections(); apiServer.closeAllConnections();
    await new Promise<void>(resolve => apiServer.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('invalid upstream geometry never becomes an exportable route', () => {
  assert.equal(parseRoutingResponse({ features: {} }), null);
  assert.equal(parseRoutingResponse({ features: [null] }), null);
  assert.equal(parseRoutingResponse({ features: [{ geometry: { type: 'LineString', coordinates: [[10, 50], [null, 51]] } }] }), null);
  assert.deepEqual(parseRoutingResponse({ features: [{ geometry: { type: 'LineString', coordinates: [[10, 50, 100], [11, 51, 120]] } }] }), [{ lat: 50, lng: 10, ele: 100 }, { lat: 51, lng: 11, ele: 120 }]);
});

test('unconfigured routing and invalid requests have explicit errors', async () => {
  const api = app();
  assert.equal((await request(api).get('/status')).body.configured, false);
  assert.equal((await request(api).post('/calculate').send(body)).body.code, 'ROUTING_NOT_CONFIGURED');
  assert.equal((await request(api).post('/calculate').send({ ...body, points: [] })).status, 400);
});

test('proxy calculates via configured service and maps BRouter errors without exposing internals', async () => {
  let fail = '';
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    assert.equal(url.searchParams.get('profile'), 'gravel');
    assert.equal(url.searchParams.get('format'), 'geojson');
    if (fail) { res.writeHead(400).end(fail); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ features: [{ geometry: { type: 'LineString', coordinates: [[10, 50, 110], [10.01, 50.01, 130]] } }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const api = app(`http://127.0.0.1:${(server.address() as AddressInfo).port}/brouter`);
    const success = await request(api).post('/calculate').send(body);
    assert.equal(success.status, 200);
    assert.equal(success.body.points[0].ele, 110);
    fail = 'internal-path /private/missing.rd5';
    const failure = await request(api).post('/calculate').send(body);
    assert.equal(failure.status, 422);
    assert.deepEqual(failure.body, { code: 'NO_ROUTE' });
    fail = '/private/segments4/E10_N45.rd5 not found';
    assert.deepEqual((await request(api).post('/calculate').send(body)).body, { code: 'ROUTING_REGION_MISSING', tile: 'E10_N45.rd5' });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
