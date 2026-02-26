import axios from 'axios'
import type { AxiosProgressEvent } from 'axios'
import i18n from '../i18n'
import type {
  Activity,
  ActivityWithStreams,
  Stats,
  MonthlyStats,
  Gear,
  GearMaintenanceItem,
  PersonalRecords,
  StreakData,
  YearlyStats,
  MonthlyBest,
  ActivityPowerMetrics,
  BulkPowerMetrics,
  TrainingLoad
} from '../types/activity'
import type { UserProfile } from '../types/user'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
})

api.interceptors.request.use((config) => {
  const language = i18n.language?.startsWith('de') ? 'de' : 'en'
  config.headers = config.headers || {}
  config.headers['X-Language'] = language
  return config
})

export const getHealth = async () => {
  const { data } = await api.get('/health')
  return data
}

export interface AdapterCapabilities {
  supportsFiles: boolean
  supportsOAuth: boolean
  supportsWebhooks: boolean
  supportsSegments: boolean
  supportsSync: boolean
  supportsPhotos: boolean
}

export interface ActivitySourceAdapter {
  id: string
  name: string
  enabled: boolean
  capabilities: AdapterCapabilities
}

export interface CapabilitiesResponse {
  adapters: ActivitySourceAdapter[]
  active_adapters: string[]
  capabilities: AdapterCapabilities
  version?: {
    backend?: string | null
    label?: string | null
    commit?: string | null
  }
}

export const getCapabilities = async (): Promise<CapabilitiesResponse> => {
  const { data } = await api.get<CapabilitiesResponse>('/capabilities')
  return data
}

export const getStats = async (): Promise<Stats> => {
  const { data } = await api.get<Stats>('/stats')
  return data
}

export interface ActivityPhoto {
  unique_id: string
  url_small?: string
  url_medium?: string
  url_large?: string
}

export interface ActivityWithRoute extends Activity {
  route_data?: [number, number][] | null
  photos?: ActivityPhoto[] | null
}

export const getActivities = async (params?: {
  type?: string
  limit?: number
  offset?: number
  include_route?: boolean
}): Promise<ActivityWithRoute[]> => {
  const { data } = await api.get<{ activities: ActivityWithRoute[], total: number }>('/activities', { params })
  return data.activities
}

export const getActivity = async (id: number): Promise<ActivityWithStreams> => {
  const { data } = await api.get<ActivityWithStreams>(`/activities/${id}`)
  return data
}

export interface DeleteActivityResponse {
  success: boolean
  deleted_activity_id: number
  deleted_activity_name?: string
  source?: string | null
  photos_directory_removed?: boolean
  warning?: string | null
}

export const deleteActivity = async (id: number): Promise<DeleteActivityResponse> => {
  const { data } = await api.delete<DeleteActivityResponse>(`/activities/${id}`)
  return data
}

export interface UpdateActivityGearResponse {
  activity_id: number
  gear_id: string | null
}

export const updateActivityGear = async (
  activityId: number,
  gearId: string | null
): Promise<UpdateActivityGearResponse> => {
  const { data } = await api.patch<UpdateActivityGearResponse>(`/activities/${activityId}/gear`, {
    gear_id: gearId,
  })
  return data
}

export interface ActivitySegmentEffort {
  effort_id: number
  segment_id: number
  activity_id: number
  effort_name?: string | null
  start_date?: string | null
  start_date_local?: string | null
  elapsed_time?: number | null
  moving_time?: number | null
  effort_distance?: number | null
  average_watts?: number | null
  average_heartrate?: number | null
  pr_rank?: number | null
  kom_rank?: number | null
  rank?: number | null
  start_index?: number | null
  end_index?: number | null
  device_watts?: boolean | null
  hidden?: boolean | null
  segment_name?: string | null
  activity_type?: string | null
  segment_distance?: number | null
  average_grade?: number | null
  maximum_grade?: number | null
  elevation_high?: number | null
  elevation_low?: number | null
  start_latlng?: [number, number] | null
  end_latlng?: [number, number] | null
  climb_category?: number | null
  segment_source?: 'strava' | 'local' | string | null
  segment_is_auto_climb?: boolean | null
  city?: string | null
  state?: string | null
  country?: string | null
  best_elapsed?: number | null
  is_pr?: boolean
}

export interface ActivitySegmentsResponse {
  activity_id: number
  count: number
  segments: ActivitySegmentEffort[]
}

export const getActivitySegments = async (id: number): Promise<ActivitySegmentsResponse> => {
  const { data } = await api.get<ActivitySegmentsResponse>(`/activities/${id}/segments`)
  return data
}

export interface SegmentEffort extends ActivitySegmentEffort {
  activity_name?: string | null
  activity_date?: string | null
}

export interface SegmentEffortsResponse {
  segment_id: number
  count: number
  efforts: SegmentEffort[]
}

export interface RenameSegmentResponse {
  segment_id: number
  name: string
  source: string
  is_auto_climb: boolean
  renamed: boolean
}

export const getSegmentEfforts = async (id: number, limit: number = 200): Promise<SegmentEffortsResponse> => {
  const { data } = await api.get<SegmentEffortsResponse>(`/segments/${id}/efforts`, {
    params: { limit },
  })
  return data
}

export const renameSegment = async (id: number, name: string): Promise<RenameSegmentResponse> => {
  const { data } = await api.patch<RenameSegmentResponse>(`/segments/${id}`, { name })
  return data
}

export interface SegmentEffortStreamsResponse {
  effort_id: number
  segment_id: number
  activity_id: number
  start_index: number | null
  end_index: number | null
  elapsed_time: number | null
  moving_time: number | null
  distance: number | null
  average_watts: number | null
  average_heartrate: number | null
  streams: {
    time?: number[]
    distance?: number[]
    watts?: number[]
    heartrate?: number[]
    altitude?: number[]
    velocity_smooth?: number[]
  }
}

