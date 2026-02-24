import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAutoClimbsFromStreams } from '../services/localSegments';

test('detectAutoClimbsFromStreams detects one clear climb', () => {
  const time = Array.from({ length: 11 }, (_, i) => i * 60);
  const distance = Array.from({ length: 11 }, (_, i) => i * 100);
  const altitude = [100, 105, 110, 116, 122, 128, 133, 138, 142, 145, 147];
  const latlng = Array.from({ length: 11 }, (_, i) => [50 + i * 0.0009, 10] as [number, number]);

  const climbs = detectAutoClimbsFromStreams('Ride', { time, distance, altitude, latlng }, {
    minDistanceM: 600,
    minElevationGainM: 30,
    minAvgGradePct: 3,
  });

  assert.equal(climbs.length, 1);
  assert.ok(climbs[0].distanceM >= 900);
  assert.ok(climbs[0].elevationGainM >= 40);
  assert.ok(climbs[0].avgGradePct >= 3);
});

test('detectAutoClimbsFromStreams ignores short or flat bumps', () => {
  const time = Array.from({ length: 8 }, (_, i) => i * 60);
  const distance = Array.from({ length: 8 }, (_, i) => i * 80);
  const altitude = [100, 101, 102, 101, 102, 101, 102, 101];

  const climbs = detectAutoClimbsFromStreams('Ride', { time, distance, altitude }, {
    minDistanceM: 500,
    minElevationGainM: 25,
    minAvgGradePct: 3,
  });

  assert.equal(climbs.length, 0);
});

test('detectAutoClimbsFromStreams keeps defaults when options are undefined', () => {
  const time = Array.from({ length: 11 }, (_, i) => i * 60);
  const distance = Array.from({ length: 11 }, (_, i) => i * 100);
  const altitude = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120]; // 2% avg

  const climbs = detectAutoClimbsFromStreams('Ride', { time, distance, altitude }, {
    minAvgGradePct: undefined,
  });

  assert.equal(climbs.length, 0);
});

test('detectAutoClimbsFromStreams detects long moderate climb via relaxed fallback', () => {
  const time = Array.from({ length: 241 }, (_, i) => i * 30);
  const distance = Array.from({ length: 241 }, (_, i) => i * 100); // 24.0km
  const altitude = Array.from({ length: 241 }, (_, i) => 100 + (i * 1.9)); // ~1.9%

  const climbs = detectAutoClimbsFromStreams('Ride', { time, distance, altitude });

  assert.ok(climbs.length >= 1);
  assert.ok(climbs.some((climb) => climb.distanceM >= 10000 && climb.elevationGainM >= 300));
});

test('detectAutoClimbsFromStreams still ignores long shallow drags', () => {
  const time = Array.from({ length: 241 }, (_, i) => i * 30);
  const distance = Array.from({ length: 241 }, (_, i) => i * 100); // 24.0km
  const altitude = Array.from({ length: 241 }, (_, i) => 100 + (i * 1.0)); // ~1.0%

  const climbs = detectAutoClimbsFromStreams('Ride', { time, distance, altitude });

  assert.equal(climbs.length, 0);
});

test('detectAutoClimbsFromStreams caps very long climbs', () => {
  const time = Array.from({ length: 241 }, (_, i) => i * 30);
  const distance = Array.from({ length: 241 }, (_, i) => i * 100); // 24.0km
  const altitude = Array.from({ length: 241 }, (_, i) => 100 + (i * 4)); // ~4%

  const climbs = detectAutoClimbsFromStreams('Ride', { time, distance, altitude });

  assert.ok(climbs.length >= 1);
  assert.ok(climbs.every((climb) => climb.distanceM <= 18000));
});
