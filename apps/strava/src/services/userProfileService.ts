import DatabaseService from './database.js'

const db = new DatabaseService()

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
  last_sync_at?: string | null
  is_active?: boolean
  settings?: Record<string, string>
  total_activities?: number
  total_distance_km?: number
  activities_this_year?: number
}

export interface UserSettings {
  athlete_weight?: string
  ftp?: string
  weekly_distance_goal?: string
  yearly_distance_goal?: string
  weekly_distance_goal_ride?: string
  yearly_distance_goal_ride?: string
  weekly_distance_goal_run?: string
  yearly_distance_goal_run?: string
}

/**
 * Get user profile by ID
 */
export async function getUserProfile(userId: number): Promise<UserProfile | null> {
  const result = await db.query(
    'SELECT * FROM strava.user_profile_complete WHERE id = $1',
    [userId]
  )

  if (result.rows.length === 0) {
    return null
  }

  return result.rows[0]
}

/**
 * Get the default/first user profile (for single-user mode)
 */
export async function getDefaultUserProfile(): Promise<UserProfile | null> {
  const result = await db.query(
    'SELECT * FROM strava.user_profile_complete ORDER BY id LIMIT 1'
  )

  if (result.rows.length === 0) {
    return null
  }

  return result.rows[0]
}

/**
 * Get all user profiles
 */
export async function getAllUserProfiles(): Promise<UserProfile[]> {
  const result = await db.query(
    'SELECT * FROM strava.user_profile_complete ORDER BY id'
  )

  return result.rows
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: number,
  updates: Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at' | 'settings'>>
): Promise<UserProfile | null> {
  const fields: string[] = []
  const values: any[] = []
  let paramCount = 1

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = $${paramCount}`)
      values.push(value)
      paramCount++
    }
  })

  if (fields.length === 0) {
    return getUserProfile(userId)
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`)
  values.push(userId)

  const query = `
    UPDATE strava.user_profile
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `

  const result = await db.query(query, values)

  if (result.rows.length === 0) {
    return null
  }

  return getUserProfile(userId)
}

/**
 * Update user setting
 */
export async function updateUserSetting(
  userId: number,
  key: string,
  value: string
): Promise<void> {
  await db.query(
    `
    INSERT INTO strava.user_settings (user_id, key, value, updated_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    ON CONFLICT (key, user_id)
    DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `,
    [userId, key, value]
  )
}

/**
 * Get user settings
 */
export async function getUserSettings(userId: number): Promise<UserSettings> {
  const result = await db.query(
    'SELECT key, value FROM strava.user_settings WHERE user_id = $1',
    [userId]
  )

  const settings: UserSettings = {}
  result.rows.forEach((row: any) => {
    settings[row.key as keyof UserSettings] = row.value
  })

  return settings
}

/**
 * Sync user profile from Strava API
 */
export async function syncUserProfileFromStrava(athleteData: any): Promise<UserProfile> {
  const result = await db.query(
    `
    INSERT INTO strava.user_profile (
      strava_athlete_id, username, firstname, lastname,
      profile_photo, city, country, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    ON CONFLICT (strava_athlete_id)
    DO UPDATE SET
      username = EXCLUDED.username,
      firstname = EXCLUDED.firstname,
      lastname = EXCLUDED.lastname,
      profile_photo = EXCLUDED.profile_photo,
      city = EXCLUDED.city,
      country = EXCLUDED.country,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
    `,
    [
      athleteData.id,
      athleteData.username,
      athleteData.firstname,
      athleteData.lastname,
      athleteData.profile,
      athleteData.city,
      athleteData.country,
    ]
  )

  return getUserProfile(result.rows[0].id) as Promise<UserProfile>
}

/**
 * Create a new user profile
 */
export async function createUserProfile(data: {
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
}): Promise<UserProfile> {
  const result = await db.query(
    `
    INSERT INTO strava.user_profile (
      strava_athlete_id, strava_refresh_token, strava_access_token,
      strava_token_expires_at, strava_scope, firstname, lastname,
      username, city, country, is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
    `,
    [
      data.strava_athlete_id,
      data.strava_refresh_token,
      data.strava_access_token || null,
      data.strava_token_expires_at || null,
      data.strava_scope || 'read,activity:read_all',
      data.firstname || null,
      data.lastname || null,
      data.username || null,
      data.city || null,
      data.country || null,
    ]
  )

  return getUserProfile(result.rows[0].id) as Promise<UserProfile>
}

/**
 * Delete user profile
 */
export async function deleteUserProfile(userId: number): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM strava.user_profile WHERE id = $1',
    [userId]
  )

  return result.rowCount !== null && result.rowCount > 0
}

/**
 * Set active user (deactivate others, activate this one)
 */
export async function setActiveUser(userId: number): Promise<void> {
  await db.query('UPDATE strava.user_profile SET is_active = false')
  await db.query('UPDATE strava.user_profile SET is_active = true WHERE id = $1', [userId])
}
