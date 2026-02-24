export interface Activity {
  strava_activity_id: number
  name: string
  type: string
  start_date: string
  distance_km: string | number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: string | number
  avg_speed_kmh: string | number
  max_speed_kmh: string | number
  average_heartrate?: string | number | null
  max_heartrate?: number | null
  average_watts?: string | number | null
  max_watts?: number | null
  average_cadence?: string | number | null
  kilojoules?: string | number | null
  normalized_power?: number | null
  intensity_factor?: number | null
  training_stress_score?: number | null
  calories?: number | null
  gear_id?: string | null
  has_heartrate?: boolean
  manual?: boolean
  photo_count?: number
  primary_photo_url?: string | null
  // Engagement metrics
  kudos_count?: number
  comment_count?: number
  achievement_count?: number
  has_segment_pr?: boolean
  // Device info
  device_name?: string | null
  created_at?: string
  updated_at?: string
}

export interface ActivityPhoto {
  id: number
  activity_id: number
  unique_id: string
  caption?: string
  source: number
  url_small?: string
  url_medium?: string
  url_large?: string
  is_primary: boolean
  location?: [number, number]
  uploaded_at?: string
}

export interface ActivityWithStreams extends Activity {
  streams?: {
    time?: number[]
    distance?: number[]
    latlng?: [number, number][]
    altitude?: number[]
    heartrate?: number[]
    watts?: number[]
    cadence?: number[]
  }
  photos?: ActivityPhoto[]
}

export interface Stats {
  total_activities: number
  total_distance_km: number | string
  total_time_hours?: number
  total_elevation_m?: number
  by_type: Array<{
    type: string
    count: string | number
    total_km: string | number
  }>
}

export interface MonthlyStats {
  month: string  // timestamp from PostgreSQL DATE_TRUNC
  type: string
  activity_count: number
  total_distance_km: number
  total_hours: number
  total_elevation_m: number
}

export interface Gear {
  id: string
  name: string
  source?: 'manual' | 'synced' | string
  type?: string
  brand_name?: string
  model_name?: string
  description?: string
  distance: number
  retired: boolean
  // From gear_usage view
  activity_count?: number | string
  total_distance_km?: number | string
  total_hours?: number | string
  gear_total_distance_km?: number | string
}

export interface GearMaintenanceItem {
  id?: number
  gear_id: string
  component_key: string
  label: string
  target_km: number
  last_reset_km: number
  last_reset_at?: string | null
  created_at?: string
  updated_at?: string
}

// Personal Records Types
export interface RecordActivity {
  strava_activity_id: number
  name: string
  type: string
  start_date: string
  distance_km: number
  moving_time: number
  total_elevation_gain: number
  avg_speed_kmh?: number
  average_heartrate?: number
  max_heartrate?: number
  calories?: number
  kudos_count?: number
  comment_count?: number
}

export interface PersonalRecords {
  longest_distance: RecordActivity[]
  longest_duration: RecordActivity[]
  most_elevation: RecordActivity[]
  fastest_speed: RecordActivity[]
  highest_heartrate: RecordActivity[]
  most_calories: RecordActivity[]
  most_kudos: RecordActivity[]
  most_comments: RecordActivity[]
}

export interface StreakData {
  current_streak: number
  longest_streak: number
  longest_streak_start: string | null
  longest_streak_end: string | null
  total_active_days: number
}

export interface YearlyStats {
  year: number
  activity_count: number
  total_distance_km: number
  total_hours: number
  total_elevation_m: number
  avg_distance_km: number
  avg_duration_min: number
}

export interface MonthlyBest {
  strava_activity_id: number
  name: string
  type: string
  start_date: string
  distance_km: number
  moving_time: number
  total_elevation_gain: number
  month: string
}

// Power Metrics Types
export interface PowerMetrics {
  normalized_power: number | null
  intensity_factor: number | null
  training_stress_score: number | null
  average_power: number | null
  max_power: number | null
  duration_seconds: number
  variability_index?: number | null
}

export interface ActivityPowerMetrics {
  activity_id: number
  has_power: boolean
  ftp: number | null
  metrics: PowerMetrics
}

export interface BulkPowerMetrics {
  start_date: string
  end_date: string
  type: string
  ftp: number | null
  total_activities: number
  activities_with_power: number
  activities: Array<{
    activity_id: number
    name: string
    date: string
    type: string
    duration_seconds: number
    average_power: number | null
    normalized_power: number | null
    intensity_factor: number | null
    training_stress_score: number | null
  }>
}

// Training Load Types (CTL/ATL/TSB)
export interface DailyTrainingLoad {
  date: string
  tss: number
  ctl: number
  atl: number
  tsb: number
}

export interface TrainingLoadInsights {
  rampRate: number | null
  tsbInterpretation: {
    status: 'fresh' | 'optimal' | 'neutral' | 'fatigued' | 'very_fatigued'
    description: string
    recommendation: string
  } | null
  safeRampRate: boolean | null
}

export interface TrainingLoad {
  dailyValues: DailyTrainingLoad[]
  current: {
    ctl: number
    atl: number
    tsb: number
  }
  insights?: TrainingLoadInsights
}
