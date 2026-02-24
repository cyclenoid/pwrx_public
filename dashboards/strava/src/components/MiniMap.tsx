import { useMemo, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTheme } from './ThemeProvider'
import 'leaflet/dist/leaflet.css'

interface MiniMapProps {
  coordinates: [number, number][]
  className?: string
}

// Component to fit bounds after map is ready
function FitBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (hasFitted.current || !bounds) return
    map.fitBounds(bounds, { padding: [5, 5] })
    hasFitted.current = true
  }, [map, bounds])

  return null
}

export function MiniMap({ coordinates, className = '' }: MiniMapProps) {
  const { resolvedTheme } = useTheme()

  const bounds = useMemo(() => {
    if (!coordinates || coordinates.length === 0) return null
    return L.latLngBounds(coordinates)
  }, [coordinates])

  const center = useMemo(() => {
    if (!bounds) return [51.1657, 10.4515] as [number, number]
    const c = bounds.getCenter()
    return [c.lat, c.lng] as [number, number]
  }, [bounds])

  // Tile layers for different themes
  const tileUrl = resolvedTheme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

  if (!coordinates || coordinates.length === 0) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground opacity-50">
          <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/>
        </svg>
      </div>
    )
  }

  return (
    <div className={`overflow-hidden ${className}`}>
      <MapContainer
        center={center}
        zoom={12}
        className="h-full w-full"
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        attributionControl={false}
      >
        <TileLayer url={tileUrl} />
        <FitBounds bounds={bounds} />
        <Polyline
          positions={coordinates}
          pathOptions={{
            color: '#fc4c02',
            weight: 2,
            opacity: 0.9,
          }}
        />
      </MapContainer>
    </div>
  )
}
