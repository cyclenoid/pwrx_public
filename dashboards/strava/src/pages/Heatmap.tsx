import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapContainer, TileLayer, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { getHeatmapData, clearHeatmapCache, getHeatmapHotspots } from '../lib/api'
import { useTheme } from '../components/ThemeProvider'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import { useTranslation } from 'react-i18next'

const TYPE_PALETTE = [
  '#f97316', // orange
  '#06b6d4', // cyan
  '#22c55e', // green
  '#f43f5e', // rose
  '#a855f7', // purple
  '#eab308', // amber
  '#38bdf8', // sky
  '#84cc16', // lime
  '#fb7185', // pink
  '#14b8a6', // teal
  '#60a5fa', // blue
  '#f59e0b', // amber
]

const YEAR_PALETTE = [
  '#22c55e', // green
  '#38bdf8', // sky
  '#f97316', // orange
  '#a855f7', // purple
  '#f43f5e', // rose
  '#14b8a6', // teal
  '#eab308', // amber
  '#60a5fa', // blue
]

const HEATMAP_SEGMENT_GRID_DEG = 0.00045
const HOTSPOT_MAX_ITEMS = 24
const HOTSPOT_MIN_ACTIVITY_COUNT = 1
const HOTSPOT_MIN_DISTANCE_KM = 40

type Hotspot = {
  id: string
  lat: number
  lng: number
  activityCount: number
  distanceKm: number
  label: string | null
}

