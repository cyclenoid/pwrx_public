import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { createRoutePlannerRouter, routingParams, parseRoutingResponse } from '../api/routePlanner';
import { fitSegments, parseFitRoute, MAX_FIT_BYTES } from '../services/fitRoute';
import { fitFixture } from './fitFixture';

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
  assert.equal(routingParams(body)?.get('lonlats'), '10,50|10.01,50.01');
  assert.equal(routingParams({ ...body, profile: 'touring' })?.get('profile:stick_to_cycleroutes'), '1');
  assert.equal(routingParams({ ...body, profile: 'road' })?.get('profile:allow_steps'), '0');
  assert.equal(routingParams({ ...body, profile: '../../other' }), null);
  assert.equal(routingParams({ ...body, profile: 'toString' }), null);
  assert.equal(routingParams({ ...body, points: [{ lat: 91, lng: 0 }, body.points[1]] }), null);
  assert.equal(routingParams({ ...body, points: [{ lat: '50', lng: 10 }, body.points[1]] }), null);
  assert.equal(routingParams({ ...body, points: Array(81).fill(body.points[0]) }), null);
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
  let fail = false;
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    assert.equal(url.searchParams.get('profile'), 'gravel');
    assert.equal(url.searchParams.get('format'), 'geojson');
    if (fail) { res.writeHead(400).end('internal-path /private/missing.rd5'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ features: [{ geometry: { type: 'LineString', coordinates: [[10, 50, 110], [10.01, 50.01, 130]] } }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const api = app(`http://127.0.0.1:${(server.address() as AddressInfo).port}/brouter`);
    const success = await request(api).post('/calculate').send(body);
    assert.equal(success.status, 200);
    assert.equal(success.body.points[0].ele, 110);
    fail = true;
    const failure = await request(api).post('/calculate').send(body);
    assert.equal(failure.status, 422);
    assert.deepEqual(failure.body, { code: 'NO_ROUTE' });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