export const getSegmentEffortStreams = async (effortId: number): Promise<SegmentEffortStreamsResponse> => {
  const { data } = await api.get<SegmentEffortStreamsResponse>(`/segment-efforts/${effortId}/streams`)
  return data
}

export interface SegmentSummaryBucket {
  bucket: string
  segments: number
  avg_grade: number | null
  avg_distance: number | null
}

export interface SegmentMapItem {
  segment_id: number
  name: string
  start_latlng: [number, number] | null
  end_latlng: [number, number] | null
  attempts: number
  best_elapsed: number | null
}

export interface SegmentsSummaryResponse {
  summary: {
    total_segments: number
    total_efforts: number
    total_prs: number
    avg_grade: number | null
    avg_distance: number | null
    segments_3plus: number
  }
  strength_profile: SegmentSummaryBucket[]
  map_segments: SegmentMapItem[]
}

export const getSegmentsSummary = async (params?: {
  source?: 'all' | 'strava' | 'local'
  types?: string
}): Promise<SegmentsSummaryResponse> => {
  const { data } = await api.get<SegmentsSummaryResponse>('/segments/summary', { params })
  return data
}

export interface SegmentListItem {
  segment_id: number
  name: string
  source?: 'strava' | 'local' | string | null
  distance: number | null
  average_grade: number | null
  climb_category?: number | null
  city?: string | null
  state?: string | null
  country?: string | null
  start_latlng?: [number, number] | null
  end_latlng?: [number, number] | null
  is_auto_climb?: boolean
  attempts: number
  best_elapsed: number | null
  worst_elapsed: number | null
  first_date: string | null
  last_date: string | null
  first_elapsed: number | null
  last_elapsed: number | null
  best_avg_watts: number | null
  best_avg_heartrate: number | null
  pr_count: number
  pr_rate: number
  improvement: number | null
}

export interface SegmentsListResponse {
  total: number
  count: number
  segments: SegmentListItem[]
}

export const getSegmentsList = async (params: {
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
  search?: string
  source?: 'all' | 'strava' | 'local'
  types?: string
}): Promise<SegmentsListResponse> => {
  const { data } = await api.get<SegmentsListResponse>('/segments', { params })
  return data
}

export interface LocalSegmentRebuildResponse {
  activityId: number
  processed: boolean
  detected: number
  persisted: number
  message: string
}
export type LocalClimbRebuildResponse = LocalSegmentRebuildResponse

export interface LocalSegmentBackfillResponse {
  matchedActivities?: number
  processedActivities: number
  activitiesWithClimbs: number
  detectedClimbs: number
  persistedClimbs: number
  mode?: 'single' | 'full'
  batches?: number
  batchSize?: number
  warning?: string
  filters?: {
    includeStrava: boolean
    includeImported: boolean
    includeRide: boolean
    includeRun: boolean
  }
  errors: Array<{
    activityId: number
    message: string
  }>
}
export type LocalClimbBackfillResponse = LocalSegmentBackfillResponse

export interface LocalSegmentRenameResponse {
  matchedSegments: number
  processedSegments: number
  renamedSegments: number
  skippedSegments: number
  mode?: 'single' | 'full'
  batches?: number
  batchSize?: number
  includeManual?: boolean
  warning?: string
  errors: Array<{
    segmentId: number
    message: string
  }>
}
export type LocalClimbRenameResponse = LocalSegmentRenameResponse

export interface RepairLegacySportTypesResponse {
  scanned: number
  updated: number
  items: Array<{
    id: number
    strava_activity_id: number
    name: string
    type: string
    sport_type: string
  }>
  truncated?: boolean
  message: string
}

export const rebuildActivityLocalSegments = async (
  activityId: number,
  params?: {
    minDistanceM?: number
    minElevationGainM?: number
    minAvgGradePct?: number
    maxFlatDistanceM?: number
    maxDescentM?: number
    maxDistanceM?: number
    maxElapsedTimeSec?: number
  }
): Promise<LocalSegmentRebuildResponse> => {
  const { data } = await api.post<LocalSegmentRebuildResponse>(
    `/activities/${activityId}/local-segments/rebuild`,
    params || {}
  )
  return data
}
export const rebuildActivityLocalClimbs = rebuildActivityLocalSegments

export const triggerLocalSegmentsBackfill = async (params?: {
  limit?: number
  full?: boolean
  batchSize?: number
  minDistanceM?: number
  minElevationGainM?: number
  minAvgGradePct?: number
  maxFlatDistanceM?: number
  maxDescentM?: number
  maxDistanceM?: number
  maxElapsedTimeSec?: number
}): Promise<LocalSegmentBackfillResponse> => {
  const { data } = await api.post<LocalSegmentBackfillResponse>(
    '/segments/local-segments/backfill',
    params || {}
  )
  return data
}
export const triggerLocalClimbBackfill = triggerLocalSegmentsBackfill

export const renameLocalSegmentsBulk = async (params?: {
  limit?: number
  full?: boolean
  batchSize?: number
  includeManual?: boolean
  renameManualNames?: boolean
  reverseGeocodeEnabled?: boolean
  reverseGeocodeUrl?: string
  reverseGeocodeTimeoutMs?: number
  reverseGeocodeLanguage?: string
  reverseGeocodeUserAgent?: string
  preferVirtualActivityName?: boolean
}): Promise<LocalSegmentRenameResponse> => {
  const { data } = await api.post<LocalSegmentRenameResponse>(
    '/segments/local-segments/rename',
    params || {}
  )
  return data
}
export const renameLocalClimbSegments = renameLocalSegmentsBulk

