import { draftFromSegments, isPoint } from './model'
import type { Point } from './model'

export function draftFromActivity(activity: { name?: string; streams?: { latlng?: unknown[]; altitude?: unknown[] } }) {
  const gps = activity.streams?.latlng
  if (!Array.isArray(gps) || gps.length < 2) throw new Error('ACTIVITY_NO_GPS')
  if (gps.length > 150000) throw new Error('GPX_SIZE')
  const altitude = activity.streams?.altitude
  const aligned = Array.isArray(altitude) && altitude.length === gps.length
  const segments: Point[][] = []
  let current: Point[] = []
  for (let i = 0; i < gps.length; i++) {
    const pair = gps[i]
    const point = Array.isArray(pair) ? { lat: pair[0], lng: pair[1] } as Point : null
    if (!point || !isPoint(point)) {
      if (current.length) { segments.push(current); current = [] }
      continue
    }
    if (aligned && typeof altitude[i] === 'number' && Number.isFinite(altitude[i])) point.ele = altitude[i] as number
    current.push(point)
  }
  if (current.length) segments.push(current)
  if (!segments.some(s => s.length > 1)) throw new Error('ACTIVITY_NO_GPS')
  return draftFromSegments(activity.name || 'Route', segments)
}
