import { useEffect, useMemo } from 'react'
import { MapContainer, Polyline, useMap } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import { MapTileLayer } from '../../components/MapTileLayer'
import type { Point } from './model'
import { distance } from './model'

function Fit({ bounds }: { bounds: [LatLngTuple, LatLngTuple] }) {
  const map = useMap()
  useEffect(() => {
    const fit = () => { map.invalidateSize(); map.fitBounds(bounds, { padding: [12, 12], animate: false, maxZoom: 15 }) }
    const observer = new ResizeObserver(fit); observer.observe(map.getContainer()); fit()
    return () => observer.disconnect()
  }, [map, bounds])
  return null
}
export function TripPreview({ points, label }: { points: Point[]; label: string }) {
  const { positions, bounds, elevation } = useMemo(() => {
    let south = 90, north = -90, west = 180, east = -180, low = Infinity, high = -Infinity
    const traveled: number[] = []
    for (let i = 0; i < points.length; i++) { const p = points[i]; traveled.push(i ? traveled[i - 1] + distance(points[i - 1], p) : 0); south = Math.min(south, p.lat); north = Math.max(north, p.lat); west = Math.min(west, p.lng); east = Math.max(east, p.lng); if (p.ele !== undefined) { low = Math.min(low, p.ele); high = Math.max(high, p.ele) } }
    const count = Math.min(400, points.length), indices = Array.from({ length: count }, (_, i) => Math.round(i * (points.length - 1) / (count - 1))), sample = indices.map(i => points[i])
    return { positions: sample.map(p => [p.lat, p.lng] as LatLngTuple), bounds: [[south, west], [north, east]] as [LatLngTuple, LatLngTuple],
      elevation: points.every(p => p.ele !== undefined) ? sample.map((p, i) => `${traveled[indices[i]] / Math.max(1, traveled.at(-1)!) * 300},${45 - (p.ele! - low) / Math.max(1, high - low) * 40}`).join(' ') : null }
  }, [points])
  return <>
    <div className="relative isolate h-32 overflow-hidden rounded-lg" aria-label={label}>
      <MapContainer bounds={bounds} className="h-full w-full" zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} boxZoom={false} keyboard={false}>
        <MapTileLayer /><Fit bounds={bounds} /><Polyline positions={positions} pathOptions={{ color: '#f97316', weight: 3 }} interactive={false} />
      </MapContainer>
    </div>
    {elevation && <svg viewBox="0 0 300 50" className="h-12 w-full" role="img" aria-label={label}><polyline points={elevation} fill="none" stroke="#f97316" strokeWidth="2" /></svg>}
  </>
}
