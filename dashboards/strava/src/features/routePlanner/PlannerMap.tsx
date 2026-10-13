import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { Point, RouteDraft } from './model'
import { distance } from './model'
import { MapTileLayer } from '../../components/MapTileLayer'
import 'leaflet/dist/leaflet.css'

type Props = {
  draft: RouteDraft; adding: boolean; disabled: boolean; fitToken: number
  onAdd: (p: Point) => void; onMove: (index: number, p: Point) => void
  onSplit: (leg: number, point: number) => void
}

function Viewport({ draft, fitToken, adding, disabled, onAdd }: Props) {
  const map = useMapEvents({ click: e => { if (adding && !disabled) onAdd({ lat: e.latlng.lat, lng: e.latlng.lng }) } })
  useEffect(() => {
    const points = draft.legs.flatMap(leg => leg?.points || [])
    if (!points.length) points.push(...draft.anchors)
    if (points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 15 })
    // Fit only on an explicit request, not while dragging or adding a point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, map])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

export function PlannerMap(props: Props) {
  const { draft, adding, disabled, onMove, onSplit } = props
  return (
    <MapContainer center={[50.2, 10]} zoom={7} className={`h-full w-full ${adding ? 'cursor-crosshair' : ''}`}>
      <MapTileLayer />
      <Viewport {...props} />
      {draft.legs.map((leg, index) => leg && <Polyline key={index}
        positions={leg.points.map(p => [p.lat, p.lng])}
        pathOptions={{ color: leg.source === 'imported' ? '#38bdf8' : '#f97316', weight: 5, dashArray: leg.source === 'direct' ? '8 8' : undefined }}
        bubblingMouseEvents={false}
        eventHandlers={{ click: e => {
          if (disabled) return
          let best = 0, closest = Infinity
          leg.points.forEach((point, i) => {
            const d = distance(point, { lat: e.latlng.lat, lng: e.latlng.lng })
            if (d < closest) { closest = d; best = i }
          })
          onSplit(index, best)
        } }} />)}
      {draft.anchors.map((point, index) => <Marker key={`${index}-${point.lat}-${point.lng}`}
        position={[point.lat, point.lng]} draggable={!disabled}
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
