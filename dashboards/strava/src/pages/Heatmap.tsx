import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getHeatmapData, clearHeatmapCache, getHeatmapHotspotLabels } from '../lib/api'
import { useTheme } from '../components/ThemeProvider'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import { useTranslation } from 'react-i18next'

const HOTSPOT_MIN_DISTANCE_KM = 50
const HOTSPOT_FILL_MIN_DISTANCE_KM = 18
const HOTSPOT_MAX_COUNT = 10

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

const getReadableTextColor = (hexColor: string) => {
  const hex = hexColor.replace('#', '')
  if (hex.length !== 6) return '#0f172a'
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.6 ? '#0f172a' : '#f8fafc'
}

const isVirtualActivityType = (type: string) => String(type || '').toLowerCase().startsWith('virtual')

const haversineKm = (a: [number, number], b: [number, number]) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Component to fit all routes - only runs once
type BoundsTuple = [[number, number], [number, number]]

function HeatmapViewportController({
  initialBounds,
  focusBounds,
  focusKey,
}: {
  initialBounds: BoundsTuple | null
  focusBounds: BoundsTuple | null
  focusKey: number
}) {
  const map = useMap()
  const hasInitialFit = useRef(false)
  const lastFocusKey = useRef(0)

  useEffect(() => {
    if (hasInitialFit.current) return
    if (!initialBounds) return
    map.fitBounds(initialBounds, { padding: [30, 30], maxZoom: 13 })
    hasInitialFit.current = true
  }, [map, initialBounds])

  useEffect(() => {
    if (!focusBounds) return
    if (!focusKey || focusKey === lastFocusKey.current) return
    map.fitBounds(focusBounds, { padding: [40, 40], maxZoom: 14 })
    lastFocusKey.current = focusKey
  }, [map, focusBounds, focusKey])

  return null
}

type HeatmapHotspot = {
  id: string
  count: number
  distanceKm: number
  latestDate: string
  centroid: [number, number]
  bounds: BoundsTuple
}

