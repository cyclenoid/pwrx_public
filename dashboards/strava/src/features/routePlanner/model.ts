export type Way = { surface?: string; highway?: string; tracktype?: string; smoothness?: string }
// way describes the edge arriving at this point, as returned by BRouter.
export type Point = { lat: number; lng: number; ele?: number; way?: Way }
export type Profile = 'road' | 'gravel' | 'touring' | 'mtb'
export type Leg = { points: Point[]; source: 'imported' | 'routed' | 'direct' }
export type RouteDraft = { name: string; anchors: Point[]; legs: (Leg | null)[] }
export const emptyDraft = (): RouteDraft => ({ name: '', anchors: [], legs: [] })
export const MAX_ANCHORS = 80

export function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false
  const p = value as Point
  return Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
    && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180
    && (p.ele === undefined || Number.isFinite(p.ele))
    && (p.way === undefined || (!!p.way && typeof p.way === 'object' && !Array.isArray(p.way)
      && Object.entries(p.way).every(([k, v]) => ['surface', 'highway', 'tracktype', 'smoothness'].includes(k) && typeof v === 'string' && v.length <= 80)))
}

export function distance(a: Point, b: Point): number {
  const rad = Math.PI / 180
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

// Anchor selection never simplifies the imported geometry. Each leg retains all track points.
export function draftFromSegments(name: string, segments: Point[][]): RouteDraft {
  if (!segments.length || segments.length > 30 || segments.some(s => !s.length || !s.every(isPoint))) {
    throw new Error('INVALID_GPX')
  }
  const total = segments.reduce((n, s) => n + s.length, 0)
  if (total < 2 || total > 150000) throw new Error('GPX_SIZE')
  const draft = emptyDraft()
  draft.name = name.slice(0, 200)
  const budget = Math.max(1, Math.floor((MAX_ANCHORS - segments.length) / segments.length))
  for (const segment of segments) {
    if (draft.anchors.length) draft.legs.push(null)
    draft.anchors.push(segment[0])
    const step = Math.max(1, Math.ceil((segment.length - 1) / Math.min(budget, 12)))
    for (let start = 0; start < segment.length - 1; start += step) {
      const end = Math.min(segment.length - 1, start + step)
      draft.legs.push({ points: segment.slice(start, end + 1), source: 'imported' })
      draft.anchors.push(segment[end])
    }
  }
  return draft
}

export function segmentsFromDraft(draft: RouteDraft): Point[][] {
  if (!draft.anchors.length) return []
  const segments: Point[][] = []
  let current = [draft.anchors[0]]
  draft.legs.forEach((leg, i) => {
    if (!leg) { segments.push(current); current = [draft.anchors[i + 1]]; return }
    if (i === 0 || draft.legs[i - 1] === null) { current = [...leg.points]; return }
    const last = current[current.length - 1], first = leg.points[0]
    const shared = first.lat === last.lat && first.lng === last.lng
    // Snapping can put a routed endpoint away from an untouched imported leg.
    // Preserve that gap instead of inventing an unplanned straight-line connector.
    if (!shared) { segments.push(current); current = [...leg.points] }
    else current = current.concat(leg.points.slice(1))
  })
  segments.push(current)
  return segments
}

export function routeStats(draft: RouteDraft) {
  let meters = 0
  let ascent = 0
  let elevationComplete = true
  let hasEdge = false
  for (const segment of segmentsFromDraft(draft)) {
    for (let i = 1; i < segment.length; i++) {
      hasEdge = true
      meters += distance(segment[i - 1], segment[i])
      const a = segment[i - 1].ele, b = segment[i].ele
      if (a === undefined || b === undefined) elevationComplete = false
      else ascent += Math.max(0, b - a)
    }
  }
  return { meters, ascent: hasEdge && elevationComplete ? ascent : null }
}

export function splitLeg(draft: RouteDraft, index: number, pointIndex: number): RouteDraft {
  const leg = draft.legs[index]
  if (!leg || pointIndex <= 0 || pointIndex >= leg.points.length - 1
    || draft.anchors.length >= MAX_ANCHORS) return draft
  const anchors = [...draft.anchors]
  anchors.splice(index + 1, 0, leg.points[pointIndex])
  const legs = [...draft.legs]
  legs.splice(index, 1,
    { ...leg, points: leg.points.slice(0, pointIndex + 1) },
    { ...leg, points: leg.points.slice(pointIndex) })
  return { ...draft, anchors, legs }
}

export function isDraft(value: unknown): value is RouteDraft {
  if (!value || typeof value !== 'object') return false
  const d = value as RouteDraft
  if (typeof d.name !== 'string' || d.name.length > 200 || !Array.isArray(d.anchors)
    || d.anchors.length > MAX_ANCHORS || !d.anchors.every(isPoint)
    || !Array.isArray(d.legs) || d.legs.length !== Math.max(0, d.anchors.length - 1)) return false
  let count = 0
  return d.legs.every(leg => {
    if (leg === null) return true
    if (!leg || !['imported', 'routed', 'direct'].includes(leg.source) || !Array.isArray(leg.points)
      || leg.points.length < 2) return false
    count += leg.points.length
    return count <= 160000 && leg.points.every(isPoint)
  })
}