type ActivityWithBounds = {
  strava_activity_id: number
  name: string
  type: string
  start_date: string
  distance_km: number
  latlng: [number, number][]
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

type MapViewportState = {
  zoom: number
  bounds: { south: number; west: number; north: number; east: number } | null
}

const isVirtualActivityType = (type: string) => {
  const value = String(type || '').toLowerCase()
  return value.includes('virtual') || value.includes('zwift')
}

const toSegmentKey = (a: [number, number], b: [number, number]) => {
  const snap = (value: number) => Math.round(value / HEATMAP_SEGMENT_GRID_DEG) * HEATMAP_SEGMENT_GRID_DEG
  const aKey = `${snap(a[0]).toFixed(5)},${snap(a[1]).toFixed(5)}`
  const bKey = `${snap(b[0]).toFixed(5)},${snap(b[1]).toFixed(5)}`
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
}

const percentile = (values: number[], q: number) => {
  if (values.length === 0) return 1
  const sorted = [...values].sort((a, b) => a - b)
  const clamped = Math.max(0, Math.min(1, q))
  const pos = (sorted.length - 1) * clamped
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)
  if (lower === upper) return sorted[lower]
  const weight = pos - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

const normalizeHeatIntensity = (score: number, maxScore: number) => {
  if (!Number.isFinite(score) || score <= 1 || maxScore <= 1) return 0
  return Math.min(1, Math.log1p(score - 1) / Math.log1p(maxScore - 1))
}

const interpolateHexColor = (from: string, to: string, t: number) => {
  const clamp = Math.max(0, Math.min(1, t))
  const parse = (hex: string) => {
    const raw = hex.replace('#', '')
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    }
  }
  const a = parse(from)
  const b = parse(to)
  const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0')
  const r = a.r + (b.r - a.r) * clamp
  const g = a.g + (b.g - a.g) * clamp
  const bl = a.b + (b.b - a.b) * clamp
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`
}

const getHeatColor = (intensity: number) => {
  if (intensity <= 0.5) {
    return interpolateHexColor('#ef4444', '#f97316', intensity / 0.5)
  }
  return interpolateHexColor('#f97316', '#fde68a', (intensity - 0.5) / 0.5)
}

const getReadableTextColor = (hexColor: string) => {
  const hex = hexColor.replace('#', '')
  if (hex.length !== 6) return '#0f172a'
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.6 ? '#0f172a' : '#f8fafc'
}

function MapViewportManager({
  allCoordinates,
  hotspots,
  selectedActivityCoords,
  focusTarget,
  viewportKey,
}: {
  allCoordinates: [number, number][][]
  hotspots: Hotspot[]
  selectedActivityCoords: [number, number][] | null
  focusTarget: { lat: number; lng: number; requestId: number } | null
  viewportKey: string
}) {
  const map = useMap()
  const lastAutoViewport = useRef('')
  const lastFocusRequest = useRef(0)

  useEffect(() => {
    if (!selectedActivityCoords || selectedActivityCoords.length === 0) return
    if (selectedActivityCoords.length === 1) {
      map.setView(selectedActivityCoords[0], 14, { animate: true })
      return
    }
    map.fitBounds(L.latLngBounds(selectedActivityCoords), { padding: [40, 40] })
  }, [map, selectedActivityCoords])

  useEffect(() => {
    if (!focusTarget) return
    if (lastFocusRequest.current === focusTarget.requestId) return
    lastFocusRequest.current = focusTarget.requestId
    map.setView([focusTarget.lat, focusTarget.lng], 13, { animate: true })
  }, [map, focusTarget])

  useEffect(() => {
    if (selectedActivityCoords && selectedActivityCoords.length > 0) return
    if (lastAutoViewport.current === viewportKey) return
    lastAutoViewport.current = viewportKey

    if (hotspots.length > 0) {
      map.setView([hotspots[0].lat, hotspots[0].lng], 12, { animate: false })
      return
    }

    if (allCoordinates.length > 0) {
      const allPoints = allCoordinates.flat()
      if (allPoints.length > 0) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30] })
      }
    }
  }, [map, allCoordinates, hotspots, selectedActivityCoords, viewportKey])

  return null
}

function MapViewStateTracker({
  onChange,
}: {
  onChange: (state: MapViewportState) => void
}) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds()
      onChange({
        zoom: map.getZoom(),
        bounds: {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        },
      })
    },
    zoomend: () => {
      const bounds = map.getBounds()
      onChange({
        zoom: map.getZoom(),
        bounds: {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        },
      })
    },
  })

  useEffect(() => {
    const bounds = map.getBounds()
    onChange({
      zoom: map.getZoom(),
      bounds: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      },
    })
  }, [map, onChange])

  return null
}

export function Heatmap() {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const queryClient = useQueryClient()
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedYears, setSelectedYears] = useState<number[]>([])
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null)
  const [focusTarget, setFocusTarget] = useState<{ lat: number; lng: number; requestId: number } | null>(null)
  const [mapViewport, setMapViewport] = useState<MapViewportState>({ zoom: 6, bounds: null })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const didInitTypeDefaults = useRef(false)

  const { data, isLoading } = useQuery({
    queryKey: ['heatmap'],
    queryFn: () => getHeatmapData(),
    staleTime: 1000 * 60 * 60, // Consider data fresh for 1 hour in React Query
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await clearHeatmapCache()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['heatmap'] }),
        queryClient.invalidateQueries({ queryKey: ['heatmap-hotspots'] }),
      ])
    } finally {
      setIsRefreshing(false)
    }
  }

  // Get unique activity types and years
  const activityTypes = useMemo(() => {
    if (!data) return []
    return [...new Set(data.activities.map(a => a.type))].sort()
  }, [data])

  const years = useMemo(() => {
    if (!data) return []
    return [...new Set(data.activities.map(a => new Date(a.start_date).getFullYear()))].sort((a, b) => b - a)
  }, [data])

  useEffect(() => {
    if (didInitTypeDefaults.current) return
    if (activityTypes.length === 0) return

    const nonVirtualTypes = activityTypes.filter((type) => !isVirtualActivityType(type))
    if (nonVirtualTypes.length > 0 && nonVirtualTypes.length < activityTypes.length) {
      setSelectedTypes(nonVirtualTypes)
    }

    didInitTypeDefaults.current = true
  }, [activityTypes])

  const typeColors = useMemo(() => {
    const map = new Map<string, string>()
    activityTypes.forEach((type, index) => {
      map.set(type, TYPE_PALETTE[index % TYPE_PALETTE.length])
    })
    return map
  }, [activityTypes])

  const yearColors = useMemo(() => {
    const map = new Map<number, string>()
    years.forEach((value, index) => {
      map.set(value, YEAR_PALETTE[index % YEAR_PALETTE.length])
    })
    return map
  }, [years])

  const filteredActivities = useMemo(() => {
    if (!data) return []
    return data.activities.filter((activity) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(activity.type)) {
        return false
      }
      const activityYear = new Date(activity.start_date).getFullYear()
      if (selectedYears.length > 0 && !selectedYears.includes(activityYear)) {
        return false
      }
      return true
    })
  }, [data, selectedTypes, selectedYears])

  // All coordinates for bounds calculation
  const allCoordinates = useMemo(() => {
    return filteredActivities.map(a => a.latlng).filter(coords => coords && coords.length > 0)
  }, [filteredActivities])

  const activityHeatData = useMemo(() => {
    const segmentCounts = new Map<string, number>()
    const activitySegments = new Map<number, string[]>()

    filteredActivities.forEach((activity) => {
      const points = activity.latlng
      if (!points || points.length < 2) {
        activitySegments.set(activity.strava_activity_id, [])
        return
      }

      const keys: string[] = []
      for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1]
        const current = points[i]
        const key = toSegmentKey(previous, current)
        keys.push(key)
        segmentCounts.set(key, (segmentCounts.get(key) || 0) + 1)
      }
      activitySegments.set(activity.strava_activity_id, keys)
    })

    const scoreByActivity = new Map<number, number>()
    const allScores: number[] = []

    filteredActivities.forEach((activity) => {
      const keys = activitySegments.get(activity.strava_activity_id) || []
      if (keys.length === 0) {
        scoreByActivity.set(activity.strava_activity_id, 1)
        allScores.push(1)
        return
      }

      const segmentScores = keys.map((key) => segmentCounts.get(key) || 1)
      // Emphasize "where activity was densest", not full-route average.
      const score = percentile(segmentScores, 0.9)
      scoreByActivity.set(activity.strava_activity_id, score)
      allScores.push(score)
    })

    // Robust scaling against single extreme outliers.
    const maxScore = Math.max(1, percentile(allScores, 0.95))
    return { scoreByActivity, maxScore }
  }, [filteredActivities])

  // Tile layers for different themes
  const tileUrl = resolvedTheme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const attribution = resolvedTheme === 'dark'
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  // Calculate stats
  const totalDistance = useMemo(() => {
    return filteredActivities.reduce((sum, a) => sum + Number(a.distance_km), 0)
  }, [filteredActivities])

  const selectedActivityData = useMemo(() => {
    if (!selectedActivity) return null
    return filteredActivities.find(a => a.strava_activity_id === selectedActivity) || null
  }, [selectedActivity, filteredActivities])

  const filteredYears = useMemo(() => {
    return [...new Set(filteredActivities.map(a => new Date(a.start_date).getFullYear()))].sort((a, b) => b - a)
  }, [filteredActivities])

  const filteredTypes = useMemo(() => {
    return [...new Set(filteredActivities.map(a => a.type))].sort()
  }, [filteredActivities])

  const { data: hotspotsResponse } = useQuery({
    queryKey: ['heatmap-hotspots', [...selectedTypes].sort().join(','), [...selectedYears].sort((a, b) => a - b).join(',')],
    enabled: !!data,
    staleTime: 1000 * 60 * 30,
    queryFn: () => getHeatmapHotspots({
      types: selectedTypes,
      years: selectedYears,
      exclude_virtual: true,
      limit: HOTSPOT_MAX_ITEMS,
      min_activity_count: HOTSPOT_MIN_ACTIVITY_COUNT,
      min_distance_km: HOTSPOT_MIN_DISTANCE_KM,
      include_labels: false,
    }),
  })

  const hotspots = useMemo<Hotspot[]>(() => {
    const rows = hotspotsResponse?.hotspots || []
    return rows.map((item) => ({
      id: item.id,
      lat: item.lat,
      lng: item.lng,
      activityCount: item.activity_count,
      distanceKm: item.distance_km,
      label: item.label,
    }))
  }, [hotspotsResponse])

  const activityWithBounds = useMemo<ActivityWithBounds[]>(() => {
    return filteredActivities
      .filter((activity) => Array.isArray(activity.latlng) && activity.latlng.length > 0)
      .map((activity) => {
        let minLat = activity.latlng[0][0]
        let maxLat = activity.latlng[0][0]
        let minLng = activity.latlng[0][1]
        let maxLng = activity.latlng[0][1]
        activity.latlng.forEach(([lat, lng]) => {
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
        })
        return { ...activity, minLat, maxLat, minLng, maxLng }
      })
  }, [filteredActivities])

  const renderedActivities = useMemo(() => {
    const viewportBounds = mapViewport.bounds
    const zoom = mapViewport.zoom
    const targetPoints = zoom >= 15 ? 600 : zoom >= 13 ? 340 : zoom >= 11 ? 220 : zoom >= 9 ? 130 : 70
    const boundsPadding = 0.01

    return activityWithBounds
      .filter((activity) => {
        if (!viewportBounds) return true
        const minLat = viewportBounds.south - boundsPadding
        const maxLat = viewportBounds.north + boundsPadding
        const minLng = viewportBounds.west - boundsPadding
        const maxLng = viewportBounds.east + boundsPadding
        return (
          activity.maxLat >= minLat
          && activity.minLat <= maxLat
          && activity.maxLng >= minLng
          && activity.minLng <= maxLng
        )
      })
      .map((activity) => {
        const points = activity.latlng
        if (points.length <= targetPoints) return activity
        const step = Math.ceil(points.length / targetPoints)
        return {
          ...activity,
          latlng: points.filter((_, index) => index % step === 0),
        }
      })
  }, [activityWithBounds, mapViewport])

  const viewportKey = useMemo(() => {
    const typeKey = [...selectedTypes].sort().join(',')
    const yearKey = [...selectedYears].sort((a, b) => a - b).join(',')
    return `${typeKey}|${yearKey}|${filteredActivities.length}|${hotspots[0]?.id || 'none'}`
  }, [selectedTypes, selectedYears, filteredActivities.length, hotspots])

  useEffect(() => {
    if (!selectedActivity) return
    if (!filteredActivities.some(a => a.strava_activity_id === selectedActivity)) {
      setSelectedActivity(null)
    }
  }, [selectedActivity, filteredActivities])

  const toggleType = (type: string) => {
    setSelectedTypes((prev) => (
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    ))
  }

  const toggleYear = (value: number) => {
    setSelectedYears((prev) => (
      prev.includes(value) ? prev.filter(y => y !== value) : [...prev, value]
    ))
  }

  const handleViewportChange = useCallback((next: MapViewportState) => {
    setMapViewport((prev) => {
      const prevBounds = prev.bounds
      const nextBounds = next.bounds
      const sameBounds = !!prevBounds && !!nextBounds
        && Math.abs(prevBounds.south - nextBounds.south) < 0.0001
        && Math.abs(prevBounds.west - nextBounds.west) < 0.0001
        && Math.abs(prevBounds.north - nextBounds.north) < 0.0001
        && Math.abs(prevBounds.east - nextBounds.east) < 0.0001
      if (prev.zoom === next.zoom && sameBounds) return prev
      return next
    })
  }, [])

  return (
    <div className="fixed inset-0 z-40">
      {/* Fullscreen Map */}
      <div className="absolute inset-0">
        {isLoading ? (
          <div className="h-full flex items-center justify-center bg-secondary/20">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-muted-foreground">{t('heatmap.loading')}</p>
            </div>
          </div>
        ) : (
          <MapContainer
            center={[51.1657, 10.4515]}
            zoom={6}
            preferCanvas={true}
            className="h-full w-full"
            zoomControl={false}
          >
            <TileLayer url={tileUrl} attribution={attribution} />
            <MapViewportManager
              allCoordinates={allCoordinates}
              hotspots={hotspots}
              selectedActivityCoords={selectedActivityData?.latlng || null}
              focusTarget={focusTarget}
              viewportKey={viewportKey}
            />
            <MapViewStateTracker onChange={handleViewportChange} />

            {/* All routes */}
            {renderedActivities.map((activity) => (
              activity.latlng && activity.latlng.length > 0 && (
                (() => {
                  const isSelected = selectedActivity === activity.strava_activity_id
                  const score = activityHeatData.scoreByActivity.get(activity.strava_activity_id) || 1
                  const intensity = normalizeHeatIntensity(score, activityHeatData.maxScore)
                  const baseWeight = 1.2 + intensity * 2.0
                  const baseOpacity = 0.22 + intensity * 0.55
                  const lineColor = isSelected ? '#f8fafc' : getHeatColor(intensity)
                  return (
                <Polyline
                  key={activity.strava_activity_id}
                  positions={activity.latlng}
                  smoothFactor={mapViewport.zoom <= 10 ? 1 : mapViewport.zoom <= 12 ? 0.6 : 0.2}
                  pathOptions={{
                    color: lineColor,
                    weight: isSelected ? 3.5 : baseWeight,
                    opacity: isSelected ? 1 : baseOpacity,
                    lineJoin: 'round',
                  }}
                  eventHandlers={{
                    click: () => setSelectedActivity(activity.strava_activity_id),
                    mouseover: (e) => {
                      const layer = e.target
                      layer.setStyle({ weight: Math.max(3.6, baseWeight + 1), opacity: 1 })
                      layer.bindTooltip(`${activity.name}<br/>${Number(activity.distance_km).toFixed(1)} ${t('records.units.km')}`, {
                        sticky: true,
                      }).openTooltip()
                    },
                    mouseout: (e) => {
                      const layer = e.target
                      layer.setStyle({
                        color: isSelected ? '#f8fafc' : lineColor,
                        weight: isSelected ? 3.5 : baseWeight,
                        opacity: isSelected ? 1 : baseOpacity,
                      })
                      layer.closeTooltip()
                    },
                  }}
                />
                  )
                })()
              )
            ))}
          </MapContainer>
        )}
      </div>

      {/* Toggle Sidebar Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-4 left-4 z-[1001] p-2 rounded-lg bg-background/95 backdrop-blur border shadow-lg hover:bg-secondary transition-colors"
      >
        {sidebarOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        )}
      </button>

      {/* Floating Filters */}
      <div className="absolute top-4 right-4 z-[1001] w-[calc(100vw-2rem)] max-w-sm sm:max-w-md">
        <div className="rounded-xl bg-background/95 backdrop-blur border shadow-lg p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t('heatmap.filters.title')}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t('heatmap.filters.type')}</div>
            <div className="flex flex-wrap gap-2">
              <FilterBadge
                label={t('heatmap.filters.allTypes')}
                active={selectedTypes.length === 0}
                onClick={() => setSelectedTypes([])}
              />
              {activityTypes.map(type => (
                <FilterBadge
                  key={type}
                  label={t(`activities.filters.types.${type}`, { defaultValue: type })}
                  active={selectedTypes.includes(type)}
                  color={typeColors.get(type)}
                  onClick={() => toggleType(type)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t('heatmap.filters.year')}</div>
            <div className="flex flex-wrap gap-2">
              <FilterBadge
                label={t('heatmap.filters.allYears')}
                active={selectedYears.length === 0}
                onClick={() => setSelectedYears([])}
              />
              {years.map((y) => (
                <FilterBadge
                  key={y}
                  label={String(y)}
                  active={selectedYears.includes(y)}
                  color={yearColors.get(y)}
                  onClick={() => toggleYear(y)}
                />
              ))}
            </div>
          </div>
          {(selectedTypes.length > 0 || selectedYears.length > 0) && (
            <button
              onClick={() => { setSelectedTypes([]); setSelectedYears([]); }}
              className="w-full px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm transition-colors"
            >
              {t('heatmap.filters.clear')}
            </button>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className={`absolute top-0 left-0 h-full w-80 bg-background/95 backdrop-blur border-r shadow-xl transition-transform duration-300 z-[1000] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <Link
            to="/"
            aria-label={t('navigation.home')}
            className="absolute top-3 left-3 z-[1002] p-2 rounded-lg bg-background/80 backdrop-blur border hover:bg-secondary transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </Link>

          {/* Header */}
          <div className="p-4 pl-14 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/>
                  </svg>
                </div>
                <h1 className="font-bold text-lg">{t('heatmap.title')}</h1>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="p-4 border-b">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground">{t('records.units.activities')}</p>
                <p className="text-xl font-bold text-primary">{filteredActivities.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground">{t('records.units.distance')}</p>
                <p className="text-xl font-bold">{totalDistance.toFixed(0)} {t('records.units.km')}</p>
              </div>
            </div>
          </div>

          {/* Hotspots + Selected Activity */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <div className="space-y-2">
              <h3 className="font-medium text-sm">{t('heatmap.hotspots.title', { defaultValue: 'Hotspot-Bereiche' })}</h3>
              <p className="text-[11px] text-muted-foreground">
                {t('heatmap.hotspots.note', { defaultValue: 'Zuerst geografisch getrennte Regionen, danach nahe Bereiche. Virtuelle Aktivitäten sind ausgeblendet.' })}
              </p>
              {hotspots.length > 0 ? (
                <div className="space-y-2">
                  {hotspots.map((spot, index) => (
                    <button
                      key={spot.id}
                      type="button"
                      onClick={() => {
                        setSelectedActivity(null)
                        setFocusTarget({ lat: spot.lat, lng: spot.lng, requestId: Date.now() })
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg border border-border bg-secondary/40 hover:bg-secondary/70 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground truncate pr-2">
                          #{index + 1} {spot.label || t('heatmap.hotspots.area', { defaultValue: 'Bereich' })}
                        </span>
                        <span className="text-primary font-semibold">{spot.activityCount} {t('records.units.activities').toLowerCase()}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {spot.lat.toFixed(3)}, {spot.lng.toFixed(3)} · {spot.distanceKm.toFixed(0)} {t('records.units.km')}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {t('heatmap.hotspots.none', { defaultValue: 'Keine Hotspots für die aktuelle Filterung.' })}
                </div>
              )}
            </div>

            {selectedActivityData ? (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">{t('heatmap.selected.title')}</h3>
                <div className="p-3 rounded-lg bg-secondary/50 space-y-2">
                  <p className="font-medium text-sm truncate">{selectedActivityData.name}</p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>{t(`activities.filters.types.${selectedActivityData.type}`, { defaultValue: selectedActivityData.type })}</p>
                    <p>{Number(selectedActivityData.distance_km).toFixed(2)} {t('records.units.km')}</p>
                    <p>{new Date(selectedActivityData.start_date).toLocaleDateString(i18n.language?.startsWith('de') ? 'de-DE' : 'en-US')}</p>
                  </div>
                  <Link
                    to={`/activity/${selectedActivityData.strava_activity_id}`}
                    className="block mt-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-center text-sm hover:bg-primary/90 transition-colors"
                  >
                    {t('heatmap.selected.viewDetails')}
                  </Link>
                </div>
                <button
                  onClick={() => setSelectedActivity(null)}
                  className="w-full px-3 py-2 rounded-lg border text-sm hover:bg-secondary transition-colors"
                >
                  {t('heatmap.selected.deselect')}
                </button>
              </div>
            ) : (
              <div className="text-center text-muted-foreground text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 opacity-50">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="m15 9-6 6"/>
                  <path d="m9 9 6 6"/>
                </svg>
                <p>{t('heatmap.selected.empty')}</p>
              </div>
            )}
          </div>

          {/* Cache Status & Refresh */}
          <div className="p-4 border-t space-y-2">
            {data?.cached !== undefined && (
              <div className="text-xs text-muted-foreground">
                {data.cached ? (
                  <span className="text-green-500">{t('heatmap.cache.cached', { hours: data.cache_age_hours })}</span>
                ) : (
                  <span className="text-yellow-500">{t('heatmap.cache.fresh', { ms: data.generation_time_ms })}</span>
                )}
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="w-full px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={isRefreshing ? 'animate-spin' : ''}
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {isRefreshing ? t('heatmap.cache.refreshing') : t('heatmap.cache.refresh')}
            </button>
          </div>

          {/* Footer */}
          <div className="p-4 border-t">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('heatmap.footer.years', { value: filteredYears.length > 0 ? `${filteredYears[filteredYears.length - 1]}-${filteredYears[0]}` : '-' })}</span>
              <span>{t('heatmap.footer.types', { count: filteredTypes.length })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Bar (when sidebar closed) */}
      {!sidebarOpen && (
        <div className="absolute top-4 left-16 z-[1001] flex items-center gap-2">
          <div className="px-3 py-2 rounded-lg bg-background/95 backdrop-blur border shadow-lg text-sm">
            <span className="font-bold text-primary">{filteredActivities.length}</span> {t('records.units.activities').toLowerCase()}
          </div>
          <div className="px-3 py-2 rounded-lg bg-background/95 backdrop-blur border shadow-lg text-sm">
            <span className="font-bold">{totalDistance.toFixed(0)}</span> {t('records.units.km')}
          </div>
          {selectedActivityData && (
            <Link
              to={`/activity/${selectedActivityData.strava_activity_id}`}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              {selectedActivityData.name.substring(0, 20)}...
            </Link>
          )}
        </div>
      )}

      {/* Back to Dashboard */}
      <Link
        to="/"
        className="absolute bottom-4 right-4 z-[1001] px-4 py-2 rounded-lg bg-background/95 backdrop-blur border shadow-lg hover:bg-secondary transition-colors flex items-center gap-2 text-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        {t('nav.dashboard')}
      </Link>
    </div>
  )
}

function FilterBadge({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active: boolean
  color?: string
  onClick: () => void
}) {
  const baseClass = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors'
  if (!color) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`${baseClass} ${active ? 'bg-secondary text-foreground border-border' : 'text-muted-foreground border-border hover:bg-secondary/50'}`}
      >
        {label}
      </button>
    )
  }

  const textColor = active ? getReadableTextColor(color) : color
  const style = active
    ? { backgroundColor: color, borderColor: color, color: textColor }
    : { borderColor: color, color: textColor }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${baseClass} hover:opacity-90`}
      style={style}
    >
      {label}
    </button>
  )
}
