import { useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from './ThemeProvider'

interface SegmentMapItem {
  segment_id: number
  name: string
  start_latlng: [number, number] | null
  end_latlng: [number, number] | null
  attempts: number
  best_elapsed: number | null
}

const isValidLatLng = (value: [number, number] | null | undefined): value is [number, number] => {
  return Array.isArray(value)
    && value.length === 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
}

export function SegmentMap({ segments }: { segments: SegmentMapItem[] }) {
  const { resolvedTheme } = useTheme()

  const segmentPoints = useMemo(() => {
    return segments
      .filter((segment) => isValidLatLng(segment.start_latlng) && isValidLatLng(segment.end_latlng))
      .map((segment) => ({
        ...segment,
        start: segment.start_latlng as [number, number],
        end: segment.end_latlng as [number, number],
      }))
  }, [segments])

  if (segmentPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Keine Segment-Koordinaten verfügbar.
      </div>
    )
  }

  const bounds = L.latLngBounds(
    segmentPoints.flatMap((segment) => [segment.start, segment.end])
  )
  const center = bounds.getCenter()

  const tileUrl = resolvedTheme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const attribution = resolvedTheme === 'dark'
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={10}
      className="h-full w-full rounded-lg"
      style={{ minHeight: '360px' }}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
    >
      <TileLayer url={tileUrl} attribution={attribution} />

      {segmentPoints.map((segment) => (
        <Polyline
          key={`line-${segment.segment_id}`}
          positions={[segment.start, segment.end]}
          pathOptions={{
            color: '#f97316',
            weight: 2,
            opacity: 0.4,
          }}
        />
      ))}

      {segmentPoints.map((segment) => (
        <CircleMarker
          key={`start-${segment.segment_id}`}
          center={segment.start}
          radius={4}
          pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.8 }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
            <div className="text-xs">
              <div className="font-semibold">{segment.name}</div>
              <div>{segment.attempts} Versuche</div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {segmentPoints.map((segment) => (
        <CircleMarker
          key={`end-${segment.segment_id}`}
          center={segment.end}
          radius={4}
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8 }}
        />
      ))}
    </MapContainer>
  )
}
