import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from './ThemeProvider'

const isValidLatLng = (value: [number, number] | null | undefined): value is [number, number] => {
  return Array.isArray(value)
    && value.length === 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
}

export function SegmentMiniMap({ start, end }: { start?: [number, number] | null; end?: [number, number] | null }) {
  const { resolvedTheme } = useTheme()

  if (!isValidLatLng(start) || !isValidLatLng(end)) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground">
        Keine GPS-Daten
      </div>
    )
  }

  const bounds = L.latLngBounds([start, end])
  const center = bounds.getCenter()

  const tileUrl = resolvedTheme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      className="h-full w-full rounded-md"
      style={{ minHeight: '120px' }}
      zoomControl={false}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      keyboard={false}
      touchZoom={false}
      attributionControl={false}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
    >
      <TileLayer url={tileUrl} />
      <Polyline
        positions={[start, end]}
        pathOptions={{ color: '#f97316', weight: 3, opacity: 0.9 }}
      />
      <CircleMarker center={start} radius={4} pathOptions={{ color: '#22c55e', fillOpacity: 0.9 }} />
      <CircleMarker center={end} radius={4} pathOptions={{ color: '#ef4444', fillOpacity: 0.9 }} />
    </MapContainer>
  )
}
