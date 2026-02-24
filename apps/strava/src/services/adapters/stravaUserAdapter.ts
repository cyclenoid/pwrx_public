import {
  createUserProfile,
  deleteUserProfile,
  getAllUserProfiles,
  getDefaultUserProfile,
  getUserProfile,
  getUserSettings,
  setActiveUser,
  updateUserProfile,
  updateUserSetting,
} from '../userProfileService';
import StravaAPIService from '../stravaAPI';
import type {
  AdapterCreateUserProfileInput,
  AdapterUserClient,
  AdapterUserProfile,
} from './types';
import type { UserProfile } from '../userProfileService';

const normalizeSettings = (settings: Record<string, unknown>): Record<string, string> => {
  const entries = Object.entries(settings).map(([key, value]) => [key, String(value ?? '')]);
  return Object.fromEntries(entries);
};

export const createStravaUserAdapterClient = (): AdapterUserClient => ({
  getUserProfile: async (userId) => (await getUserProfile(userId)) as AdapterUserProfile | null,
  getDefaultUserProfile: async () => (await getDefaultUserProfile()) as AdapterUserProfile | null,
  getAllUserProfiles: async () => (await getAllUserProfiles()) as AdapterUserProfile[],
  updateUserProfile: async (userId, updates) => (
    await updateUserProfile(
      userId,
      updates as Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at' | 'settings'>>
    )
  ) as AdapterUserProfile | null,
  refreshUserProfileFromProvider: async (userId, fallbackRefreshToken) => {
    const profile = await getUserProfile(userId);
    if (!profile) return null;

    const refreshToken = profile.strava_refresh_token || fallbackRefreshToken || process.env.STRAVA_REFRESH_TOKEN;
    if (!refreshToken) return profile as AdapterUserProfile;

    const strava = new StravaAPIService({ refreshToken });
    const athlete = await strava.getAthlete();

    const updatedProfile = await updateUserProfile(userId, {
      strava_athlete_id: athlete.id,
      username: athlete.username || profile.username,
      firstname: athlete.firstname || profile.firstname,
      lastname: athlete.lastname || profile.lastname,
      city: athlete.city || profile.city,
      country: athlete.country || profile.country,
      profile_photo: athlete.profile || athlete.profile_medium || profile.profile_photo,
    });

    return (updatedProfile || profile) as AdapterUserProfile;
  },
  updateUserSetting: async (userId, key, value) => {
    await updateUserSetting(userId, key, value);
  },
  getUserSettings: async (userId) => {
    const settings = await getUserSettings(userId);
    return normalizeSettings(settings as Record<string, unknown>);
  },
  createUserProfile: async (data: AdapterCreateUserProfileInput) => (
    await createUserProfile(data)
  ) as AdapterUserProfile,
  deleteUserProfile: async (userId) => deleteUserProfile(userId),
  setActiveUser: async (userId) => {
    await setActiveUser(userId);
  },
  getRefreshToken: async (userId) => {
    const profile = await getUserProfile(userId);
    return profile?.strava_refresh_token || null;
  },
});
