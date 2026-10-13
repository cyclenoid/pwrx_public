import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { createRoutePlannerRouter, routingParams, parseRoutingResponse } from '../api/routePlanner';

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
