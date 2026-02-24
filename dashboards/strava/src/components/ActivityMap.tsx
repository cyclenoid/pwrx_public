import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from './ThemeProvider'

// Fix for default marker icons in Leaflet with Vite
const iconDefaultProto = L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown }
delete iconDefaultProto._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom icons
const startIcon = new L.DivIcon({
  className: 'custom-marker',
  html: `<div style="
    background-color: #22c55e;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
  ">
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

const endIcon = new L.DivIcon({
  className: 'custom-marker',
  html: `<div style="
    background-color: #ef4444;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
  ">
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

// Component to fit bounds
function FitBounds({ bounds, fitKey }: { bounds: L.LatLngBoundsExpression; fitKey: string }) {
  const map = useMap()
  const lastFitKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (lastFitKeyRef.current === fitKey) return
    map.whenReady(() => {
      map.fitBounds(bounds, { padding: [30, 30], animate: false })
      lastFitKeyRef.current = fitKey
    })
  }, [map, bounds, fitKey])
  return null
}

// Hover marker icon (bright cyan for visibility)
const hoverIcon = new L.DivIcon({
  className: 'custom-marker hover-marker',
  html: `<div style="
    background-color: #06b6d4;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(6, 182, 212, 0.6);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

// Component to update hover marker position
function HoverMarker({ position }: { position: [number, number] | null }) {
  if (!position) return null
  // Use key to force re-render when position changes
  return <Marker key={`${position[0]}-${position[1]}`} position={position} icon={hoverIcon} />
}

interface ActivityMapProps {
  coordinates: [number, number][]
  showMarkers?: boolean
  className?: string
  hoverPosition?: [number, number] | null
  highlightRange?: { startIndex: number; endIndex: number } | null
  highlightStyle?: { color?: string; weight?: number; opacity?: number }
  showHighlightMarkers?: boolean
  focusHighlight?: boolean
}

export function ActivityMap({
  coordinates,
  showMarkers = true,
  className = '',
  hoverPosition,
  highlightRange,
  highlightStyle,
  showHighlightMarkers = true,
  focusHighlight = false,
}: ActivityMapProps) {
  const { resolvedTheme } = useTheme()

  const normalizedCoordinates = useMemo(() => {
    if (!coordinates || coordinates.length === 0) return []
    const isValidCoord = (coord: [number, number] | null | undefined): coord is [number, number] =>
      Array.isArray(coord)
      && coord.length === 2
      && Number.isFinite(coord[0])
      && Number.isFinite(coord[1])

    const firstValid = coordinates.find(isValidCoord)
    if (!firstValid) return []

    let lastValid: [number, number] = firstValid
    return coordinates.map((coord) => {
      if (isValidCoord(coord)) {
        lastValid = coord
        return coord
      }
      return lastValid
    })
  }, [coordinates])

  const highlightCoordinates = useMemo(() => {
    if (!highlightRange) return []
    return normalizedCoordinates.slice(highlightRange.startIndex, highlightRange.endIndex + 1)
  }, [highlightRange, normalizedCoordinates])

  const hasHighlight = highlightCoordinates.length > 1
  const baseBounds = useMemo(() => (
    normalizedCoordinates.length > 0
      ? L.latLngBounds(normalizedCoordinates)
      : L.latLngBounds([[0, 0], [0, 0]])
  ), [normalizedCoordinates])
  const activeBounds = useMemo(() => {
    if (focusHighlight && hasHighlight) {
      return L.latLngBounds(highlightCoordinates)
    }
    return baseBounds
  }, [focusHighlight, hasHighlight, highlightCoordinates, baseBounds])
  const center = activeBounds.getCenter()
  const fitKey = useMemo(() => {
    if (normalizedCoordinates.length === 0) return 'empty'
    const activeCoords = (focusHighlight && hasHighlight)
      ? highlightCoordinates
      : normalizedCoordinates
    const first = activeCoords[0]
    const last = activeCoords[activeCoords.length - 1]
    return `${activeCoords.length}-${first[0]}-${first[1]}-${last[0]}-${last[1]}`
  }, [focusHighlight, hasHighlight, highlightCoordinates, normalizedCoordinates])

  if (normalizedCoordinates.length === 0) {
    return null
  }

  // Start and end points
  const startPoint = normalizedCoordinates[0]
  const endPoint = normalizedCoordinates[normalizedCoordinates.length - 1]
  const selectedStartPoint = hasHighlight ? highlightCoordinates[0] : null
  const selectedEndPoint = hasHighlight ? highlightCoordinates[highlightCoordinates.length - 1] : null
  const highlightPathOptions = {
    color: highlightStyle?.color ?? '#f59e0b',
    weight: highlightStyle?.weight ?? 6,
    opacity: highlightStyle?.opacity ?? 0.85,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
  }

  // Tile layers for different themes
  const tileUrl = resolvedTheme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const attribution = resolvedTheme === 'dark'
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      className={`h-full w-full rounded-lg ${className}`}
      style={{ minHeight: '400px' }}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
    >
      <TileLayer url={tileUrl} attribution={attribution} />
      <FitBounds bounds={activeBounds} fitKey={fitKey} />

      {/* Route polyline with Strava Orange */}
      <Polyline
        positions={normalizedCoordinates}
        pathOptions={{
          color: '#fc4c02',
          weight: 4,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />

      {/* Highlighted selection segment */}
      {hasHighlight && (
        <Polyline
          positions={highlightCoordinates}
          pathOptions={highlightPathOptions}
        />
      )}

      {/* Start and End markers */}
      {showMarkers && (
        <>
          <Marker position={startPoint} icon={startIcon} />
          <Marker position={endPoint} icon={endIcon} />
        </>
      )}

      {showHighlightMarkers && selectedStartPoint && selectedEndPoint && (
        <>
          <Marker position={selectedStartPoint} icon={startIcon} />
          <Marker position={selectedEndPoint} icon={endIcon} />
        </>
      )}

      {/* Hover position marker */}
      <HoverMarker position={hoverPosition ?? null} />
    </MapContainer>
  )
}
