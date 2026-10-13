import test from 'node:test'
import assert from 'node:assert/strict'
import { draftFromSegments, segmentsFromDraft, splitLeg, routeStats, isDraft, MAX_ANCHORS } from '../src/features/routePlanner/model'
import { exportGpx } from '../src/features/routePlanner/gpx'

test('import preserves every point and segment break, including repeated points', () => {
  const points = Array.from({ length: 400 }, (_, i) => ({ lat: 50 + i / 10000, lng: 10, ele: 300 + i }))
  points[5] = points[4]
  const segments = [points, [{ lat: 51, lng: 11, ele: 100 }, { lat: 51.01, lng: 11.01, ele: 110 }]]
  const draft = draftFromSegments('Test', segments)
  assert.deepEqual(segmentsFromDraft(draft), segments)
  assert.ok(isDraft(draft))
  const first = draft.legs.findIndex(leg => leg && leg.points.length > 2)
  const split = splitLeg(draft, first, 2)
  assert.deepEqual(segmentsFromDraft(split), segments)
  assert.equal(split.anchors.length, draft.anchors.length + 1)
})

test('large multi-segment tracks stay inside the anchor budget', () => {
  const segments = Array.from({ length: 30 }, () => Array.from({ length: 500 }, (_, i) => ({ lat: 50 + i / 10000, lng: 10 })))
  const draft = draftFromSegments('Many', segments)
  assert.ok(draft.anchors.length <= MAX_ANCHORS)
  assert.deepEqual(segmentsFromDraft(draft), segments)
  assert.ok(isDraft(draft))
})

test('distance excludes gaps and unknown elevation is not reported as zero', () => {
  const draft = draftFromSegments('', [[{ lat: 50, lng: 10 }, { lat: 50.001, lng: 10 }], [{ lat: -50, lng: -10 }, { lat: -50.001, lng: -10 }]])
  assert.ok(routeStats(draft).meters < 230)
  assert.equal(routeStats(draft).ascent, null)
})

test('export escapes names and preserves separate GPX segments', () => {
  const draft = draftFromSegments('A & B <route>', [[{ lat: 50, lng: 10 }, { lat: 50.001, lng: 10 }], [{ lat: 51, lng: 11 }]])
  const xml = exportGpx(draft)
  assert.equal((xml.match(/<trkseg>/g) || []).length, 2)
  assert.match(xml, /A &amp; B &lt;route&gt;/)
  assert.equal((xml.match(/<trkpt /g) || []).length, 3)
  assert.ok(!xml.includes('<time>'))
})

test('malformed saved drafts and invalid coordinates are rejected', () => {
  assert.equal(isDraft({ name: '', anchors: [{ lat: NaN, lng: 10 }], legs: [] }), false)
  assert.equal(isDraft({ name: '', anchors: [{ lat: 50, lng: 10 }], legs: [null] }), false)
  assert.throws(() => draftFromSegments('', [[{ lat: 100, lng: 0 }, { lat: 0, lng: 0 }]]))
})

test('snapped routing endpoints do not introduce invisible straight-line bridges', () => {
  const draft = draftFromSegments('', [[{ lat: 50, lng: 10 }, { lat: 50.001, lng: 10 }, { lat: 50.002, lng: 10 }]])
  draft.legs[1] = { source: 'routed', points: [{ lat: 50.0015, lng: 10.001 }, { lat: 50.002, lng: 10 }] }
  const segments = segmentsFromDraft(draft)
  assert.equal(segments.length, 2)
  assert.deepEqual(segments[0], [{ lat: 50, lng: 10 }, { lat: 50.001, lng: 10 }])
  assert.deepEqual(segments[1], draft.legs[1].points)
})
