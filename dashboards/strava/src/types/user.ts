export interface UserProfile {
  id: number
  strava_athlete_id: number
  username: string | null
  firstname: string | null
  lastname: string | null
  profile_photo: string | null
  city: string | null
  country: string | null
  created_at: string
  updated_at: string
  strava_access_token?: string | null
  strava_refresh_token?: string | null
  strava_token_expires_at?: number | null
  strava_scope?: string | null
  strava_token_set?: boolean
  last_sync_at?: string | null
  is_active?: boolean
  settings?: {
    athlete_weight?: string
    ftp?: string
    max_heartrate?: string
    resting_heartrate?: string
    weekly_distance_goal?: string
    yearly_distance_goal?: string
    weekly_distance_goal_ride?: string
    yearly_distance_goal_ride?: string
    weekly_distance_goal_run?: string
    yearly_distance_goal_run?: string
    sync_timezone?: string
    sync_on_startup?: string
    sync_startup_stale_hours?: string
    sync_activity_enabled?: string
    sync_activity_cron?: string
    sync_activity_recent_days?: string
    sync_activity_include_streams?: string
    sync_activity_include_segments?: string
    sync_backfill_enabled?: string
    sync_backfill_cron?: string
    sync_backfill_streams_limit?: string
    sync_backfill_segments_limit?: string
    sync_backfill_photos_limit?: string
    sync_backfill_downloads_limit?: string
    sync_initial_days?: string
    sync_initial_status?: string
    sync_initial_started_at?: string
    sync_initial_done_at?: string
    sync_initial_last_error?: string
    [key: string]: string | undefined
  }
  total_activities?: number
  total_distance_km?: number
  activities_this_year?: number
}

export interface UserSettings {
  athlete_weight?: string
  ftp?: string
  max_heartrate?: string
  resting_heartrate?: string
  weekly_distance_goal?: string
  yearly_distance_goal?: string
  weekly_distance_goal_ride?: string
  yearly_distance_goal_ride?: string
  weekly_distance_goal_run?: string
  yearly_distance_goal_run?: string
  sync_timezone?: string
  sync_on_startup?: string
  sync_startup_stale_hours?: string
  sync_activity_enabled?: string
  sync_activity_cron?: string
  sync_activity_recent_days?: string
  sync_activity_include_streams?: string
  sync_activity_include_segments?: string
  sync_backfill_enabled?: string
  sync_backfill_cron?: string
  sync_backfill_streams_limit?: string
  sync_backfill_segments_limit?: string
  sync_backfill_photos_limit?: string
  sync_backfill_downloads_limit?: string
  sync_initial_days?: string
  sync_initial_status?: string
  sync_initial_started_at?: string
  sync_initial_done_at?: string
  sync_initial_last_error?: string
  [key: string]: string | undefined
}
