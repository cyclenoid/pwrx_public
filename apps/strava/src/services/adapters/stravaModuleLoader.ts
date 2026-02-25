import type express from 'express';
import type { AdapterSyncClient, AdapterUserClient } from './types';

type AnyFactory = (...args: any[]) => any;

export type CreateStravaRoutes = (options?: { onDataChanged?: () => void }) => express.Router;

const rawStravaModulePath = process.env.ADAPTER_STRAVA_MODULE;
const stravaModulePath = typeof rawStravaModulePath === 'string' ? rawStravaModulePath.trim() : '';
let externalModuleChecked = false;
let externalModuleValue: any | null = null;

const getExternalModule = (): any | null => {
  if (externalModuleChecked) return externalModuleValue;
  externalModuleChecked = true;

  if (!stravaModulePath) {
    externalModuleValue = null;
    return externalModuleValue;
  }

  try {
    externalModuleValue = require(stravaModulePath);
    if (stravaModulePath) {
      console.log(`Loaded Strava adapter module: ${stravaModulePath}`);
    }
  } catch (error: any) {
    if (stravaModulePath) {
      console.warn(
        `Failed to load ADAPTER_STRAVA_MODULE="${stravaModulePath}": ${error?.message || error}`
      );
    }
    externalModuleValue = null;
  }

  return externalModuleValue;
};

const resolveFactory = <T extends AnyFactory>(
  moduleExports: any,
  exportNames: string[],
  label: string
): T | undefined => {
  if (!moduleExports) return undefined;

  for (const name of exportNames) {
    const candidate = moduleExports?.[name] ?? moduleExports?.default?.[name];
    if (typeof candidate === 'function') {
      return candidate as T;
    }
  }

  if (typeof moduleExports?.default === 'function' && exportNames.includes('default')) {
    return moduleExports.default as T;
  }

  return undefined;
};

const loadLocalFactory = <T extends AnyFactory>(
  localModulePath: string,
  exportNames: string[],
  label: string
): T | undefined => {
  try {
    const moduleExports = require(localModulePath);
    const factory = resolveFactory<T>(moduleExports, exportNames, label);
    if (factory) return factory;
    console.warn(`${label} module loaded but no matching factory export was found.`);
    return undefined;
  } catch (error: any) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      console.warn(`Failed to load optional ${label} module:`, error?.message || error);
    }
    return undefined;
  }
};

export const loadStravaSyncClientFactory = (): (() => AdapterSyncClient) | undefined => {
  const externalModule = getExternalModule();
  const externalFactory = resolveFactory<() => AdapterSyncClient>(
    externalModule,
    ['createStravaSyncAdapterClient', 'createSyncClient'],
    'Strava sync adapter'
  );
  if (externalFactory) return externalFactory;
  return loadLocalFactory<() => AdapterSyncClient>(
    './stravaSyncAdapter',
    ['createStravaSyncAdapterClient', 'default'],
    'Strava sync adapter'
  );
};

export const loadStravaUserClientFactory = (): (() => AdapterUserClient) | undefined => {
  const externalModule = getExternalModule();
  const externalFactory = resolveFactory<() => AdapterUserClient>(
    externalModule,
    ['createStravaUserAdapterClient', 'createUserClient'],
    'Strava user adapter'
  );
  if (externalFactory) return externalFactory;
  return loadLocalFactory<() => AdapterUserClient>(
    './stravaUserAdapter',
    ['createStravaUserAdapterClient', 'default'],
    'Strava user adapter'
  );
};

export const loadStravaRoutesFactory = (): CreateStravaRoutes | undefined => {
  const externalModule = getExternalModule();
  const externalFactory = resolveFactory<CreateStravaRoutes>(
    externalModule,
    ['createStravaRoutes', 'createRoutes', 'default'],
    'Strava routes'
  );
  if (externalFactory) return externalFactory;
  return loadLocalFactory<CreateStravaRoutes>(
    '../../api/stravaRoutes',
    ['default'],
    'Strava routes'
  );
};
