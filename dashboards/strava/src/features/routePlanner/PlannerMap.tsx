import { useEffect, useRef } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, Tooltip, useMapEvents } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import type { Point, RouteDraft } from './model'
import { distance } from './model'
import { categories, coloredSections } from './ways'
import type { ColorMode } from './ways'
import { MapTileLayer } from '../../components/MapTileLayer'
import 'leaflet/dist/leaflet.css'

type Props = {
  draft: RouteDraft; adding: boolean; disabled: boolean; fitToken: number; colorMode?: ColorMode
  onAdd: (p: Point) => void; onMove: (index: number, p: Point) => void
  onSplit: (leg: number, point: number) => void
  selecting?: boolean; selection?: Point | null; onSelect?: (p: Point) => void
}

function Viewport({ draft, fitToken, adding, disabled, onAdd, selecting, selection, onSelect }: Props) {
  const fitAfterResize = useRef<(() => void) | null>(null)
  const map = useMapEvents({ click: e => {
    if (disabled) return
    const point = { lat: e.latlng.lat, lng: e.latlng.lng }
    if (selecting) onSelect?.(point)
    else if (adding) onAdd(point)
  } })
  useEffect(() => { if (selection) map.setView([selection.lat, selection.lng], Math.max(map.getZoom(), 11)) }, [map, selection])
  useEffect(() => {
    fitAfterResize.current = () => {
      const points = draft.legs.flatMap(leg => leg?.points || [])
      if (!points.length) points.push(...draft.anchors)
      if (points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 15, animate: false })
    }
  }, [draft, map])
  useEffect(() => {
    const points = draft.legs.flatMap(leg => leg?.points || [])
    if (!points.length) points.push(...draft.anchors)
    if (points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 15, animate: false })
    // Fit only on an explicit request, not while dragging or adding a point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, map])
  useEffect(() => {
    const observer = new ResizeObserver(() => { map.invalidateSize(); fitAfterResize.current?.() })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

export function PlannerMap(props: Props) {
  const { draft, adding, disabled, onMove, onSplit } = props
  const { i18n } = useTranslation()
  const language = i18n.language.startsWith('de') ? 'de' : 'en'
  const colorMode = props.colorMode || 'origin'
  return (
    <MapContainer center={[50.2, 10]} zoom={7} className={`h-full w-full ${adding || props.selecting ? 'cursor-crosshair' : ''}`}>
      <MapTileLayer />
      <Viewport {...props} />
      {props.selection && <CircleMarker center={[props.selection.lat, props.selection.lng]} radius={9} pathOptions={{ color: '#fff', fillColor: '#16a34a', fillOpacity: 1, weight: 2 }} interactive={false} />}
      {draft.legs.flatMap((leg, index) => leg ? (colorMode === 'origin'
        ? [{ category: 'unknown' as const, points: leg.points }] : coloredSections(leg, colorMode)).map((section, sectionIndex) => <Polyline key={`${index}-${sectionIndex}`}
        positions={section.points.map(p => [p.lat, p.lng])}
        pathOptions={{ color: colorMode === 'origin' ? (leg.source === 'imported' ? '#38bdf8' : '#f97316') : categories[section.category].color, weight: 5, dashArray: leg.source === 'direct' ? '8 8' : undefined }}
        bubblingMouseEvents={false}
        eventHandlers={{ click: e => {
          if (disabled) return
          if (props.selecting) { props.onSelect?.({ lat: e.latlng.lat, lng: e.latlng.lng }); return }
          let best = 0, closest = Infinity
          leg.points.forEach((point, i) => {
            const d = distance(point, { lat: e.latlng.lat, lng: e.latlng.lng })
            if (d < closest) { closest = d; best = i }
          })
          onSplit(index, best)
        } }} >{colorMode !== 'origin' && <Tooltip sticky>{categories[section.category][language]}</Tooltip>}</Polyline>) : [])}
      {draft.anchors.map((point, index) => <Marker key={`${index}-${point.lat}-${point.lng}`}
        position={[point.lat, point.lng]} draggable={!disabled && !props.selecting}
        icon={L.divIcon({ className: 'pwrx-route-anchor', iconSize: [28, 28], iconAnchor: [14, 14],
          html: `<span style="display:grid;place-items:center;width:28px;height:28px;border:2px solid white;border-radius:50%;background:${index === 0 ? '#15803d' : '#c2410c'};color:white;font:bold 12px sans-serif">${index + 1}</span>` })}
        title={`${index + 1}`} eventHandlers={{ dragend: e => {
          const marker = e.target as L.Marker
          const next = marker.getLatLng()
          marker.setLatLng([point.lat, point.lng])
          onMove(index, { lat: next.lat, lng: next.lng })
        } }} />)}
    </MapContainer>
  )
}
