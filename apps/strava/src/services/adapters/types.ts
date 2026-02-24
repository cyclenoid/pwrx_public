export type AdapterId = string;

export interface AdapterCapabilities {
  supportsFiles: boolean;
  supportsOAuth: boolean;
  supportsWebhooks: boolean;
  supportsSegments: boolean;
  supportsSync: boolean;
  supportsPhotos: boolean;
}

export interface AdapterIngestParams {
  source?: string;
  [key: string]: any;
}

export interface AdapterSyncBackfillSegmentsResult {
  processed: number;
  efforts: number;
  errors: number;
  rateLimited: boolean;
}

export interface AdapterSyncClient {
  syncRecentActivities: (days: number, includeStreams: boolean, includeSegments: boolean) => Promise<number>;
  backfillStreams: (limit: number) => Promise<number>;
  backfillSegments: (limit: number) => Promise<AdapterSyncBackfillSegmentsResult>;
  syncPhotos: (limit: number) => Promise<number>;
  downloadPhotos: (limit: number) => Promise<number>;
  syncInitialActivities: (days: number, includeStreams: boolean, includeSegments: boolean) => Promise<number>;
  close: () => Promise<void>;
}

export interface AdapterUserProfile {
  id: number;
  strava_athlete_id?: number | null;
  strava_refresh_token?: string | null;
  username?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  city?: string | null;
  country?: string | null;
  profile_photo?: string | null;
}

export interface AdapterCreateUserProfileInput {
  strava_athlete_id: number;
  strava_refresh_token: string;
  strava_access_token?: string;
  strava_token_expires_at?: number;
  strava_scope?: string;
  firstname?: string;
  lastname?: string;
  username?: string;
  city?: string;
  country?: string;
}

export interface AdapterUserClient {
  getUserProfile: (userId: number) => Promise<AdapterUserProfile | null>;
  getDefaultUserProfile: () => Promise<AdapterUserProfile | null>;
  getAllUserProfiles: () => Promise<AdapterUserProfile[]>;
  updateUserProfile: (userId: number, updates: Record<string, unknown>) => Promise<AdapterUserProfile | null>;
  refreshUserProfileFromProvider?: (userId: number, fallbackRefreshToken?: string) => Promise<AdapterUserProfile | null>;
  updateUserSetting: (userId: number, key: string, value: string) => Promise<void>;
  getUserSettings: (userId: number) => Promise<Record<string, string>>;
  createUserProfile: (data: AdapterCreateUserProfileInput) => Promise<AdapterUserProfile>;
  deleteUserProfile: (userId: number) => Promise<boolean>;
  setActiveUser: (userId: number) => Promise<void>;
  getRefreshToken: (userId: number) => Promise<string | null>;
}

export interface ActivitySourceAdapter {
  id: AdapterId;
  name: string;
  enabled: boolean;
  capabilities: AdapterCapabilities;
  createSyncClient?: () => AdapterSyncClient;
  createUserClient?: () => AdapterUserClient;
  ingest?: (params: AdapterIngestParams) => Promise<void>;
  healthcheck?: () => Promise<boolean>;
  disconnect?: () => Promise<void>;
}

export interface AdapterCapabilitiesResponse {
  adapters: ActivitySourceAdapter[];
  active_adapters: AdapterId[];
  capabilities: AdapterCapabilities;
}

export const emptyCapabilities = (): AdapterCapabilities => ({
  supportsFiles: false,
  supportsOAuth: false,
  supportsWebhooks: false,
  supportsSegments: false,
  supportsSync: false,
  supportsPhotos: false,
});
