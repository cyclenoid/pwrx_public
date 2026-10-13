import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createRouteLibraryRouter, validDocument, documentDistance, RouteDatabase } from '../api/routeLibrary';
import { addRouteWays } from '../services/routeWays';

const points = [{ lat: 50, lng: 10 }, { lat: 50.001, lng: 10, way: { surface: 'asphalt', highway: 'cycleway' } }];
const doc = { draft: { name: 'Airport', anchors: points, legs: [{ source: 'routed', points }] }, profile: 'gravel', mode: 'routed' };

test('saved route validation and distance reject invalid or unbounded geometry', () => {
  assert.ok(validDocument(doc));
  assert.ok(documentDistance(doc) > 110 && documentDistance(doc) < 112);
  for (const value of [null, {}, { ...doc, profile: '__proto__' }, { ...doc, mode: 'guess' },
    { ...doc, draft: { ...doc.draft, name: ' ' } },
    { ...doc, draft: { ...doc.draft, anchors: [{ lat: 999, lng: 10 }, points[1]] } },
    { ...doc, draft: { ...doc.draft, legs: [{ source: 'routed', points: [points[0], { ...points[1], way: { surface: 4 } }] }] } },
    { ...doc, draft: { ...doc.draft, legs: [{ source: 'routed', points: Array(160001).fill(points[0]) }] } },
  ]) assert.equal(validDocument(value), false);
});

test('BRouter tags describe incoming edges, preserve loops and never guess missing endpoints', () => {
  const p = [{ lat: 50, lng: 10 }, { lat: 50.001, lng: 10 }, { lat: 50.002, lng: 10 }, { lat: 50, lng: 10 }];
  addRouteWays(p, [['Longitude', 'Latitude', 'WayTags'],
    ['10000000', '50002000', 'surface=asphalt highway=cycleway'],
    ['10000000', '50000000', 'surface=gravel highway=track'],
  ]);
  assert.equal((p[0] as typeof points[1]).way, undefined);
  assert.equal((p[1] as typeof points[1]).way?.surface, 'asphalt');
  assert.equal((p[2] as typeof points[1]).way?.highway, 'cycleway');
  assert.equal((p[3] as typeof points[1]).way?.surface, 'gravel');
  const missing = [{ lat: 50, lng: 10 }, { lat: 50.001, lng: 10 }];
  addRouteWays(missing, [['Longitude', 'Latitude', 'WayTags'], ['0', '0', 'surface=asphalt'], ['10000000', '50001000', 'surface=gravel']]);
  assert.equal((missing[1] as typeof points[1]).way, undefined);
});

test('library CRUD roundtrip, revision conflicts, validation, list summaries and errors', async () => {
  let stored: Record<string, unknown> | undefined;
  const db: RouteDatabase = { async query(sql, values = []) {
    if (sql.startsWith('INSERT')) stored = { id: values[0], name: values[1], document: JSON.parse(values[2] as string), distance_m: values[3], revision: 1 };
    else if (sql.startsWith('UPDATE')) {
      if (stored?.id !== values[0] || stored?.revision !== values[4]) return { rows: [] };
      stored = { ...stored, name: values[1], document: JSON.parse(values[2] as string), distance_m: values[3], revision: Number(stored?.revision) + 1 };
    } else if (sql.startsWith('DELETE')) {
      if (stored?.id !== values[0] || stored?.revision !== values[1]) return { rows: [] };
      const old = stored; stored = undefined;
      return { rows: [old] as never[] };
    } else if (sql.includes('WHERE id=') && stored?.id !== values[0]) return { rows: [] };
    const result = stored ? { ...stored } : undefined;
    if (!sql.includes(', document FROM') && result) delete result.document;
    return { rows: result ? [result] as never[] : [] };
  } };
  const api = express().use(createRouteLibraryRouter(db));
  assert.equal((await request(api).post('/').send({})).status, 400);
  const saved = await request(api).post('/').send(doc);
  assert.equal(saved.status, 201);
  assert.equal(saved.body.document, undefined);
  const id = saved.body.id;
  assert.deepEqual((await request(api).get(`/${id}`)).body.document, doc);
  assert.equal((await request(api).get('/')).body.routes.length, 1);
  assert.equal((await request(api).get('/?offset=-1')).status, 400);
  const updated = await request(api).put(`/${id}`).send({ ...doc, revision: 1 });
  assert.equal(updated.body.revision, 2);
  assert.equal((await request(api).put(`/${id}`).send({ ...doc, revision: 1 })).status, 409);
  assert.equal((await request(api).delete(`/${id}?revision=1`)).status, 409);
  assert.equal((await request(api).delete(`/${id}?revision=2`)).status, 204);
  assert.equal((await request(api).get(`/${id}`)).status, 404);
  assert.equal((await request(api).get('/not-an-id')).status, 400);
  assert.equal((await request(api).post('/').set('Content-Type', 'application/json').send('{bad')).status, 400);
  const broken = express().use(createRouteLibraryRouter({ query: async () => { throw new Error('secret database detail'); } }));
  assert.deepEqual((await request(broken).get('/')).body, { code: 'ROUTE_STORAGE_ERROR' });
});
