import { draftFromSegments, segmentsFromDraft } from './model'
import type { Point, RouteDraft } from './model'

function children(element: Element, name: string): Element[] {
  return Array.from(element.children).filter(child => child.localName === name)
}

export function parseGpx(text: string, fallbackName: string): RouteDraft {
  if (text.length > 10 * 1024 * 1024) throw new Error('GPX_SIZE')
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('INVALID_GPX')
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.getElementsByTagName('parsererror').length || xml.documentElement.localName !== 'gpx') {
    throw new Error('INVALID_GPX')
  }
  const root = xml.documentElement
  const tracks = children(root, 'trk')
  const routes = children(root, 'rte')
  const containers = tracks.length ? tracks.flatMap(track => children(track, 'trkseg')) : routes
  const tag = tracks.length ? 'trkpt' : 'rtept'
  const segments = containers.map(container => children(container, tag).map(element => {
    const lat = element.getAttribute('lat'), lng = element.getAttribute('lon')
    if (!lat?.trim() || !lng?.trim()) throw new Error('INVALID_GPX')
    const point: Point = { lat: Number(lat), lng: Number(lng) }
    const ele = children(element, 'ele')[0]?.textContent?.trim()
    if (ele) {
      point.ele = Number(ele)
      if (!Number.isFinite(point.ele)) throw new Error('INVALID_GPX')
    }
    return point
  })).filter(segment => segment.length)
  const name = children(tracks[0] || routes[0] || root, 'name')[0]?.textContent?.trim() || fallbackName
  return draftFromSegments(name, segments)
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, c => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
}[c]!))

export function exportGpx(draft: RouteDraft): string {
  const segments = segmentsFromDraft(draft).map(points =>
    `    <trkseg>\n${points.map(p => `      <trkpt lat="${p.lat}" lon="${p.lng}">${p.ele === undefined ? '' : `<ele>${p.ele}</ele>`}</trkpt>`).join('\n')}\n    </trkseg>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="PWRX" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <name>${escapeXml(draft.name || 'PWRX Route')}</name>\n${segments.join('\n')}\n  </trk>\n</gpx>\n`
}
