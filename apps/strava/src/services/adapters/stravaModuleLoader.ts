import type express from 'express';
import type { AdapterCapabilities, AdapterSyncClient, AdapterUserClient } from './types';

type AnyFactory = (...args: any[]) => any;

export type CreateStravaRoutes = (options?: { onDataChanged?: () => void }) => express.Router;

const defaultStravaModulePath = '@your-org/pwrx-adapter-strava';
const stravaModulePath = String(process.env.ADAPTER_STRAVA_MODULE || defaultStravaModulePath).trim();
let externalModuleChecked = false;
let externalModuleValue: any | null = null;
let missingFactoryWarnings = new Set<string>();

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

const warnMissingFactory = (label: string): void => {
  if (missingFactoryWarnings.has(label)) return;
  missingFactoryWarnings.add(label);
  if (!stravaModulePath) {
    console.warn(`${label} unavailable: ADAPTER_STRAVA_MODULE is empty.`);
    return;
  }
  console.warn(
    `${label} unavailable in public-core mode. Install the private adapter package and ensure ADAPTER_STRAVA_MODULE="${stravaModulePath}" can be resolved.`
  );
};

export const loadStravaSyncClientFactory = (): (() => AdapterSyncClient) | undefined => {
  const externalModule = getExternalModule();
  const externalFactory = resolveFactory<() => AdapterSyncClient>(
    externalModule,
    ['createStravaSyncAdapterClient', 'createSyncClient'],
    'Strava sync adapter'
  );
  if (externalFactory) return externalFactory;
  warnMissingFactory('Strava sync adapter');
  return undefined;
};

export const loadStravaUserClientFactory = (): (() => AdapterUserClient) | undefined => {
  const externalModule = getExternalModule();
  const externalFactory = resolveFactory<() => AdapterUserClient>(
    externalModule,
    ['createStravaUserAdapterClient', 'createUserClient'],
    'Strava user adapter'
  );
  if (externalFactory) return externalFactory;
  warnMissingFactory('Strava user adapter');
  return undefined;
};

export const loadStravaRoutesFactory = (): CreateStravaRoutes | undefined => {
  const externalModule = getExternalModule();
  const externalFactory = resolveFactory<CreateStravaRoutes>(
    externalModule,
    ['createStravaRoutes', 'createRoutes', 'default'],
    'Strava routes'
  );
  if (externalFactory) return externalFactory;
  warnMissingFactory('Strava routes');
  return undefined;
};

export const loadStravaCapabilityOverrides = (): Partial<AdapterCapabilities> | undefined => {
  const externalModule = getExternalModule();
  const capabilityResponse =
    externalModule?.adapterRegistry?.getCapabilities?.() ??
    externalModule?.default?.adapterRegistry?.getCapabilities?.();

  if (!capabilityResponse || typeof capabilityResponse !== 'object') {
    return undefined;
  }

  const capabilities = capabilityResponse.capabilities;
  if (!capabilities || typeof capabilities !== 'object') {
    return undefined;
  }

  return capabilities as Partial<AdapterCapabilities>;
};
