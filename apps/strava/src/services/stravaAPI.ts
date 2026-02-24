import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root (apps/strava) - override existing env vars
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

export interface StravaAthlete {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  city: string;
  state: string;
  country: string;
  sex: string;
  weight: number;
  profile?: string;
  profile_medium?: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  average_cadence?: number;
  kilojoules?: number;
  calories?: number;
  gear_id?: string;
  device_name?: string;
  has_heartrate: boolean;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  athlete_count: number;
  photo_count: number;
  total_photo_count: number;
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
  flagged: boolean;
}

export interface StravaStream {
  type: string;
  data: any[];
  series_type: string;
  original_size: number;
  resolution: string;
}

export interface StravaSegment {
  id: number;
  name: string;
  activity_type?: string;
  distance?: number;
  average_grade?: number;
  maximum_grade?: number;
  elevation_high?: number;
  elevation_low?: number;
  start_latlng?: [number, number];
  end_latlng?: [number, number];
  climb_category?: number;
  city?: string;
  state?: string;
  country?: string;
}

export interface StravaSegmentEffort {
  id: number;
  name?: string;
  elapsed_time?: number;
  moving_time?: number;
  start_date?: string;
  start_date_local?: string;
  distance?: number;
  average_watts?: number;
  average_heartrate?: number;
  pr_rank?: number;
  kom_rank?: number;
  rank?: number;
  start_index?: number;
  end_index?: number;
  device_watts?: boolean;
  hidden?: boolean;
  segment: StravaSegment;
}

export interface StravaGear {
  id: string;
  name: string;
  brand_name: string;
  model_name: string;
  description: string;
  distance: number;
  retired: boolean;
  type?: string;
}

export interface StravaPhoto {
  unique_id: string;
  activity_id: number;
  activity_name?: string;
  caption?: string;
  source: number; // 1 = Strava, 2 = Instagram
  urls: {
    [size: string]: string;
  };
  sizes?: {
    [size: string]: [number, number];
  };
  default_photo?: boolean;
  uploaded_at?: string;
  created_at?: string;
  created_at_local?: string;
  location?: [number, number];
}

export interface StravaAthleteStats {
  recent_ride_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elevation_gain: number;
  };
  recent_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elevation_gain: number;
  };
  recent_swim_totals: {
    count: number;
    distance: number;
    moving_time: number;
  };
  ytd_ride_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elevation_gain: number;
  };
  ytd_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elevation_gain: number;
  };
  ytd_swim_totals: {
    count: number;
    distance: number;
    moving_time: number;
  };
  all_ride_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elevation_gain: number;
  };
  all_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elevation_gain: number;
  };
  all_swim_totals: {
    count: number;
    distance: number;
    moving_time: number;
  };
}

export interface StravaActivityDetail extends StravaActivity {
  segment_efforts?: StravaSegmentEffort[];
}

export class StravaAPIService {
  private client: AxiosInstance;
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private accessToken: string = '';
  private tokenExpiresAt: number = 0;
  private readonly maxRetries: number = 3;

  constructor(options?: { clientId?: string; clientSecret?: string; refreshToken?: string }) {
    this.clientId = options?.clientId ?? process.env.STRAVA_CLIENT_ID ?? '';
    this.clientSecret = options?.clientSecret ?? process.env.STRAVA_CLIENT_SECRET ?? '';
    this.refreshToken = options?.refreshToken ?? process.env.STRAVA_REFRESH_TOKEN ?? '';

    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('Missing Strava credentials. Please provide STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN');
    }

    this.client = axios.create({
      baseURL: 'https://www.strava.com/api/v3',
      headers: {
        'Accept': 'application/json',
      },
    });

