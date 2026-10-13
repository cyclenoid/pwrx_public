import { distance } from './model'
import type { Leg, Point, RouteDraft, Way } from './model'
export type ColorMode = 'origin' | 'surface' | 'highway'
export const categories = {
  asphalt: { color: '#a78bfa', de: 'Asphalt', en: 'Asphalt' },
  paved: { color: '#94a3b8', de: 'Sonstig befestigt', en: 'Other paved' },
  paving: { color: '#f472b6', de: 'Pflaster', en: 'Paving stones' },
  gravel: { color: '#fbbf24', de: 'Schotter / verdichtet', en: 'Gravel / compacted' },
  natural: { color: '#a3e635', de: 'Naturboden / unbefestigt', en: 'Natural / unpaved' },
  road: { color: '#a78bfa', de: 'Straße', en: 'Road' },
  cycleway: { color: '#22d3ee', de: 'Radweg', en: 'Cycleway' },
  track: { color: '#fbbf24', de: 'Feld-/Forstweg', en: 'Track' },
  path: { color: '#a3e635', de: 'Pfad / Fußweg', en: 'Path / footway' },
  other: { color: '#f472b6', de: 'Sonstige', en: 'Other' },
  unknown: { color: '#64748b', de: 'Unbekannt', en: 'Unknown' },
} as const
export type Category = keyof typeof categories
export function category(way: Way | undefined, mode: ColorMode): Category {
  if (mode === 'surface') {
    const s = way?.surface
    if (!s || s === 'unknown') return 'unknown'
    if (s === 'asphalt') return 'asphalt'
    if (['fine_gravel', 'gravel', 'compacted', 'pebblestone'].includes(s)) return 'gravel'
    if (['paving_stones', 'cobblestone', 'sett', 'unhewn_cobblestone'].includes(s)) return 'paving'
    if (['paved', 'concrete', 'concrete:plates', 'concrete:lanes'].includes(s)) return 'paved'
    if (['unpaved', 'ground', 'dirt', 'earth', 'grass', 'sand', 'mud', 'woodchips'].includes(s)) return 'natural'
    return 'other'
  }
  const h = way?.highway
  if (!h || h === 'unknown') return 'unknown'
  if (h === 'cycleway') return 'cycleway'
  if (h === 'track') return 'track'
  if (['path', 'footway', 'bridleway', 'steps', 'pedestrian'].includes(h)) return 'path'
  if (['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'road', 'trunk', 'motorway'].some(v => h === v || h === `${v}_link`)) return 'road'
  return 'other'
}
export function coloredSections(leg: Leg, mode: ColorMode): { category: Category; points: Point[] }[] {
  const result: { category: Category; points: Point[] }[] = []
  for (let i = 1; i < leg.points.length; i++) {
    const key = category(leg.source === 'routed' ? leg.points[i].way : undefined, mode)
    const last = result[result.length - 1]
    if (last?.category === key) last.points.push(leg.points[i])
    else result.push({ category: key, points: [leg.points[i - 1], leg.points[i]] })
  }
  return result
}
export function waySummary(draft: RouteDraft, mode: ColorMode) {
  const totals: Partial<Record<Category, number>> = {}
  for (const leg of draft.legs) if (leg) for (let i = 1; i < leg.points.length; i++) {
    const key = category(leg.source === 'routed' ? leg.points[i].way : undefined, mode)
    totals[key] = (totals[key] || 0) + distance(leg.points[i - 1], leg.points[i])
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]) as [Category, number][]
}