export const repairLegacySportTypes = async (): Promise<RepairLegacySportTypesResponse> => {
  const { data } = await api.post<RepairLegacySportTypesResponse>(
    '/segments/local-segments/repair-legacy-sport-types',
    {}
  )
  return data
}

export interface CreateManualLocalSegmentResponse {
  activityId: number
  segmentId: number
  created: boolean
  name: string
  matchedActivities: number
  persistedEfforts: number
}

export const createManualLocalSegment = async (
  activityId: number,
  payload: {
    startIndex: number
    endIndex: number
    name?: string
    matchingRadiusM?: number
  }
): Promise<CreateManualLocalSegmentResponse> => {
  const { data } = await api.post<CreateManualLocalSegmentResponse>(
    `/activities/${activityId}/local-segments/manual`,
    payload
  )
  return data
}

export const getActivityMap = async (id: number) => {
  const { data } = await api.get(`/activities/${id}/map`)
  return data
}

export const getMonthlyStats = async (): Promise<MonthlyStats[]> => {
  const { data } = await api.get<MonthlyStats[]>('/stats/monthly')
  return data
}

export const getStatsByType = async () => {
  const { data } = await api.get('/stats/by-type')
  return data
}

export const getGear = async (): Promise<Gear[]> => {
  const { data } = await api.get<Gear[]>('/gear')
  return data
}

export const createManualGear = async (payload: {
  name: string
  type: 'bike' | 'shoes'
  brandName?: string
  modelName?: string
  description?: string
  distanceKm?: number
  retired?: boolean
}): Promise<Gear> => {
  const { data } = await api.post<Gear>('/gear', {
    name: payload.name,
    type: payload.type,
    brandName: payload.brandName,
    modelName: payload.modelName,
    description: payload.description,
    distanceKm: payload.distanceKm ?? 0,
    retired: payload.retired ?? false,
  })
  return data
}

export const getGearById = async (id: string): Promise<Gear> => {
  const { data } = await api.get<Gear>(`/gear/${id}`)
  return data
}

export const getGearMaintenance = async (): Promise<GearMaintenanceItem[]> => {
  const { data } = await api.get<GearMaintenanceItem[]>('/gear/maintenance')
  return data
}

export const updateGearMaintenance = async (
  gearId: string,
  items: GearMaintenanceItem[]
): Promise<{ gear_id: string; items: GearMaintenanceItem[] }> => {
  const { data } = await api.put(`/gear/${gearId}/maintenance`, { items, replaceAll: true })
  return data
}

// Heatmap API
export interface HeatmapActivity {
  strava_activity_id: number
  name: string
  type: string
  start_date: string
  distance_km: number
  latlng: [number, number][]
}

export interface HeatmapResponse {
  count: number
  activities: HeatmapActivity[]
  cached?: boolean
  cache_age_hours?: number
  generation_time_ms?: number
  sampling_max_points?: number
}

export const getHeatmapData = async (params?: {
  type?: string
  year?: number
  refresh?: boolean
}): Promise<HeatmapResponse> => {
  const { data } = await api.get('/activities/heatmap', { params })
  return data
}

export const clearHeatmapCache = async (): Promise<{ cleared: number; message: string }> => {
  const { data } = await api.delete('/cache/heatmap')
  return data
}

// Records API
export const getRecords = async (type?: string): Promise<PersonalRecords> => {
  const { data } = await api.get<PersonalRecords>('/records', {
    params: type ? { type } : undefined
  })
  return data
}

export const getStreaks = async (type?: string): Promise<StreakData> => {
  const { data } = await api.get<StreakData>('/records/streaks', {
    params: type ? { type } : undefined
  })
  return data
}

export const getYearlyStats = async (type?: string): Promise<YearlyStats[]> => {
  const { data } = await api.get<YearlyStats[]>('/records/yearly', {
    params: type ? { type } : undefined
  })
  return data
}

export const getMonthlyBest = async (metric?: string): Promise<MonthlyBest[]> => {
  const { data } = await api.get<MonthlyBest[]>('/records/monthly-best', {
    params: metric ? { metric } : undefined
  })
  return data
}

// Analytics API
export interface TrainingLoadWeek {
  week_start: string
  activity_count: string
  total_distance_km: string
  total_hours: string
  total_elevation_m: string
  avg_heartrate: string
  training_load: number
}

export interface PowerCurvePoint {
  duration_seconds: number
  duration_label: string
  power_watts: number
}

export interface RiderStrengths {
  sprint: number
  punch: number
  climbing: number
  endurance: number
  time_trial: number
}

export interface PowerCurveResponse {
  rider_type: string
  strengths: RiderStrengths
  power_curve: PowerCurvePoint[]
  key_powers: {
    '5_sec': number
    '1_min': number
    '5_min': number
    '20_min': number
    '60_min': number
  }
  activities_analyzed: number
  period_months: number
}

export interface FitnessTrendMonth {
  month: string
  activity_count: string
  avg_speed_kmh: string
  avg_pace_min_per_km: string
  avg_heartrate: string
  avg_power: string
  avg_elevation_m: string
}

export interface HRZone {
  id: string
  name: string
  min: number
  max: number
  minutes: number
  color: string
  percentage: number
}

export interface HeartRateZonesResponse {
  zones: HRZone[]
  total_minutes: number
  activities_analyzed: number
}

export interface EfficiencyMonth {
  month: string
  activity_count: string
  calories_per_km: string
  avg_vam: string
  avg_watts_per_kg: string
  hr_efficiency: string
}

