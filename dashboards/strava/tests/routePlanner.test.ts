import test from 'node:test'
import assert from 'node:assert/strict'
import { draftFromSegments, segmentsFromDraft, splitLeg, routeStats, isDraft, MAX_ANCHORS } from '../src/features/routePlanner/model'
import { exportGpx } from '../src/features/routePlanner/gpx'
import { draftFromActivity } from '../src/features/routePlanner/activity'
import { category, coloredSections, waySummary } from '../src/features/routePlanner/ways'

test('activity-to-route preserves geometry and gaps, never shifts unaligned elevations', () => {
  const draft = draftFromActivity({ name: 'Ride', streams: { latlng: [[50, 10], [50.01, 10], null, [51, 11], [51.01, 11]], altitude: [100, 200] } })
  const segments = segmentsFromDraft(draft)
  assert.equal(segments.length, 2)
  assert.equal(segments[0][0].ele, undefined)
  const aligned = draftFromActivity({ streams: { latlng: [[50, 10], [50.01, 10]], altitude: [100, 200] } })
  assert.deepEqual(segmentsFromDraft(aligned)[0].map(p => p.ele), [100, 200])
  assert.throws(() => draftFromActivity({}), /ACTIVITY_NO_GPS/)
})

test('surface and highway are independent, unknown is not inferred from a gravel profile', () => {
  assert.equal(category({ highway: 'cycleway', surface: 'asphalt' }, 'surface'), 'asphalt')
  assert.equal(category({ highway: 'cycleway', surface: 'asphalt' }, 'highway'), 'cycleway')
  assert.equal(category({ highway: 'track' }, 'surface'), 'unknown')
  const points = [{ lat: 50, lng: 10 }, { lat: 50.001, lng: 10, way: { surface: 'asphalt' } }, { lat: 50.002, lng: 10, way: { surface: 'gravel' } }]
  const draft = draftFromSegments('Test', [points])
  assert.deepEqual(waySummary(draft, 'surface').map(([key]) => key), ['unknown'])
  const leg = { points, source: 'routed' as const }
  draft.legs = [leg]; draft.anchors = [points[0], points[2]]
  assert.deepEqual(coloredSections(leg, 'surface').map(s => s.category), ['asphalt', 'gravel'])
  const split = splitLeg(draft, 0, 1)
  assert.deepEqual(waySummary(split, 'surface'), waySummary(draft, 'surface'))
  assert.ok(isDraft(JSON.parse(JSON.stringify(split))))
  assert.equal(exportGpx(split).includes('way'), false)
})

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
import { parseStart, suggestionDraft, validSuggestions } from '../src/features/routePlanner/roundTrips'

test('suggested routes become editable routed drafts without changing geometry, tags or closed endpoints', () => {
  const points = Array.from({ length: 101 }, (_, i) => ({ lat: 50 + .01 * Math.sin(i / 100 * Math.PI * 2), lng: 10 + .01 * Math.cos(i / 100 * Math.PI * 2), ele: 100 + i % 20, way: { surface: 'gravel' } }))
  points[100] = { ...points[0] }
  const route = { id: '1', points, meters: 6000, ascent: 50, durationMinutes: 30, surfaces: { gravel: 100 }, warnings: [] }
  const before = JSON.stringify(route), draft = suggestionDraft(route, 'Gravel loop')
  assert.ok(isDraft(draft)); assert.ok(draft.legs.every(leg => leg?.source === 'routed'))
  assert.deepEqual(segmentsFromDraft(draft), [points]); assert.equal(JSON.stringify(route), before)
  assert.ok(validSuggestions({ routes: [route], missingTiles: [], partial: false }))
  assert.equal(validSuggestions({ routes: [{ ...route, points: [{ lat: NaN, lng: 10 }] }], missingTiles: [], partial: false }), false)
  assert.equal(validSuggestions({ routes: [route], missingTiles: ['../private'], partial: false }), false)
  assert.deepEqual(parseStart('49.8728, 8.6512'), { lat: 49.8728, lng: 8.6512 })
  assert.deepEqual(parseStart('49,8728; 8,6512'), { lat: 49.8728, lng: 8.6512 })
  for (const invalid of ['','91, 0','1,','NaN, 1','1,2,3','1<script>, 2']) assert.equal(parseStart(invalid), null)
})
