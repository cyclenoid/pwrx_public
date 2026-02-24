import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSegmentSourceAndTypeFilters,
  buildSegmentTypeWhereClause,
  parseSegmentSourceFilter,
  parseSegmentTypeFilters,
} from '../services/segments/filters';

test('parseSegmentSourceFilter normalizes valid values and defaults to all', () => {
  assert.equal(parseSegmentSourceFilter('local'), 'local');
  assert.equal(parseSegmentSourceFilter('STRAVA'), 'strava');
  assert.equal(parseSegmentSourceFilter('unknown'), 'all');
  assert.equal(parseSegmentSourceFilter(undefined), 'all');
});

test('parseSegmentTypeFilters returns defaults for empty/invalid and deduplicates valid values', () => {
  assert.deepEqual(parseSegmentTypeFilters(undefined), ['sync', 'auto', 'manual']);
  assert.deepEqual(parseSegmentTypeFilters('foo,bar'), ['sync', 'auto', 'manual']);
  assert.deepEqual(parseSegmentTypeFilters('manual,sync,manual'), ['manual', 'sync']);
});

test('buildSegmentTypeWhereClause emits no clause when all types are selected', () => {
  assert.equal(buildSegmentTypeWhereClause(['sync', 'auto', 'manual']), '');
});

test('buildSegmentTypeWhereClause emits expected SQL for partial selection', () => {
  assert.equal(
    buildSegmentTypeWhereClause(['manual'], 's'),
    "((s.source = 'local' AND COALESCE(s.is_auto_climb, false) = false))"
  );
  assert.equal(
    buildSegmentTypeWhereClause(['sync'], 'seg'),
    "(seg.source = 'strava')"
  );
});

test('buildSegmentSourceAndTypeFilters composes source params and type clauses deterministically', () => {
  const all = buildSegmentSourceAndTypeFilters('local', ['sync', 'auto', 'manual'], { tableAlias: 's' });
  assert.deepEqual(all.params, ['local']);
  assert.deepEqual(all.clauses, ['s.source = $1']);

  const partial = buildSegmentSourceAndTypeFilters('all', ['auto'], { tableAlias: 's', paramOffset: 2 });
  assert.deepEqual(partial.params, []);
  assert.deepEqual(partial.clauses, ["((s.source = 'local' AND COALESCE(s.is_auto_climb, true) = true))"]);
});