export const getPowerCurve = async (params?: {
  months?: number
}): Promise<PowerCurveResponse> => {
  const { data } = await api.get<PowerCurveResponse>('/analytics/power-curve', { params })
  return data
}

export const getTrainingLoad = async (params?: {
  type?: string
  weeks?: number
}): Promise<TrainingLoadWeek[]> => {
  const { data} = await api.get<TrainingLoadWeek[]>('/analytics/training-load', { params })
  return data
}

export const getFitnessTrend = async (params?: {
  type?: string
  months?: number
}): Promise<FitnessTrendMonth[]> => {
  const { data } = await api.get<FitnessTrendMonth[]>('/analytics/fitness-trend', { params })
  return data
}

export const getHeartRateZones = async (params?: {
  type?: string
  months?: number
}): Promise<HeartRateZonesResponse> => {
  const { data } = await api.get<HeartRateZonesResponse>('/analytics/heart-rate-zones', { params })
  return data
}

export const getEfficiencyMetrics = async (params?: {
  type?: string
  months?: number
}): Promise<EfficiencyMonth[]> => {
  const { data } = await api.get<EfficiencyMonth[]>('/analytics/efficiency', { params })
  return data
}

// Weekday Distribution
export interface WeekdayDistribution {
  day_of_week: number
  day_name: string
  activity_count: string
  total_distance_km: string
  total_hours: string
  avg_distance_km: string
  avg_duration_min: string
}

export const getWeekdayDistribution = async (params?: {
  type?: string
  months?: number
}): Promise<WeekdayDistribution[]> => {
  const { data } = await api.get<WeekdayDistribution[]>('/analytics/weekday-distribution', { params })
  return data
}

// Monthly Comparison
export interface MonthlyComparison {
  month: string
  year: number
  month_num: number
  month_name: string
  activity_count: string
  total_distance_km: string
  total_hours: string
  total_elevation: string
  avg_speed_kmh: string
}

export const getMonthlyComparison = async (params?: {
  type?: string
  months?: number
}): Promise<MonthlyComparison[]> => {
  const { data } = await api.get<MonthlyComparison[]>('/analytics/monthly-comparison', { params })
  return data
}

// Time of Day Distribution
export interface TimeOfDayDistribution {
  time_slot: string
  slot_order: number
  activity_count: string
  total_distance_km: string
  avg_distance_km: string
}

export const getTimeOfDayDistribution = async (params?: {
  type?: string
  months?: number
}): Promise<TimeOfDayDistribution[]> => {
  const { data } = await api.get<TimeOfDayDistribution[]>('/analytics/time-of-day', { params })
  return data
}

// Tech Stats API
export interface TechStats {
  system: {
    node_version: string
    platform: string
    arch: string
    uptime_seconds: number
    uptime_formatted: string
    memory: {
      heap_used_mb: number
      heap_total_mb: number
      rss_mb: number
    }
    pid: number
  }
  database: {
    version: string
    size: string
    tables: Array<{
      table_name: string
      total_size: string
      data_size: string
      row_count: string
    }>
  }
  activities: {
    total: number
    with_photos: number
    with_gps: number
    without_gps: number
    first_activity: string | null
    last_activity: string | null
    last_sync: string | null
  }
  segments: {
    total_segments: number
    total_efforts: number
    activities_with_segments: number
  }
  streams: {
    total_records: number
    total_data_points: number
  }
  photos: {
    total: number
    downloaded: number
    pending: number
    activities_with_photos_synced: number
    local_files: number
  }
  data_gaps: {
    activities_needing_photo_sync: number
    activities_needing_streams: number
    activities_with_estimated_power: number
    photos_needing_download: number
    activities_needing_segments: number
  }
  activity_types: Array<{ type: string; count: string }>
  yearly_stats: Array<{
    year: number
    activities: string
    total_km: string
    with_streams?: string
    with_power_streams?: string
  }>
  tech_stack: {
    backend: string
    frontend: string
    database: string
    charts: string
    maps: string
    api_client: string
    container: string
  }
  sync_config?: {
    timezone: string
    startup: {
      enabled: boolean
      staleHours: number
    }
    activity: {
      enabled: boolean
      cron: string
      recentDays: number
      includeStreams: boolean
      includeSegments: boolean
    }
    backfill: {
      enabled: boolean
      cron: string
      streamsLimit: number
      segmentsLimit: number
      photosLimit: number
      downloadsLimit: number
    }
  }
  migrations?: {
    pending_count: number
    pending_files: string[]
  }
  build?: {
    version: string | null
    commit: string | null
    ref: string | null
    repo: string | null
  }
  timestamp: string
}

export const getTechStats = async (): Promise<TechStats> => {
  const { data } = await api.get<TechStats>('/tech')
  return data
}

// Sync Logs API
export interface SyncLog {
  id: number
  started_at: string
  completed_at: string | null
  status: 'running' | 'completed' | 'failed'
  items_processed: number
  error_message: string | null
  duration_seconds: number | null
}

export interface SyncLogsResponse {
  logs: SyncLog[]
  count: number
}

export const getSyncLogs = async (limit?: number): Promise<SyncLogsResponse> => {
  const { data } = await api.get<SyncLogsResponse>('/sync-logs', {
    params: limit ? { limit } : undefined
  })
  return data
}

// Import API
export interface ImportRun {
  id: number
  type: 'single' | 'batch' | 'watchfolder'
  status: 'queued' | 'processing' | 'done' | 'error' | 'partial'
  source: 'file' | 'watchfolder' | 'api'
  started_at: string | null
  finished_at: string | null
  files_total: number
  files_ok: number
  files_skipped: number
  files_failed: number
  created_at: string
  updated_at: string
}