    // Add request interceptor to handle authentication
    this.client.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      config.headers.Authorization = `Bearer ${this.accessToken}`;
      return config;
    });

    // Retry on rate limit (429) with backoff
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const status = error.response?.status;
        const config = error.config as any;
        if (status === 429 && config) {
          const retryCount = config._retryCount || 0;
          if (retryCount >= this.maxRetries) {
            return Promise.reject(error);
          }

          config._retryCount = retryCount + 1;
          const delayMs = this.getRetryDelayMs(error, retryCount);
          console.warn(`⏳ Strava rate limit hit (429). Waiting ${Math.round(delayMs / 1000)}s before retry ${config._retryCount}/${this.maxRetries}...`);
          await this.sleep(delayMs);
          return this.client(config);
        }
        return Promise.reject(error);
      }
    );
  }

  private getRetryDelayMs(error: any, retryCount: number): number {
    const retryAfterHeader = error.response?.headers?.['retry-after'];
    if (retryAfterHeader) {
      const retryAfterSeconds = parseInt(retryAfterHeader, 10);
      if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000;
      }
    }

    const usageHeader = error.response?.headers?.['x-ratelimit-usage'];
    const limitHeader = error.response?.headers?.['x-ratelimit-limit'];
    if (usageHeader && limitHeader) {
      const usage = usageHeader.split(',').map((value: string) => parseInt(value.trim(), 10));
      const limits = limitHeader.split(',').map((value: string) => parseInt(value.trim(), 10));
      const shortUsage = usage[0];
      const longUsage = usage[1];
      const shortLimit = limits[0];
      const longLimit = limits[1];

      if (Number.isFinite(shortUsage) && Number.isFinite(shortLimit) && shortUsage >= shortLimit) {
        return 15 * 60 * 1000;
      }
      if (Number.isFinite(longUsage) && Number.isFinite(longLimit) && longUsage >= longLimit) {
        return 60 * 60 * 1000;
      }
    }

    return Math.min(15 * 60 * 1000, (retryCount + 1) * 60 * 1000);
  }

  /**
   * Ensure we have a valid access token (refresh if necessary)
   */
  private async ensureValidToken(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    if (this.accessToken && this.tokenExpiresAt > now + 300) {
      // Token is still valid (with 5 minute buffer)
      return;
    }

    console.log('🔄 Refreshing Strava access token...');

    try {
      const response = await axios.post('https://www.strava.com/oauth/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = response.data.expires_at;
      this.refreshToken = response.data.refresh_token; // Update refresh token

      console.log('✅ Access token refreshed successfully');
    } catch (error: any) {
      console.error('❌ Error refreshing access token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get authenticated athlete information
   */
  async getAthlete(): Promise<StravaAthlete> {
    try {
      const response = await this.client.get('/athlete');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching athlete:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get athlete statistics
   */
  async getAthleteStats(athleteId: number): Promise<StravaAthleteStats> {
    try {
      const response = await this.client.get(`/athletes/${athleteId}/stats`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching athlete stats:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch paginated list of activities
   */
  async getActivities(
    page: number = 1,
    perPage: number = 30,
    options?: { after?: number; before?: number }
  ): Promise<StravaActivity[]> {
    try {
      const params: Record<string, number> = {
        page,
        per_page: perPage,
      };
      if (options?.after) {
        params.after = options.after;
      }
      if (options?.before) {
        params.before = options.before;
      }

      const response = await this.client.get('/athlete/activities', { params });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching activities:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch activities after a timestamp (handles pagination)
   */
  async getActivitiesSince(after: number, before?: number, perPage: number = 100): Promise<StravaActivity[]> {
    let allActivities: StravaActivity[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const activities = await this.getActivities(page, perPage, { after, before });

      if (activities.length === 0) {
        hasMore = false;
      } else {
        allActivities = allActivities.concat(activities);
        page++;
        if (activities.length < perPage) {
          hasMore = false;
        } else {
          await this.sleep(1000);
        }
      }
    }

    return allActivities;
  }

  /**
   * Fetch all activities (handles pagination automatically)
   */
  async getAllActivities(): Promise<StravaActivity[]> {
    let allActivities: StravaActivity[] = [];
    let page = 1;
    let hasMore = true;

    console.log('📥 Fetching activities from Strava...');

    while (hasMore) {
      const activities = await this.getActivities(page, 100);

      if (activities.length === 0) {
        hasMore = false;
      } else {
        allActivities = allActivities.concat(activities);
        console.log(`   Page ${page}: ${activities.length} activities`);
        page++;

        // Rate limiting: Strava allows 100 requests per 15 minutes, 1000 per day
        // Wait 1 second between pages to be safe
        if (hasMore && activities.length === 100) {
          await this.sleep(1000);
        }
      }
    }

    console.log(`✅ Total activities fetched: ${allActivities.length}`);
    return allActivities;
  }

  /**
   * Get detailed activity by ID
   */
  async getActivity(activityId: number): Promise<StravaActivity> {
    try {
      const response = await this.client.get(`/activities/${activityId}`);
      return response.data;
    } catch (error: any) {
      console.error(`❌ Error fetching activity ${activityId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get detailed activity including segment efforts
   */
  async getActivityWithSegments(activityId: number, includeAllEfforts: boolean = true): Promise<StravaActivityDetail> {
    try {
      const response = await this.client.get(`/activities/${activityId}`, {
        params: includeAllEfforts ? { include_all_efforts: true } : undefined,
      });
      return response.data;
    } catch (error: any) {
      console.error(`❌ Error fetching activity segments ${activityId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get activity streams (GPS, heartrate, watts, etc.)
   */
  async getActivityStreams(
    activityId: number,
    keys: string[] = ['latlng', 'heartrate', 'watts', 'cadence', 'altitude', 'time', 'distance', 'velocity_smooth']
  ): Promise<StravaStream[]> {
    try {
      const response = await this.client.get(`/activities/${activityId}/streams`, {
        params: {
          keys: keys.join(','),
          key_by_type: true,
        },
      });

      // When key_by_type is true, response.data is an object like {latlng: {data: [...]}, heartrate: {data: [...]}}
      // We need to preserve the type from the key
      return Object.entries(response.data).map(([type, stream]: [string, any]) => ({
        ...stream,
        type,
      }));
    } catch (error: any) {
      // Streams might not be available for all activities (e.g., manual entries)
      if (error.response?.status === 404) {
        return [];
      }
      console.error(`⚠️  Error fetching streams for activity ${activityId}:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get gear by ID
   */
  async getGear(gearId: string): Promise<StravaGear | null> {
    try {
      const response = await this.client.get(`/gear/${gearId}`);
      return response.data;
    } catch (error: any) {
      console.error(`⚠️  Error fetching gear ${gearId}:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get activity photos
   */
  async getActivityPhotos(activityId: number, size: number = 600): Promise<StravaPhoto[]> {
    try {
      const response = await this.client.get(`/activities/${activityId}/photos`, {
        params: {
          photo_sources: true,
          size: size,
        },
      });
      return response.data || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      console.error(`⚠️  Error fetching photos for activity ${activityId}:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Sleep helper for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default StravaAPIService;
