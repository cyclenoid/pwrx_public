import {
  ActivitySourceAdapter,
  AdapterCapabilities,
  AdapterCapabilitiesResponse,
  AdapterId,
  AdapterSyncClient,
  AdapterUserClient,
  emptyCapabilities,
} from './types';
import { loadStravaSyncClientFactory, loadStravaUserClientFactory } from './stravaModuleLoader';

const parseEnabled = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

export class AdapterRegistry {
  private readonly adapters = new Map<AdapterId, ActivitySourceAdapter>();

  registerAdapter(adapter: ActivitySourceAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: AdapterId): ActivitySourceAdapter | undefined {
    return this.adapters.get(id);
  }

  getAdapters(): ActivitySourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  getEnabledAdapters(): ActivitySourceAdapter[] {
    return this.getAdapters().filter((adapter) => adapter.enabled);
  }

  getSyncAdapter(): ActivitySourceAdapter | null {
    const candidate = this.getEnabledAdapters().find(
      (adapter) => adapter.capabilities.supportsSync && typeof adapter.createSyncClient === 'function'
    );
    return candidate || null;
  }

  getOAuthAdapter(): ActivitySourceAdapter | null {
    const candidate = this.getEnabledAdapters().find(
      (adapter) => adapter.capabilities.supportsOAuth && typeof adapter.createUserClient === 'function'
    );
    return candidate || null;
  }

  createSyncClient(): AdapterSyncClient | null {
    const adapter = this.getSyncAdapter();
    if (!adapter?.createSyncClient) return null;
    return adapter.createSyncClient();
  }

  createUserClient(): AdapterUserClient | null {
    const adapter = this.getOAuthAdapter();
    if (!adapter?.createUserClient) return null;
    return adapter.createUserClient();
  }

  getCapabilities(): AdapterCapabilitiesResponse {
    const enabled = this.getEnabledAdapters();
    const merged = enabled.reduce<AdapterCapabilities>((acc, adapter) => {
      acc.supportsFiles = acc.supportsFiles || adapter.capabilities.supportsFiles;
      acc.supportsOAuth = acc.supportsOAuth || adapter.capabilities.supportsOAuth;
      acc.supportsWebhooks = acc.supportsWebhooks || adapter.capabilities.supportsWebhooks;
      acc.supportsSegments = acc.supportsSegments || adapter.capabilities.supportsSegments;
      acc.supportsSync = acc.supportsSync || adapter.capabilities.supportsSync;
      acc.supportsPhotos = acc.supportsPhotos || adapter.capabilities.supportsPhotos;
      return acc;
    }, emptyCapabilities());

    return {
      adapters: this.getAdapters(),
      active_adapters: enabled.map((adapter) => adapter.id),
      capabilities: merged,
    };
  }
}

const buildDefaultRegistry = (): AdapterRegistry => {
  const registry = new AdapterRegistry();

  registry.registerAdapter({
    id: 'file',
    name: 'File Import',
    enabled: parseEnabled(process.env.ADAPTER_FILE_ENABLED, true),
    capabilities: {
      supportsFiles: true,
      supportsOAuth: false,
      supportsWebhooks: false,
      supportsSegments: true,
      supportsSync: false,
      supportsPhotos: false,
    },
  });

  const stravaRequested = parseEnabled(process.env.ADAPTER_STRAVA_ENABLED, true);
  const stravaSyncFactory = stravaRequested ? loadStravaSyncClientFactory() : undefined;
  const stravaUserFactory = stravaRequested ? loadStravaUserClientFactory() : undefined;
  const supportsSync = typeof stravaSyncFactory === 'function';
  const supportsOAuth = typeof stravaUserFactory === 'function';
  const stravaEnabled = stravaRequested && (supportsSync || supportsOAuth);
  if (stravaRequested && !supportsSync && !supportsOAuth) {
    console.warn('ADAPTER_STRAVA_ENABLED is true, but Strava adapter modules are not available. Strava features stay disabled.');
  }

  registry.registerAdapter({
    id: 'strava',
    name: 'Strava',
    enabled: stravaEnabled,
    createSyncClient: stravaSyncFactory,
    createUserClient: stravaUserFactory,
    capabilities: {
      supportsFiles: false,
      supportsOAuth: stravaEnabled && supportsOAuth,
      supportsWebhooks: false,
      supportsSegments: stravaEnabled && supportsSync,
      supportsSync: stravaEnabled && supportsSync,
      supportsPhotos: stravaEnabled && supportsSync,
    },
  });

  return registry;
};

export const adapterRegistry = buildDefaultRegistry();