export interface ImportFileRecord {
  id: number
  import_id: number
  path: string | null
  original_filename: string
  size_bytes: number | null
  sha256: string
  detected_format: string | null
  status: 'queued' | 'processing' | 'ok' | 'skipped_duplicate' | 'failed'
  error_message: string | null
  activity_id: number | null
  created_at: string
  updated_at: string
}

export interface ImportSingleResponse {
  importId: number
  importFileId?: number
  status: 'queued' | 'done' | 'duplicate' | 'failed'
  detectedFormat?: 'fit' | 'gpx' | 'tcx' | 'csv'
  sha256: string
  activityId?: number
  message: string
}

export interface ImportBatchFileResponse {
  originalFilename: string
  status: 'queued' | 'done' | 'duplicate' | 'failed'
  importFileId?: number
  detectedFormat?: 'fit' | 'gpx' | 'tcx' | 'csv'
  sha256: string
  activityId?: number
  message: string
}

export interface ImportBatchResponse {
  importId: number
  status: 'queued' | 'done' | 'partial' | 'error'
  filesTotal: number
  filesOk: number
  filesSkipped: number
  filesFailed: number
  files: ImportBatchFileResponse[]
}

export interface ImportRunsResponse {
  imports: ImportRun[]
  count: number
}

export interface ImportRunDetailResponse {
  import: ImportRun
  files: ImportFileRecord[]
  count: number
}

export interface ImportMetricsResponse {
  windowDays: number
  runs: number
  runsDone: number
  runsPartial: number
  runsError: number
  runsInProgress: number
  filesTotal: number
  filesOk: number
  filesSkipped: number
  filesFailed: number
  successRate: number
  failureRate: number
  avgFilesPerRun: number
  avgDurationSec: number | null
  lastRunAt: string | null
}

export interface ImportQueueStatusResponse {
  queued: number
  ready: number
  processing: number
  done: number
  failed: number
  failedLast24h: number
  doneLastHour: number
  nextAvailableAt: string | null
  worker?: {
    enabled: boolean
    running: boolean
    pollMs: number
    concurrency: number
    activeWorkers: number
    lastTickStartedAt: string | null
    lastTickFinishedAt: string | null
    lastError: string | null
    stale: boolean
    staleAfterMs: number
  }
  alerts?: Array<{
    code: string
    severity: 'warning' | 'critical'
    message: string
    value: number
    threshold: number
  }>
  monitor?: {
    enabled: boolean
    running: boolean
    pollMs: number
    cooldownMs: number
    webhookConfigured: boolean
    lastRunAt: string | null
    lastError: string | null
    sentCount: number
    failedCount: number
  }
}

export interface ImportQueueFailedJob {
  id: number
  import_id: number
  import_file_id: number
  status: 'failed'
  attempt_count: number
  max_attempts: number
  priority: number
  available_at: string
  started_at: string | null
  finished_at: string | null
  last_error: string | null
  original_filename: string
  detected_format: string | null
  file_status: 'queued' | 'processing' | 'ok' | 'skipped_duplicate' | 'failed'
  import_status: 'queued' | 'processing' | 'done' | 'error' | 'partial'
}

export interface ImportQueueFailedJobsResponse {
  jobs: ImportQueueFailedJob[]
  count: number
}

export interface ImportQueueBulkRequeueResponse {
  requested: number
  matched: number
  requeued: number
  skipped: number
  jobs: number[]
  importIds: number[]
}

export interface ImportQueueBulkDeleteResponse {
  requested: number
  deleted: number
  jobs: number[]
  importIds: number[]
  message: string
}

export interface WatchFolderStatusResponse {
  enabled: boolean
  running: boolean
  path: string | null
  sharePathHint?: string | null
  recursive: boolean
  pollSeconds: number
  stableChecksRequired: number
  inFlight: number
  trackedFiles: number
  stats: {
    scans: number
    scannedFiles: number
    importedFiles: number
    duplicates: number
    failed: number
    lastScanAt: string | null
    lastImportAt: string | null
    lastError: string | null
  }
}

export interface WatchFolderRescanResponse {
  message: string
  status: WatchFolderStatusResponse
}

export interface WatchFolderConfigResponse {
  enabled: boolean
  path: string
  sharePathHint?: string | null
  recursive: boolean
  pollSeconds: number
  stableChecksRequired: number
}

export interface WatchFolderConfigUpdatePayload {
  enabled: boolean
  path: string
  recursive: boolean
  pollSeconds: number
  stableChecksRequired: number
}

export interface WatchFolderConfigUpdateResponse {
  message: string
  config: WatchFolderConfigResponse
  status: WatchFolderStatusResponse
}

export const uploadImportFile = async (file: File): Promise<ImportSingleResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<ImportSingleResponse>('/import/file', formData)
  return data
}

export const uploadImportBatch = async (files: File[]): Promise<ImportBatchResponse> => {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  const { data } = await api.post<ImportBatchResponse>('/import/batch', formData)
  return data
}

