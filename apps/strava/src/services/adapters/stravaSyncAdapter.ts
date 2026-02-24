import StravaCollector from '../collector';
import type { AdapterSyncBackfillSegmentsResult, AdapterSyncClient } from './types';

export const createStravaSyncAdapterClient = (): AdapterSyncClient => {
  const collector = new StravaCollector();

  return {
    syncRecentActivities: (days, includeStreams, includeSegments) =>
      collector.syncRecentActivities(days, includeStreams, includeSegments),
    backfillStreams: (limit) =>
      collector.backfillStreams(limit),
    backfillSegments: (limit): Promise<AdapterSyncBackfillSegmentsResult> =>
      collector.backfillSegments(limit),
    syncPhotos: (limit) =>
      collector.syncPhotos(limit),
    downloadPhotos: (limit) =>
      collector.downloadPhotos(limit),
    syncInitialActivities: (days, includeStreams, includeSegments) =>
      collector.syncInitialActivities(days, includeStreams, includeSegments),
    close: () => collector.close(),
  };
};