export function Heatmap() {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const queryClient = useQueryClient()
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedYears, setSelectedYears] = useState<number[]>([])
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [defaultTypeFilterApplied, setDefaultTypeFilterApplied] = useState(false)
  const [focusBounds, setFocusBounds] = useState<BoundsTuple | null>(null)
  const [focusKey, setFocusKey] = useState(0)
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null)
  const [hotspotLabels, setHotspotLabels] = useState<Record<string, string | null>>({})
  const initialHotspotSelectionApplied = useRef(false)
  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), [])

  const { data, isLoading } = useQuery({
    queryKey: ['heatmap'],
    queryFn: () => getHeatmapData(),
    staleTime: 1000 * 60 * 60, // Consider data fresh for 1 hour in React Query
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await clearHeatmapCache()
      await queryClient.invalidateQueries({ queryKey: ['heatmap'] })
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

  useEffect(() => {
    if (defaultTypeFilterApplied) return
    if (activityTypes.length === 0) return

    const nonVirtualTypes = activityTypes.filter((type) => !isVirtualActivityType(type))
    if (nonVirtualTypes.length > 0 && nonVirtualTypes.length < activityTypes.length) {
      setSelectedTypes(nonVirtualTypes)
    }
    setDefaultTypeFilterApplied(true)
  }, [activityTypes, defaultTypeFilterApplied])

  const getActivityColor = (activity: { type: string; start_date: string }) => {
    return typeColors.get(activity.type) || '#f97316'
  }

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

  const allBounds = useMemo<BoundsTuple | null>(() => {
    if (allCoordinates.length === 0) return null
    const allPoints = allCoordinates.flat()
    if (allPoints.length === 0) return null
    const bounds = L.latLngBounds(allPoints)
    return [
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()],
    ]
  }, [allCoordinates])

  const hotspots = useMemo<HeatmapHotspot[]>(() => {
    const gridSize = 0.12 // ~13 km; good balance for "usual areas" grouping
    const buckets = new Map<string, {
      count: number
      distanceKm: number
      latestDate: string
      minLat: number
      minLng: number
      maxLat: number
      maxLng: number
      centroidLatSum: number
      centroidLngSum: number
    }>()

    for (const activity of filteredActivities) {
      const coords = activity.latlng
      if (!coords || coords.length === 0) continue

      let minLat = Infinity
      let minLng = Infinity
      let maxLat = -Infinity
      let maxLng = -Infinity
      for (const [lat, lng] of coords) {
        if (lat < minLat) minLat = lat
        if (lng < minLng) minLng = lng
        if (lat > maxLat) maxLat = lat
        if (lng > maxLng) maxLng = lng
      }
      if (!Number.isFinite(minLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLat) || !Number.isFinite(maxLng)) continue

      const centerLat = (minLat + maxLat) / 2
      const centerLng = (minLng + maxLng) / 2
      const bucketLat = Math.round(centerLat / gridSize) * gridSize
      const bucketLng = Math.round(centerLng / gridSize) * gridSize
      const key = `${bucketLat.toFixed(2)}:${bucketLng.toFixed(2)}`

      const existing = buckets.get(key)
      if (!existing) {
        buckets.set(key, {
          count: 1,
          distanceKm: Number(activity.distance_km) || 0,
          latestDate: activity.start_date,
          minLat,
          minLng,
          maxLat,
          maxLng,
          centroidLatSum: centerLat,
          centroidLngSum: centerLng,
        })
        continue
      }

      existing.count += 1
      existing.distanceKm += Number(activity.distance_km) || 0
      if (new Date(activity.start_date).getTime() > new Date(existing.latestDate).getTime()) {
        existing.latestDate = activity.start_date
      }
      existing.minLat = Math.min(existing.minLat, minLat)
      existing.minLng = Math.min(existing.minLng, minLng)
      existing.maxLat = Math.max(existing.maxLat, maxLat)
      existing.maxLng = Math.max(existing.maxLng, maxLng)
      existing.centroidLatSum += centerLat
      existing.centroidLngSum += centerLng
    }

    const candidates = Array.from(buckets.entries())
      .map(([id, bucket]) => ({
        id,
        count: bucket.count,
        distanceKm: bucket.distanceKm,
        latestDate: bucket.latestDate,
        centroid: [bucket.centroidLatSum / bucket.count, bucket.centroidLngSum / bucket.count] as [number, number],
        bounds: [
          [bucket.minLat, bucket.minLng],
          [bucket.maxLat, bucket.maxLng],
        ] as BoundsTuple,
      }))
      .sort((a, b) => (b.count - a.count) || (b.distanceKm - a.distanceKm))

    const deduped: HeatmapHotspot[] = []
    for (const candidate of candidates) {
      const tooClose = deduped.some((existing) =>
        haversineKm(existing.centroid, candidate.centroid) < HOTSPOT_MIN_DISTANCE_KM
      )
      if (tooClose) continue
      deduped.push(candidate)
      if (deduped.length >= HOTSPOT_MAX_COUNT) break
    }

    // Fill remaining slots with geographically diverse candidates using a relaxed distance.
    // This keeps dense home-area splitting under control (strict pass) while still surfacing
    // additional "single-activity" regions if there is room in the hotspot list.
    if (deduped.length < HOTSPOT_MAX_COUNT) {
      const usedIds = new Set(deduped.map((item) => item.id))
      const remaining = candidates.filter((item) => !usedIds.has(item.id))

      for (const candidate of remaining) {
        const tooClose = deduped.some((existing) =>
          haversineKm(existing.centroid, candidate.centroid) < HOTSPOT_FILL_MIN_DISTANCE_KM
        )
        if (tooClose) continue
        deduped.push(candidate)
        if (deduped.length >= HOTSPOT_MAX_COUNT) break
      }
    }

    return deduped
  }, [filteredActivities])

  const initialViewportBounds = useMemo<BoundsTuple | null>(() => {
    return hotspots[0]?.bounds || allBounds
  }, [hotspots, allBounds])

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

  useEffect(() => {
    if (!selectedActivity) return
    if (!filteredActivities.some(a => a.strava_activity_id === selectedActivity)) {
      setSelectedActivity(null)
    }
  }, [selectedActivity, filteredActivities])

  useEffect(() => {
    if (!activeHotspotId) return
    if (!hotspots.some((h) => h.id === activeHotspotId)) {
      setActiveHotspotId(null)
    }
  }, [activeHotspotId, hotspots])

  useEffect(() => {
    if (initialHotspotSelectionApplied.current) return
    if (hotspots.length === 0) return
    setActiveHotspotId(hotspots[0].id)
    initialHotspotSelectionApplied.current = true
  }, [hotspots])

  const focusMapBounds = (bounds: BoundsTuple | null) => {
    if (!bounds) return
    setFocusBounds(bounds)
    setFocusKey((prev) => prev + 1)
  }

  useEffect(() => {
    if (hotspots.length === 0) return

    const missing = hotspots
      .filter((h) => hotspotLabels[h.id] === undefined)
      .map((h) => ({ id: h.id, lat: h.centroid[0], lng: h.centroid[1] }))

    if (missing.length === 0) return

    let cancelled = false
    getHeatmapHotspotLabels(missing)
      .then((response) => {
        if (cancelled) return
        setHotspotLabels((prev) => {
          const next = { ...prev }
          for (const item of response.labels || []) {
            next[item.id] = item.label
          }
          return next
        })
      })
      .catch(() => {
        if (cancelled) return
        setHotspotLabels((prev) => {
          const next = { ...prev }
          for (const item of missing) {
            if (next[item.id] === undefined) next[item.id] = null
          }
          return next
        })
      })

    return () => {
      cancelled = true
    }
  }, [hotspots, hotspotLabels])

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
            className="h-full w-full"
            zoomControl={false}
            preferCanvas
          >
            <TileLayer url={tileUrl} attribution={attribution} />
            <HeatmapViewportController
              initialBounds={initialViewportBounds}
              focusBounds={focusBounds}
              focusKey={focusKey}
            />

            {/* All routes */}
            {filteredActivities.map((activity) => (
              activity.latlng && activity.latlng.length > 0 && (
                (() => {
                  const lineColor = getActivityColor(activity)
                  const isSelected = selectedActivity === activity.strava_activity_id
                  return (
                <Polyline
                  key={activity.strava_activity_id}
                  positions={activity.latlng}
                  smoothFactor={0.2}
                  pathOptions={{
                    color: lineColor,
                    weight: isSelected ? 3 : 1.5,
                    opacity: isSelected ? 1 : 0.6,
                    lineJoin: 'round',
                  }}
                  renderer={canvasRenderer}
                  eventHandlers={{
                    click: () => setSelectedActivity(activity.strava_activity_id),
                    mouseover: (e) => {
                      const layer = e.target
                      layer.setStyle({ weight: 4, opacity: 1 })
                      layer.bindTooltip(`${activity.name}<br/>${Number(activity.distance_km).toFixed(1)} ${t('records.units.km')}`, {
                        sticky: true,
                      }).openTooltip()
                    },
                    mouseout: (e) => {
                      const layer = e.target
                      if (!isSelected) {
                        layer.setStyle({ weight: 1.5, opacity: 0.6 })
                      }
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
          {defaultTypeFilterApplied && selectedTypes.length > 0 && activityTypes.some(isVirtualActivityType) && (
            <div className="text-[11px] text-muted-foreground rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
              {t('heatmap.filters.virtualHiddenByDefault')}
            </div>
          )}
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
          {/* Header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/>
                  </svg>
                </div>
                <h1 className="font-bold text-lg">{t('heatmap.title')}</h1>
              </div>
              <Link to="/" className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </Link>
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
            {hotspots.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('heatmap.hotspots.title')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHotspotId(null)
                      focusMapBounds(allBounds)
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('heatmap.hotspots.showAll')}
                  </button>
                </div>
                <div className="space-y-2">
                  {hotspots.map((hotspot, index) => {
                    const isActive = activeHotspotId === hotspot.id
                    return (
                      <button
                        key={hotspot.id}
                        type="button"
                        onClick={() => {
                          setActiveHotspotId(hotspot.id)
                          focusMapBounds(hotspot.bounds)
                        }}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
                          isActive
                            ? 'border-emerald-400/70 bg-emerald-500/20'
                            : 'border-border/60 bg-secondary/30 hover:bg-emerald-500/12 hover:border-emerald-400/45'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-medium truncate pr-2 ${isActive ? 'text-emerald-200' : ''}`}>
                            {hotspotLabels[hotspot.id] || t('heatmap.hotspots.item', { index: index + 1 })}
                          </span>
                          <span className={`text-xs ${isActive ? 'text-emerald-200/90' : 'text-muted-foreground'}`}>
                            {t('heatmap.hotspots.activities', { count: hotspot.count })}
                          </span>
                        </div>
                        <div className={`mt-1 text-xs flex flex-wrap gap-x-3 gap-y-1 ${isActive ? 'text-emerald-100/80' : 'text-muted-foreground'}`}>
                          <span>{hotspot.distanceKm.toFixed(0)} {t('records.units.km')}</span>
                          <span>{new Date(hotspot.latestDate).toLocaleDateString(i18n.language?.startsWith('de') ? 'de-DE' : 'en-US')}</span>
                          <span className="font-mono">{hotspot.centroid[0].toFixed(2)}, {hotspot.centroid[1].toFixed(2)}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Selected Activity */}
          <div className="flex-1 overflow-auto p-4">
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
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>
                  {data.cached ? (
                    <span className="text-green-500">{t('heatmap.cache.cached', { hours: data.cache_age_hours })}</span>
                  ) : (
                    <span className="text-yellow-500">{t('heatmap.cache.fresh', { ms: data.generation_time_ms })}</span>
                  )}
                </div>
                {data.sampling_max_points && (
                  <div>{t('heatmap.cache.sampling', { value: data.sampling_max_points })}</div>
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