export const uploadStravaExportZip = async (
  file: File,
  options?: {
    includeMedia?: boolean
    onUploadProgress?: (event: AxiosProgressEvent) => void
    onResumeDetected?: (info: { receivedBytes: number; nextChunkIndex: number; totalChunks: number }) => void
  }
): Promise<ImportBatchResponse> => {
  const chunkSize = 8 * 1024 * 1024
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  const clientKey = [
    'strava-export-zip',
    file.name,
    String(file.size),
    String(file.lastModified || 0),
  ].join(':')

  const init = await api.post<{
    uploadId: string
    sizeBytes: number
    chunkSize: number
    totalChunks: number
    receivedBytes: number
    nextChunkIndex: number
    complete: boolean
  }>('/import/strava-export-zip/chunked/init', {
    filename: file.name,
    clientKey,
    sizeBytes: file.size,
    chunkSize,
    totalChunks,
  }, {
    timeout: 0,
  })

  let uploadedBytes = Math.max(0, Number(init.data.receivedBytes || 0))
  const nextChunkStart = Math.max(0, Number(init.data.nextChunkIndex || 0))
  if (uploadedBytes > 0 || nextChunkStart > 0) {
    options?.onResumeDetected?.({
      receivedBytes: uploadedBytes,
      nextChunkIndex: nextChunkStart,
      totalChunks,
    })
  }

  const emitProgress = (loaded: number, total?: number) => {
    if (!options?.onUploadProgress) return
    options.onUploadProgress({
      loaded,
      total,
      progress: total && total > 0 ? loaded / total : undefined,
    } as AxiosProgressEvent)
  }

  emitProgress(uploadedBytes, file.size)

  for (let chunkIndex = nextChunkStart; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const blob = file.slice(start, end)

    let attempts = 0
    while (true) {
      attempts += 1
      try {
        const formData = new FormData()
        formData.append('chunk', blob, `${file.name}.part${chunkIndex}`)
        formData.append('chunkIndex', String(chunkIndex))
        formData.append('chunkOffset', String(start))
        await api.post(`/import/strava-export-zip/chunked/${init.data.uploadId}/chunk`, formData, {
          timeout: 0,
          onUploadProgress: (event) => {
            const loadedInChunk = Number(event.loaded || 0)
            emitProgress(Math.min(file.size, start + loadedInChunk), file.size)
          },
        })
        break
      } catch (error: any) {
        if (attempts >= 3) throw error
        const status = Number(error?.response?.status || 0)
        if (status === 409) {
          // Session may already have advanced (e.g. retry after network blip). Re-init and continue.
          const resumed = await api.post<{
            uploadId: string
            nextChunkIndex: number
            receivedBytes: number
          }>('/import/strava-export-zip/chunked/init', {
            filename: file.name,
            clientKey,
            sizeBytes: file.size,
            chunkSize,
            totalChunks,
          }, { timeout: 0 })
          uploadedBytes = Math.max(uploadedBytes, Number(resumed.data.receivedBytes || 0))
          emitProgress(uploadedBytes, file.size)
          if (Number(resumed.data.nextChunkIndex || 0) > chunkIndex) {
            break
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * attempts))
      }
    }

    uploadedBytes = end
    emitProgress(uploadedBytes, file.size)
  }

  emitProgress(file.size, file.size)

  const { data } = await api.post<ImportBatchResponse>(
    `/import/strava-export-zip/chunked/${init.data.uploadId}/complete`,
    options?.includeMedia ? { includeMedia: true } : {},
    { timeout: 0 }
  )
  return data
}

export const getImportRuns = async (limit: number = 50): Promise<ImportRunsResponse> => {
  const { data } = await api.get<ImportRunsResponse>('/imports', { params: { limit } })
  return data
}

export const getImportRun = async (id: number): Promise<ImportRunDetailResponse> => {
  const { data } = await api.get<ImportRunDetailResponse>(`/imports/${id}`)
  return data
}

export const getImportMetrics = async (days: number = 30): Promise<ImportMetricsResponse> => {
  const { data } = await api.get<ImportMetricsResponse>('/import/metrics', { params: { days } })
  return data
}

export const getImportQueueStatus = async (): Promise<ImportQueueStatusResponse> => {
  const { data } = await api.get<ImportQueueStatusResponse>('/import/queue/status')
  return data
}

export const getImportQueueFailedJobs = async (limit: number = 50): Promise<ImportQueueFailedJobsResponse> => {
  const { data } = await api.get<ImportQueueFailedJobsResponse>('/import/queue/failed', { params: { limit } })
  return data
}

export const requeueImportQueueJob = async (jobId: number, delayMs: number = 0): Promise<{ message: string }> => {
  const { data } = await api.post<{ message: string }>(`/import/queue/jobs/${jobId}/requeue`, { delayMs })
  return data
}

export const requeueFailedImportQueueJobs = async (
  params?: { limit?: number; importId?: number; delayMs?: number }
): Promise<ImportQueueBulkRequeueResponse> => {
  const { data } = await api.post<ImportQueueBulkRequeueResponse>('/import/queue/requeue-failed', params || {})
  return data
}

export const deleteImportQueueJob = async (jobId: number): Promise<{ message: string }> => {
  const { data } = await api.delete<{ message: string }>(`/import/queue/jobs/${jobId}`)
  return data
}

export const deleteFailedImportQueueJobs = async (
  params?: { limit?: number; importId?: number }
): Promise<ImportQueueBulkDeleteResponse> => {
  const { data } = await api.delete<ImportQueueBulkDeleteResponse>('/import/queue/failed', { data: params || {} })
  return data
}

export const retryFailedImportRunFiles = async (id: number): Promise<ImportBatchResponse> => {
  const { data } = await api.post<ImportBatchResponse>(`/imports/${id}/retry-failed`)
  return data
}

export const getWatchFolderStatus = async (): Promise<WatchFolderStatusResponse> => {
  const { data } = await api.get<WatchFolderStatusResponse>('/import/watch/status')
  return data
}

export const triggerWatchFolderRescan = async (): Promise<WatchFolderRescanResponse> => {
  const { data } = await api.post<WatchFolderRescanResponse>('/import/watch/rescan')
  return data
}

export const updateWatchFolderConfig = async (
  payload: WatchFolderConfigUpdatePayload
): Promise<WatchFolderConfigUpdateResponse> => {
  const { data } = await api.put<WatchFolderConfigUpdateResponse>('/import/watch/config', payload)
  return data
}

