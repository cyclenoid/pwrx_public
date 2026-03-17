import DatabaseService from '../database';
import { loadSyncSettings } from '../syncSettings';
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

export const privateStravaHost = {
  DatabaseService,
  loadSyncSettings,
  userProfiles: {
    getUserProfile,
    getDefaultUserProfile,
    getAllUserProfiles,
    updateUserProfile,
    updateUserSetting,
    getUserSettings,
    createUserProfile,
    deleteUserProfile,
    setActiveUser,
  },
};

export type PrivateStravaHost = typeof privateStravaHost;