// Power Curve API
export interface PowerCurveDuration {
  duration: number
  label: string
  watts: number | null
  activity_id?: number | null
}

export interface ActivityPowerCurve {
  activity_id: number
  durations: PowerCurveDuration[]
  message?: string
}

export interface AggregatedPowerCurve {
  year: string | number
  type: string
  activities_analyzed: number
  durations: PowerCurveDuration[]
}

export interface YearlyPowerCurveEntry {
  year: number
  activities: number
  '5s'?: number | null
  '10s'?: number | null
  '30s'?: number | null
  '1min'?: number | null
  '2min'?: number | null
  '5min'?: number | null
  '10min'?: number | null
  '20min'?: number | null
  '1hr'?: number | null
}

export interface YearlyPowerCurve {
  type: string
  durations: string[]
  years: YearlyPowerCurveEntry[]
}

export const getActivityPowerCurve = async (id: number): Promise<ActivityPowerCurve> => {
  const { data } = await api.get<ActivityPowerCurve>(`/activities/${id}/power-curve`)
  return data
}

export interface KmSplit {
  km: number
  time: number
  pace: string
  avgHr?: number
}

export interface KmSplitsResponse {
  activity_id: number
  splits: KmSplit[]
  total_distance_km: string
  message?: string
}

export const getActivityKmSplits = async (id: number): Promise<KmSplitsResponse> => {
  const { data } = await api.get<KmSplitsResponse>(`/activities/${id}/km-splits`)
  return data
}

export interface VAMResult {
  activity_id: number
  vam: number
  totalClimbingTime: number
  totalElevationGain: number
  climbSegments: Array<{
    elevationGain: number
    duration: number
  }>
  minClimbHeight: number
  message?: string
}

export const getActivityVAM = async (id: number, minHeight: number = 25): Promise<VAMResult> => {
  const { data } = await api.get<VAMResult>(`/activities/${id}/vam`, {
    params: { minHeight }
  })
  return data
}

export interface TopVAMActivity {
  strava_activity_id: number
  name: string
  type: string
  start_date: string
  distance_km: number
  moving_time: number
  total_elevation_gain: number
  year: number
  vam: number
  climbing_time: number
  climb_count: number
}

export interface TopVAMResponse {
  activities: TopVAMActivity[]
  count: number
}

export const getTopVAMActivities = async (params?: {
  limit?: number
  year?: number
  type?: string
}): Promise<TopVAMResponse> => {
  const { data } = await api.get<TopVAMResponse>('/top-vam-activities', { params })
  return data
}

export interface RunningBestEffort {
  distance_meters: number
  label: string
  time_seconds: number
  pace: string
  activity_id: number | null
  activity_name: string | null
  activity_date: string | null
  avg_hr: number | null
}

export interface RunningBestEffortsResponse {
  efforts: RunningBestEffort[]
  activities_analyzed: number
}

export const getRunningBestEfforts = async (params?: {
  year?: number
  months?: number
}): Promise<RunningBestEffortsResponse> => {
  const { data } = await api.get<RunningBestEffortsResponse>('/running-best-efforts', { params })
  return data
}

export interface RunningPaceTrend {
  period: string
  activities_count: number
  total_distance_km: number
  avg_pace: string
  avg_pace_decimal: number
  avg_hr: number | null
  avg_distance_km: number
}

export interface RunningPaceTrendsResponse {
  trends: RunningPaceTrend[]
  total_activities: number
  date_range: {
    from: string
    to: string
  }
}

export const getRunningPaceTrends = async (params?: {
  months?: number
  groupBy?: 'week' | 'month'
}): Promise<RunningPaceTrendsResponse> => {
  const { data } = await api.get<RunningPaceTrendsResponse>('/running-pace-trends', { params })
  return data
}

export interface RunningActivity {
  activity_id: number
  name: string
  date: string
  distance_km: number
  moving_time: number
  avg_pace_decimal: number
  avg_pace: string
  avg_hr: number | null
  type: string
}

export interface RunningActivitiesResponse {
  activities: RunningActivity[]
  total_activities: number
}

export const getRunningActivities = async (params?: {
  months?: number
}): Promise<RunningActivitiesResponse> => {
  const { data } = await api.get<RunningActivitiesResponse>('/running-activities', { params })
  return data
}

export const getAggregatedPowerCurve = async (params?: {
  year?: number
  type?: string
}): Promise<AggregatedPowerCurve> => {
  const { data } = await api.get<AggregatedPowerCurve>('/power-curve', { params })
  return data
}

export const getYearlyPowerCurve = async (params?: {
  type?: string
}): Promise<YearlyPowerCurve> => {
  const { data } = await api.get<YearlyPowerCurve>('/power-curve/yearly', { params })
  return data
}

// Cached Power Curve API (faster)
export interface CachedPowerCurveDuration {
  duration: number
  label: string
  watts: number
  watts_per_kg: number
  activity_id: number | null
  activity_date: string | null
  activity_name: string | null
}

export interface CachedPowerCurveResponse {
  year: string | number
  type: string
  activities_analyzed: number
  athlete_weight: number
  durations: CachedPowerCurveDuration[]
  cached: boolean
  calculated_at?: string
  message?: string
}

export interface CachedYearlyPowerCurve {
  type: string
  durations: string[]
  years: YearlyPowerCurveEntry[]
  athlete_weight: number
  cached: boolean
  message?: string
}

export const getCachedPowerCurve = async (params?: {
  year?: number
  type?: string
}): Promise<CachedPowerCurveResponse> => {
  const { data } = await api.get<CachedPowerCurveResponse>('/power-curve/cached', { params })
  return data
}

export const getCachedYearlyPowerCurve = async (params?: {
  type?: string
}): Promise<CachedYearlyPowerCurve> => {
  const { data } = await api.get<CachedYearlyPowerCurve>('/power-curve/yearly/cached', { params })
  return data
}

export const calculatePowerCurve = async (): Promise<{ success: boolean; cache_entries: number; elapsed_ms: number }> => {
  const { data } = await api.post('/power-curve/calculate')
  return data
}

// FTP and Power Zones API
export interface PowerZone {
  zone: number
  name: string
  min: number
  max: number | null
  color: string
}

export interface FTPResponse {
  ftp: number | null
  ftp_source: 'manual' | 'estimated_20min' | 'estimated_60min'
  ftp_wkg: number | null
  weight: number
  estimates: {
    from_20min: number | null
    from_60min: number | null
  }
  zones: PowerZone[]
}

export const getFTP = async (): Promise<FTPResponse> => {
  const { data } = await api.get<FTPResponse>('/ftp')
  return data
}

// User Settings API
export interface UserSettings {
  athlete_weight?: string
  [key: string]: string | undefined
}

export const getSettings = async (): Promise<UserSettings> => {
  const { data } = await api.get<UserSettings>('/settings')
  return data
}

export const updateSetting = async (key: string, value: string): Promise<{ key: string; value: string; updated: boolean }> => {
  const { data } = await api.put(`/settings/${key}`, { value })
  return data
}

// Week Streak API
export interface WeekStreakResponse {
  week_streak: number
}

export const getWeekStreak = async (): Promise<WeekStreakResponse> => {
  const { data } = await api.get<WeekStreakResponse>('/stats/week-streak')
  return data
}

// Calendar API
export interface CalendarDay {
  date: string
  count: number
  total_km: number
  types: string[]
}

export interface CalendarResponse {
  year: number
  month: number
  days: CalendarDay[]
}

export const getCalendarData = async (year?: number, month?: number): Promise<CalendarResponse> => {
  const { data } = await api.get<CalendarResponse>('/stats/calendar', {
    params: { year, month }
  })
  return data
}

// Weekly Progress API
export interface WeeklyProgress {
  week_start: string
  activities: number
  distance_km: number
  hours: number
  elevation_m: number
}

export const getWeeklyProgress = async (): Promise<WeeklyProgress> => {
  const { data } = await api.get<WeeklyProgress>('/stats/weekly-progress')
  return data
}

// Year Stats API
export interface YearStatsResponse {
  year: number
  total_activities: string
  total_distance_km: string
  total_time_hours: string
  total_elevation_m: string
  by_type: Array<{ type: string; count: string; total_km: string }>
}

export const getYearStats = async (year: number): Promise<YearStatsResponse> => {
  const { data } = await api.get<YearStatsResponse>(`/stats/year/${year}`)
  return data
}

// Power Metrics API
export const getActivityPowerMetrics = async (activityId: number): Promise<ActivityPowerMetrics> => {
  const { data } = await api.get<ActivityPowerMetrics>(`/activities/${activityId}/power-metrics`)
  return data
}

export const getBulkPowerMetrics = async (params?: {
  startDate?: string
  endDate?: string
  type?: string
}): Promise<BulkPowerMetrics> => {
  const { data } = await api.get<BulkPowerMetrics>('/activities/power-metrics/bulk', { params })
  return data
}

// Training Load - Performance Management Chart (CTL/ATL/TSB)
export const getTrainingLoadPMC = async (params: {
  startDate: string
  endDate: string
  type?: string
}): Promise<TrainingLoad> => {
  const { data } = await api.get<TrainingLoad>('/training-load', { params })
  return data
}

// User Profile
export const getUserProfile = async (): Promise<UserProfile> => {
  const { data } = await api.get<UserProfile>('/user/profile')
  return data
}

export const updateUserProfile = async (updates: Partial<UserProfile>): Promise<UserProfile> => {
  const { data } = await api.put<UserProfile>('/user/profile', updates)
  return data
}

export const updateUserSetting = async (key: string, value: string): Promise<void> => {
  await api.put(`/user/settings/${key}`, { value })
}

// User Management
export const getAllUsers = async (): Promise<UserProfile[]> => {
  const { data } = await api.get<UserProfile[]>('/users')
  return data
}

export const createUser = async (userData: {
  strava_athlete_id: number
  strava_refresh_token: string
  strava_access_token?: string
  strava_token_expires_at?: number
  strava_scope?: string
  firstname?: string
  lastname?: string
  username?: string
  city?: string
  country?: string
}): Promise<UserProfile> => {
  const { data } = await api.post<UserProfile>('/users', userData)
  return data
}

export const deleteUser = async (userId: number): Promise<void> => {
  await api.delete(`/users/${userId}`)
}

export const activateUser = async (userId: number): Promise<UserProfile> => {
  const { data } = await api.put<UserProfile>(`/users/${userId}/activate`)
  return data
}


// Sync API
export interface SyncResponse {
  message: string
  status: string
}

export const triggerSync = async (): Promise<SyncResponse> => {
  const { data } = await api.post<SyncResponse>("/sync")
  return data
}

export const triggerFullSync = async (): Promise<SyncResponse> => {
  const { data } = await api.post<SyncResponse>('/sync/full')
  return data
}

export const triggerInitialSync = async (): Promise<SyncResponse> => {
  const { data } = await api.post<SyncResponse>('/sync/initial')
  return data
}

export const triggerBackfillSync = async (): Promise<SyncResponse> => {
  const { data } = await api.post<SyncResponse>('/sync/backfill')
  return data
}
