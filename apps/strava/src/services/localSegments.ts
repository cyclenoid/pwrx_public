import { createHash } from 'crypto';
import axios from 'axios';
import DatabaseService from './database';
import type { ParsedStreams } from './import/types';
import { haversineMeters } from './import/parsers/utils';

export interface AutoClimbDetectionOptions {
  minDistanceM?: number;
  minElevationGainM?: number;
  minAvgGradePct?: number;
  maxFlatDistanceM?: number;
  maxDescentM?: number;
  maxDistanceM?: number;
  maxElapsedTimeSec?: number;
}

export interface DetectedLocalClimb {
  startIndex: number;
  endIndex: number;
  distanceM: number;
  elevationGainM: number;
  avgGradePct: number;
  elapsedTimeSec: number;
  startTimeSec: number;
  endTimeSec: number;
  startLatLng: [number, number] | null;
  endLatLng: [number, number] | null;
  localFingerprint: string;
  name: string;
  climbCategory: number | null;
}

export interface RebuildLocalClimbsResult {
  activityId: number;
  processed: boolean;
  detected: number;
  persisted: number;
  message: string;
}

export interface LocalClimbBackfillResult {
  matchedActivities: number;
  processedActivities: number;
  activitiesWithClimbs: number;
  detectedClimbs: number;
  persistedClimbs: number;
  errors: Array<{ activityId: number; message: string }>;
}

export interface LocalClimbBackfillOptions extends AutoClimbDetectionOptions {
  includeStrava?: boolean;
  includeImported?: boolean;
  includeRide?: boolean;
  includeRun?: boolean;
  offset?: number;
}

export interface CreateManualLocalSegmentInput {
  activityId: number;
  startIndex: number;
  endIndex: number;
  name?: string;
  matchingRadiusM?: number;
}

export interface CreateManualLocalSegmentResult {
  activityId: number;
  segmentId: number;
  created: boolean;
  name: string;
  matchedActivities: number;
  persistedEfforts: number;
}

export interface LocalSegmentNamingOptions {
  reverseGeocodeEnabled?: boolean;
  reverseGeocodeUrl?: string;
  reverseGeocodeTimeoutMs?: number;
  reverseGeocodeLanguage?: string;
  reverseGeocodeUserAgent?: string;
  preferVirtualActivityName?: boolean;
}

export interface RenameLocalSegmentsOptions {
  includeManual?: boolean;
  renameManualNames?: boolean;
  offset?: number;
}

export interface RenameLocalSegmentsResult {
  matchedSegments: number;
  processedSegments: number;
  renamedSegments: number;
  skippedSegments: number;
  errors: Array<{ segmentId: number; message: string }>;
}

const DEFAULT_DETECTION_OPTIONS: Required<AutoClimbDetectionOptions> = {
  minDistanceM: 600,
  minElevationGainM: 35,
  minAvgGradePct: 3,
  maxFlatDistanceM: 180,
  maxDescentM: 14,
  maxDistanceM: 18000,
  maxElapsedTimeSec: 7200,
};

// Allow broad mountain-like climbs with substantial elevation gain even when
// average grade stays below the strict default threshold.
const LONG_CLIMB_RELAXED_GRADE_RULE = {
  minDistanceM: 10000,
  minElevationGainM: 300,
  minAvgGradePct: 1.8,
};

const DEFAULT_MANUAL_MATCHING_RADIUS_M = 35;
const readEnvWithLegacy = (
  primaryKey: string,
  legacyKey: string,
  fallback: string
): string => {
  const primary = String(process.env[primaryKey] ?? '').trim();
  if (primary) return primary;
  const legacy = String(process.env[legacyKey] ?? '').trim();
  if (legacy) return legacy;
  return fallback;
};

const DEFAULT_NAMING_OPTIONS: Required<LocalSegmentNamingOptions> = {
  reverseGeocodeEnabled: ['1', 'true', 'yes', 'on']
    .includes(readEnvWithLegacy('LOCAL_SEGMENTS_REVERSE_GEOCODE_ENABLED', 'LOCAL_CLIMBS_REVERSE_GEOCODE_ENABLED', 'false').toLowerCase()),
  reverseGeocodeUrl: readEnvWithLegacy(
    'LOCAL_SEGMENTS_REVERSE_GEOCODE_URL',
    'LOCAL_CLIMBS_REVERSE_GEOCODE_URL',
    'https://nominatim.openstreetmap.org/reverse'
  ),
  reverseGeocodeTimeoutMs: (() => {
    const parsed = Number(
      readEnvWithLegacy(
        'LOCAL_SEGMENTS_REVERSE_GEOCODE_TIMEOUT_MS',
        'LOCAL_CLIMBS_REVERSE_GEOCODE_TIMEOUT_MS',
        '2200'
      )
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2200;
  })(),
  reverseGeocodeLanguage: readEnvWithLegacy(
    'LOCAL_SEGMENTS_REVERSE_GEOCODE_LANGUAGE',
    'LOCAL_CLIMBS_REVERSE_GEOCODE_LANGUAGE',
    'de,en'
  ),
  reverseGeocodeUserAgent: readEnvWithLegacy(
    'LOCAL_SEGMENTS_REVERSE_GEOCODE_USER_AGENT',
    'LOCAL_CLIMBS_REVERSE_GEOCODE_USER_AGENT',
    'PWRX/1.0 (local-segments)'
  ),
  preferVirtualActivityName: ['1', 'true', 'yes', 'on']
    .includes(readEnvWithLegacy('LOCAL_SEGMENTS_VIRTUAL_NAME_PREFERRED', 'LOCAL_CLIMBS_VIRTUAL_NAME_PREFERRED', 'true').toLowerCase()),
};
const reverseGeocodeCache = new Map<string, string | null>();

const RIDE_ACTIVITY_TYPES = [
  'Ride',
  'VirtualRide',
  'EBikeRide',
  'MountainBikeRide',
  'GravelRide',
  'Workout',
];

const RUN_ACTIVITY_TYPES = [
  'Run',
  'TrailRun',
  'VirtualRun',
  'Walk',
  'Hike',
  'Workout',
];

const buildAllowedActivityTypes = (includeRide: boolean, includeRun: boolean): string[] => {
  const types = new Set<string>();
  if (includeRide) {
    for (const type of RIDE_ACTIVITY_TYPES) types.add(type);
  }
  if (includeRun) {
    for (const type of RUN_ACTIVITY_TYPES) types.add(type);
  }
  return Array.from(types);
};

const getActivityTypeFamily = (activityType: string): string[] => {
  if (RIDE_ACTIVITY_TYPES.includes(activityType)) return [...RIDE_ACTIVITY_TYPES];
  if (RUN_ACTIVITY_TYPES.includes(activityType)) return [...RUN_ACTIVITY_TYPES];
  return [activityType || 'Ride'];
};

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const positiveOrDefault = (value: unknown, fallback: number): number => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
};

const resolveDetectionOptions = (
  options?: AutoClimbDetectionOptions
): Required<AutoClimbDetectionOptions> => ({
  minDistanceM: positiveOrDefault(options?.minDistanceM, DEFAULT_DETECTION_OPTIONS.minDistanceM),
  minElevationGainM: positiveOrDefault(options?.minElevationGainM, DEFAULT_DETECTION_OPTIONS.minElevationGainM),
  minAvgGradePct: positiveOrDefault(options?.minAvgGradePct, DEFAULT_DETECTION_OPTIONS.minAvgGradePct),
  maxFlatDistanceM: positiveOrDefault(options?.maxFlatDistanceM, DEFAULT_DETECTION_OPTIONS.maxFlatDistanceM),
  maxDescentM: positiveOrDefault(options?.maxDescentM, DEFAULT_DETECTION_OPTIONS.maxDescentM),
  maxDistanceM: positiveOrDefault(options?.maxDistanceM, DEFAULT_DETECTION_OPTIONS.maxDistanceM),
  maxElapsedTimeSec: positiveOrDefault(options?.maxElapsedTimeSec, DEFAULT_DETECTION_OPTIONS.maxElapsedTimeSec),
});

const resolveNamingOptions = (
  options?: LocalSegmentNamingOptions
): Required<LocalSegmentNamingOptions> => ({
  reverseGeocodeEnabled: options?.reverseGeocodeEnabled ?? DEFAULT_NAMING_OPTIONS.reverseGeocodeEnabled,
  reverseGeocodeUrl: String(options?.reverseGeocodeUrl || DEFAULT_NAMING_OPTIONS.reverseGeocodeUrl).trim(),
  reverseGeocodeTimeoutMs: positiveOrDefault(
    options?.reverseGeocodeTimeoutMs,
    DEFAULT_NAMING_OPTIONS.reverseGeocodeTimeoutMs
  ),
  reverseGeocodeLanguage: String(options?.reverseGeocodeLanguage || DEFAULT_NAMING_OPTIONS.reverseGeocodeLanguage).trim(),
  reverseGeocodeUserAgent: String(options?.reverseGeocodeUserAgent || DEFAULT_NAMING_OPTIONS.reverseGeocodeUserAgent).trim(),
  preferVirtualActivityName: options?.preferVirtualActivityName ?? DEFAULT_NAMING_OPTIONS.preferVirtualActivityName,
});

const classifyClimbCategory = (
  distanceM: number,
  elevationGainM: number,
  avgGradePct: number
): number | null => {
  if (distanceM < 400 || elevationGainM < 20 || avgGradePct < 2) return null;
  const score = (distanceM / 1000) * avgGradePct;

  if (score >= 80 || elevationGainM >= 900) return 0; // HC
  if (score >= 45 || elevationGainM >= 600) return 1;
  if (score >= 28 || elevationGainM >= 350) return 2;
  if (score >= 16 || elevationGainM >= 200) return 3;
  if (score >= 8 || elevationGainM >= 90) return 4;
  if (score >= 4 || elevationGainM >= 45) return 5;
  return 6; // easier than classic TdF categories
};

const formatCategoryLabel = (category: number | null): string => {
  if (category === null || category === undefined) return '';
  if (category <= 0) return 'HC';
  return `Cat ${category}`;
};

const normalizeLocationLabel = (value: string): string => {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const parts = compact.split(',').map((part) => part.trim()).filter(Boolean);
  const limited = parts.slice(0, 2).join(', ');
  return limited.length > 54 ? `${limited.slice(0, 51)}...` : limited;
};

const isVirtualActivityType = (activityType: string | null | undefined): boolean => {
  const normalized = String(activityType || '').trim().toLowerCase();
  return normalized.startsWith('virtual');
};

const deriveVirtualLocationLabel = (activityName: string | null | undefined): string | null => {
  const raw = String(activityName || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  // Example: "Zwift - Pacer Group Ride: Petit Boucle in France with Maria"
  let label = raw
    .replace(/^(zwift|rouvy|mywhoosh)\s*-\s*/i, '')
    .trim();
  if (label.includes(':')) {
    const parts = label.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) label = parts[parts.length - 1];
  }

  label = label
    .replace(/\s+(with|mit)\s+.+$/i, '')
    .replace(/\s+\(.*\)\s*$/, '')
    .trim();

  const normalized = normalizeLocationLabel(label);
  if (!normalized || normalized.length < 3) return null;
  return normalized;
};

const getMidpointLatLng = (
  startLatLng: [number, number] | null,
  endLatLng: [number, number] | null
): [number, number] | null => {
  if (!startLatLng && !endLatLng) return null;
  if (startLatLng && endLatLng) {
    return [
      (startLatLng[0] + endLatLng[0]) / 2,
      (startLatLng[1] + endLatLng[1]) / 2,
    ];
  }
  return startLatLng || endLatLng;
};

const resolveLocationLabel = async (
  latLng: [number, number] | null,
  options?: LocalSegmentNamingOptions
): Promise<string | null> => {
  const cfg = resolveNamingOptions(options);
  if (!cfg.reverseGeocodeEnabled || !latLng) return null;
  const cacheKey = [
    cfg.reverseGeocodeUrl,
    cfg.reverseGeocodeLanguage,
    latLng[0].toFixed(4),
    latLng[1].toFixed(4),
  ].join('|');
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey) || null;
  }

  try {
    const response = await axios.get(cfg.reverseGeocodeUrl, {
      params: {
        format: 'jsonv2',
        addressdetails: 1,
        zoom: 14,
        lat: latLng[0],
        lon: latLng[1],
      },
      timeout: cfg.reverseGeocodeTimeoutMs,
      headers: {
        'User-Agent': cfg.reverseGeocodeUserAgent,
        'Accept-Language': cfg.reverseGeocodeLanguage,
      },
    });

    const payload = response.data || {};
    const address = payload.address || {};
    const road = address.road
      || address.cycleway
      || address.pedestrian
      || address.path
      || address.footway
      || null;
    const place = address.city
      || address.town
      || address.village
      || address.hamlet
      || address.municipality
      || address.county
      || address.state
      || null;
    const rawLabel = road && place
      ? `${road}, ${place}`
      : (road || place || payload.name || null);
    const normalized = rawLabel ? normalizeLocationLabel(String(rawLabel)) : '';
    const label = normalized || null;
    reverseGeocodeCache.set(cacheKey, label);
    return label;
  } catch {
    reverseGeocodeCache.set(cacheKey, null);
    return null;
  }
};

const buildDistanceFromLatLng = (
  latlng: Array<[number, number]> | undefined,
  length: number
): number[] | null => {
  if (!latlng || latlng.length < length) return null;
  const cumulative: number[] = [];
  let total = 0;
  cumulative.push(0);

  for (let i = 1; i < length; i += 1) {
    const prev = latlng[i - 1];
    const curr = latlng[i];
    if (!prev || !curr) {
      cumulative.push(total);
      continue;
    }
    const step = haversineMeters(prev[0], prev[1], curr[0], curr[1]);
    total += Number.isFinite(step) && step > 0 ? step : 0;
    cumulative.push(total);
  }

  return cumulative;
};

const buildMonotonicDistance = (
  distanceStream: number[] | undefined,
  fallback: number[] | null,
  length: number
): number[] => {
  const result: number[] = [];
  let last = 0;

  for (let i = 0; i < length; i += 1) {
    const primary = finiteNumber(distanceStream?.[i]);
    const alt = finiteNumber(fallback?.[i]);
    const value = primary ?? alt ?? last;
    last = Math.max(last, value);
    result.push(last);
  }

  return result;
};

const buildSafeSeries = (input: number[] | undefined, length: number): number[] => {
  const series: number[] = [];
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const value = finiteNumber(input?.[i]);
    if (value === null) {
      series.push(last);
      continue;
    }
    last = value;
    series.push(value);
  }
  return series;
};

const buildClimbFingerprint = (
  activityType: string,
  startLatLng: [number, number] | null,
  endLatLng: [number, number] | null,
  startDistanceM: number,
  distanceM: number,
  elevationGainM: number,
  avgGradePct: number
): string => {
  const startGeo = startLatLng
    ? `${startLatLng[0].toFixed(4)},${startLatLng[1].toFixed(4)}`
    : `nogeo:${Math.round(startDistanceM / 100) * 100}`;
  const endGeo = endLatLng
    ? `${endLatLng[0].toFixed(4)},${endLatLng[1].toFixed(4)}`
    : 'nogeo';

  const roundedDistance = Math.round(distanceM / 50) * 50;
  const roundedGain = Math.round(elevationGainM / 5) * 5;
  const roundedGrade = Math.round(avgGradePct * 10) / 10;

  const raw = [
    'local-climb',
    activityType || 'Workout',
    startGeo,
    endGeo,
    roundedDistance,
    roundedGain,
    roundedGrade,
  ].join('|');

  return createHash('sha1').update(raw).digest('hex');
};

const buildClimbName = (
  distanceM: number,
  avgGradePct: number,
  climbCategory: number | null,
  locationLabel?: string | null
): string => {
  const km = (distanceM / 1000).toFixed(1);
  const grade = avgGradePct.toFixed(1);
  const category = formatCategoryLabel(climbCategory);
  const location = locationLabel ? ` ${locationLabel}` : '';
  return category
    ? `Climb ${category}${location} ${km} km @ ${grade}%`
    : `Climb${location} ${km} km @ ${grade}%`;
};

const buildLocalSegmentName = async (input: {
  distanceM: number;
  avgGradePct: number;
  climbCategory: number | null;
  activityType?: string | null;
  activityName?: string | null;
  startLatLng: [number, number] | null;
  endLatLng: [number, number] | null;
  fallbackName?: string;
  preferFallbackIfNoLocation?: boolean;
  namingOptions?: LocalSegmentNamingOptions;
}): Promise<string> => {
  const cfg = resolveNamingOptions(input.namingOptions);
  if (cfg.preferVirtualActivityName && isVirtualActivityType(input.activityType)) {
    const virtualLabel = deriveVirtualLocationLabel(input.activityName);
    if (virtualLabel) {
      return buildClimbName(
        input.distanceM,
        input.avgGradePct,
        input.climbCategory,
        virtualLabel
      );
    }
  }

  const midpoint = getMidpointLatLng(input.startLatLng, input.endLatLng);
  const locationLabel = await resolveLocationLabel(midpoint, cfg);
  const generated = buildClimbName(
    input.distanceM,
    input.avgGradePct,
    input.climbCategory,
    locationLabel
  );
  if (locationLabel) return generated;
  if (input.preferFallbackIfNoLocation && input.fallbackName) return input.fallbackName;
  return generated;
};

const cleanupOrphanLocalSegments = async (db: DatabaseService): Promise<void> => {
  await db.query(
    `
    DELETE FROM strava.segments s
    WHERE s.source = 'local'
      AND NOT EXISTS (
        SELECT 1
        FROM strava.segment_efforts se
        WHERE se.segment_id = s.id
      )
    `
  );
};

export const detectAutoClimbsFromStreams = (
  activityType: string,
  streams: ParsedStreams,
  options?: AutoClimbDetectionOptions
): DetectedLocalClimb[] => {
  const cfg = resolveDetectionOptions(options);
  const altitudeLength = streams.altitude?.length || 0;
  const timeLength = streams.time?.length || 0;
  const baseLength = Math.min(altitudeLength, timeLength);
  if (baseLength < 3) return [];

  const latlng = streams.latlng?.length ? streams.latlng : undefined;
  const latlngDistance = buildDistanceFromLatLng(latlng, baseLength);
  const distance = buildMonotonicDistance(streams.distance, latlngDistance, baseLength);
  const altitude = buildSafeSeries(streams.altitude, baseLength);
  const time = buildSafeSeries(streams.time, baseLength);

  const climbs: DetectedLocalClimb[] = [];
  let candidateStart = -1;
  let candidateGain = 0;
  let candidateDistance = 0;
  let candidateElapsed = 0;
  let flatOrDownDistance = 0;
  let peakAltitude = 0;
  let dropFromPeak = 0;

  const pushCandidate = (endIndex: number) => {
    if (candidateStart < 0 || endIndex <= candidateStart) return;

    const distanceM = Math.max(0, distance[endIndex] - distance[candidateStart]);
    const elevationGainM = Math.max(0, candidateGain);
    const elapsedTimeSec = Math.max(0, time[endIndex] - time[candidateStart]);
    const avgGradePct = distanceM > 0 ? (elevationGainM / distanceM) * 100 : 0;
    const climbCategory = classifyClimbCategory(distanceM, elevationGainM, avgGradePct);

    if (distanceM < cfg.minDistanceM) return;
    if (elevationGainM < cfg.minElevationGainM) return;
    const meetsGradeThreshold = avgGradePct >= cfg.minAvgGradePct;
    const meetsLongClimbRelaxedGrade =
      distanceM >= LONG_CLIMB_RELAXED_GRADE_RULE.minDistanceM
      && elevationGainM >= LONG_CLIMB_RELAXED_GRADE_RULE.minElevationGainM
      && avgGradePct >= LONG_CLIMB_RELAXED_GRADE_RULE.minAvgGradePct;
    if (!meetsGradeThreshold && !meetsLongClimbRelaxedGrade) return;
    if (distanceM > cfg.maxDistanceM) return;
    if (elapsedTimeSec > cfg.maxElapsedTimeSec) return;

    const startLatLng = latlng?.[candidateStart] || null;
    const endLatLng = latlng?.[endIndex] || null;
    const localFingerprint = buildClimbFingerprint(
      activityType,
      startLatLng,
      endLatLng,
      distance[candidateStart],
      distanceM,
      elevationGainM,
      avgGradePct
    );

    climbs.push({
      startIndex: candidateStart,
      endIndex,
      distanceM,
      elevationGainM,
      avgGradePct,
      elapsedTimeSec,
      startTimeSec: time[candidateStart],
      endTimeSec: time[endIndex],
      startLatLng,
      endLatLng,
      localFingerprint,
      name: buildClimbName(distanceM, avgGradePct, climbCategory),
      climbCategory,
    });
  };

  for (let i = 1; i < baseLength; i += 1) {
    const stepDistance = Math.max(0, distance[i] - distance[i - 1]);
    const stepAltitude = altitude[i] - altitude[i - 1];
    const stepTime = Math.max(0, time[i] - time[i - 1]);

    if (stepDistance <= 0) continue;

    const uphillStep = stepAltitude > 0.8;

    if (candidateStart < 0) {
      if (!uphillStep) continue;
      candidateStart = i - 1;
      candidateGain = Math.max(0, stepAltitude);
      candidateDistance = stepDistance;
      candidateElapsed = stepTime;
      peakAltitude = Math.max(altitude[i - 1], altitude[i]);
      dropFromPeak = 0;
      flatOrDownDistance = stepAltitude > 0.3 ? 0 : stepDistance;
      continue;
    }

    candidateDistance += stepDistance;
    candidateElapsed += stepTime;
    if (stepAltitude > 0) {
      candidateGain += stepAltitude;
    }

    if (altitude[i] > peakAltitude) peakAltitude = altitude[i];
    dropFromPeak = Math.max(dropFromPeak, peakAltitude - altitude[i]);
    if (stepAltitude > 0.3) {
      flatOrDownDistance = 0;
    } else {
      flatOrDownDistance += stepDistance;
    }

    const shouldClose = flatOrDownDistance >= cfg.maxFlatDistanceM
      || dropFromPeak >= cfg.maxDescentM
      || candidateDistance >= cfg.maxDistanceM
      || candidateElapsed >= cfg.maxElapsedTimeSec;
    if (!shouldClose) continue;

    pushCandidate(i - 1);
    candidateStart = -1;
    candidateGain = 0;
    candidateDistance = 0;
    candidateElapsed = 0;
    peakAltitude = 0;
    dropFromPeak = 0;
    flatOrDownDistance = 0;

    if (uphillStep) {
      candidateStart = i - 1;
      candidateGain = Math.max(0, stepAltitude);
      candidateDistance = stepDistance;
      candidateElapsed = stepTime;
      peakAltitude = Math.max(altitude[i - 1], altitude[i]);
      dropFromPeak = 0;
      flatOrDownDistance = 0;
    }
  }

  if (candidateStart >= 0) {
    pushCandidate(baseLength - 1);
  }

  return climbs;
};

const upsertLocalEffort = async (
  db: DatabaseService,
  input: {
    effortId: number;
    segmentId: number;
    activityId: number;
    userId: number | null;
    effortName: string;
    startDate: Date;
    elapsedTimeSec: number;
    movingTimeSec: number;
    distanceM: number;
    startIndex: number;
    endIndex: number;
  }
): Promise<void> => {
  await db.query(
    `
    INSERT INTO strava.segment_efforts (
      effort_id,
      segment_id,
      activity_id,
      user_id,
      name,
      start_date,
      start_date_local,
      elapsed_time,
      moving_time,
      distance,
      start_index,
      end_index,
      hidden,
      source
    )
    VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, false, 'local')
    ON CONFLICT (segment_id, activity_id, start_index, end_index) WHERE source = 'local'
    DO UPDATE SET
      name = EXCLUDED.name,
      start_date = EXCLUDED.start_date,
      start_date_local = EXCLUDED.start_date_local,
      elapsed_time = EXCLUDED.elapsed_time,
      moving_time = EXCLUDED.moving_time,
      distance = EXCLUDED.distance,
      user_id = EXCLUDED.user_id,
      hidden = EXCLUDED.hidden,
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      input.effortId,
      input.segmentId,
      input.activityId,
      input.userId,
      input.effortName,
      input.startDate,
      Math.max(1, Math.round(input.elapsedTimeSec)),
      Math.max(1, Math.round(input.movingTimeSec)),
      Math.max(0, input.distanceM),
      input.startIndex,
      input.endIndex,
    ]
  );
};

const ensureLocalSegment = async (
  db: DatabaseService,
  climb: DetectedLocalClimb,
  activityType: string,
  activityName: string | null | undefined,
  namingOptions?: LocalSegmentNamingOptions
): Promise<{ segmentId: number; segmentName: string }> => {
  const existing = await db.getSegmentByLocalFingerprint(climb.localFingerprint);
  if (existing?.id) {
    return {
      segmentId: Number(existing.id),
      segmentName: String(existing.name || climb.name),
    };
  }

  const segmentId = await db.getNextLocalSegmentId();
  const segmentName = await buildLocalSegmentName({
    distanceM: climb.distanceM,
    avgGradePct: climb.avgGradePct,
    climbCategory: climb.climbCategory,
    activityType,
    activityName,
    startLatLng: climb.startLatLng,
    endLatLng: climb.endLatLng,
    fallbackName: climb.name,
    preferFallbackIfNoLocation: true,
    namingOptions,
  });
  await db.upsertSegment({
    id: segmentId,
    name: segmentName,
    activity_type: activityType || 'Ride',
    distance: climb.distanceM,
    average_grade: climb.avgGradePct,
    maximum_grade: climb.avgGradePct,
    elevation_high: climb.elevationGainM,
    elevation_low: 0,
    start_latlng: climb.startLatLng,
    end_latlng: climb.endLatLng,
    climb_category: climb.climbCategory ?? undefined,
    city: undefined,
    state: undefined,
    country: undefined,
    source: 'local',
    local_fingerprint: climb.localFingerprint,
    is_auto_climb: true,
  });

  return { segmentId, segmentName };
};

const getDetectionStreams = (rows: Array<{ stream_type: string; data: any[] }>): ParsedStreams | null => {
  const byType = new Map(rows.map((row) => [row.stream_type, row.data]));
  const time = Array.isArray(byType.get('time')) ? byType.get('time') as number[] : null;
  const altitude = Array.isArray(byType.get('altitude')) ? byType.get('altitude') as number[] : null;
  if (!time || !altitude) return null;

  const streams: ParsedStreams = {
    time,
    altitude,
  };

  const distance = byType.get('distance');
  if (Array.isArray(distance)) streams.distance = distance as number[];

  const latlng = byType.get('latlng');
  if (Array.isArray(latlng)) streams.latlng = latlng as Array<[number, number]>;

  return streams;
};

interface ManualMatchingStreams {
  time: number[];
  distance: number[];
  latlng: Array<[number, number]>;
  altitude?: number[];
}

interface ManualMatchCandidate {
  startIndex: number;
  endIndex: number;
  startTimeSec: number;
  elapsedTimeSec: number;
  distanceM: number;
}

const asLatLngTuple = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lat = finiteNumber(value[0]);
  const lng = finiteNumber(value[1]);
  if (lat === null || lng === null) return null;
  return [lat, lng];
};

const getManualMatchingStreams = (
  rows: Array<{ stream_type: string; data: any[] }>
): ManualMatchingStreams | null => {
  const byType = new Map(rows.map((row) => [row.stream_type, row.data]));
  const timeRaw = byType.get('time');
  const distanceRaw = byType.get('distance');
  const latlngRaw = byType.get('latlng');
  const altitudeRaw = byType.get('altitude');

  if (!Array.isArray(timeRaw) || !Array.isArray(distanceRaw) || !Array.isArray(latlngRaw)) {
    return null;
  }

  const baseLength = Math.min(timeRaw.length, distanceRaw.length, latlngRaw.length);
  if (baseLength < 3) return null;

  const time = buildSafeSeries(timeRaw as number[], baseLength);
  const distance = buildMonotonicDistance(distanceRaw as number[], null, baseLength);
  const latlng: Array<[number, number]> = [];
  for (let i = 0; i < baseLength; i += 1) {
    const parsed = asLatLngTuple(latlngRaw[i]);
    if (!parsed) return null;
    latlng.push(parsed);
  }

  const streams: ManualMatchingStreams = { time, distance, latlng };
  if (Array.isArray(altitudeRaw)) {
    streams.altitude = buildSafeSeries(altitudeRaw as number[], baseLength);
  }
  return streams;
};

const computeElevationGainBetween = (
  altitude: number[] | undefined,
  startIndex: number,
  endIndex: number
): number | null => {
  if (!altitude || altitude.length < 2) return null;
  const upper = Math.min(endIndex, altitude.length - 1);
  let gain = 0;
  for (let i = Math.max(startIndex + 1, 1); i <= upper; i += 1) {
    const diff = altitude[i] - altitude[i - 1];
    if (diff > 0) gain += diff;
  }
  return gain;
};

const toRad = (value: number): number => value * (Math.PI / 180);
const toDeg = (value: number): number => value * (180 / Math.PI);

const bearingDegrees = (start: [number, number], end: [number, number]): number => {
  const lat1 = toRad(start[0]);
  const lat2 = toRad(end[0]);
  const dLon = toRad(end[1] - start[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = (
    Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  );
  const bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
};

const angularDifference = (a: number, b: number): number => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};

const buildManualSegmentFingerprint = (
  activityType: string,
  startLatLng: [number, number],
  endLatLng: [number, number],
  distanceM: number
): string => {
  const roundedDistance = Math.round(distanceM / 25) * 25;
  const raw = [
    'local-manual',
    activityType || 'Ride',
    `${startLatLng[0].toFixed(5)},${startLatLng[1].toFixed(5)}`,
    `${endLatLng[0].toFixed(5)},${endLatLng[1].toFixed(5)}`,
    roundedDistance,
  ].join('|');
  return createHash('sha1').update(raw).digest('hex');
};

const findManualMatchCandidate = (
  streams: ManualMatchingStreams,
  target: {
    startLatLng: [number, number];
    endLatLng: [number, number];
    distanceM: number;
    bearingDeg: number;
    matchingRadiusM: number;
  }
): ManualMatchCandidate | null => {
  const length = Math.min(streams.time.length, streams.distance.length, streams.latlng.length);
  if (length < 3) return null;

  const minDistance = Math.max(100, target.distanceM * 0.5);
  const maxDistance = Math.max(minDistance + 50, target.distanceM * 1.8);
  const maxBearingDiff = 70;
  let best: { score: number; match: ManualMatchCandidate } | null = null;

  for (let startIndex = 0; startIndex < length - 1; startIndex += 1) {
    const startCoord = streams.latlng[startIndex];
    const startError = haversineMeters(
      target.startLatLng[0],
      target.startLatLng[1],
      startCoord[0],
      startCoord[1]
    );
    if (!Number.isFinite(startError) || startError > target.matchingRadiusM) continue;

    for (let endIndex = startIndex + 1; endIndex < length; endIndex += 1) {
      const segmentDistance = streams.distance[endIndex] - streams.distance[startIndex];
      if (segmentDistance > maxDistance * 1.2) break;
      if (segmentDistance < minDistance) continue;
      if (segmentDistance > maxDistance) continue;

      const endCoord = streams.latlng[endIndex];
      const endError = haversineMeters(
        target.endLatLng[0],
        target.endLatLng[1],
        endCoord[0],
        endCoord[1]
      );
      if (!Number.isFinite(endError) || endError > target.matchingRadiusM) continue;

      const elapsedTimeSec = streams.time[endIndex] - streams.time[startIndex];
      if (!Number.isFinite(elapsedTimeSec) || elapsedTimeSec <= 0) continue;

      const bearing = bearingDegrees(startCoord, endCoord);
      if (angularDifference(target.bearingDeg, bearing) > maxBearingDiff) continue;

      const distanceScore = Math.abs(segmentDistance - target.distanceM) / Math.max(target.distanceM, 1);
      const locationScore = (startError + endError) / Math.max(target.matchingRadiusM, 1);
      const score = distanceScore + (locationScore * 0.1);

      if (!best || score < best.score) {
        best = {
          score,
          match: {
            startIndex,
            endIndex,
            startTimeSec: streams.time[startIndex],
            elapsedTimeSec,
            distanceM: segmentDistance,
          },
        };
      }
    }
  }

  return best?.match || null;
};

export const createManualLocalSegmentFromActivity = async (
  db: DatabaseService,
  input: CreateManualLocalSegmentInput,
  namingOptions?: LocalSegmentNamingOptions
): Promise<CreateManualLocalSegmentResult> => {
  const activityResult = await db.query(
    `
    SELECT strava_activity_id, user_id, type, name, start_date
    FROM strava.activities
    WHERE strava_activity_id = $1
    LIMIT 1
    `,
    [input.activityId]
  );
  if (activityResult.rows.length === 0) {
    throw new Error('Activity not found');
  }

  const activity = activityResult.rows[0];
  const streamsRows = await db.getActivityStreams(input.activityId);
  const baseStreams = getManualMatchingStreams(streamsRows);
  if (!baseStreams) {
    throw new Error('Missing required streams (time + distance + latlng)');
  }

  const baseLength = Math.min(baseStreams.time.length, baseStreams.distance.length, baseStreams.latlng.length);
  const maxIndex = baseLength - 1;
  let startIndex = Math.max(0, Math.min(Math.floor(Number(input.startIndex)), maxIndex));
  let endIndex = Math.max(0, Math.min(Math.floor(Number(input.endIndex)), maxIndex));
  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
    throw new Error('Invalid start or end index');
  }
  if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];
  if (endIndex - startIndex < 1) {
    throw new Error('Segment selection is too short');
  }

  const segmentDistanceM = baseStreams.distance[endIndex] - baseStreams.distance[startIndex];
  if (!Number.isFinite(segmentDistanceM) || segmentDistanceM < 100) {
    throw new Error('Segment distance is too short');
  }

  const elapsedTimeSec = baseStreams.time[endIndex] - baseStreams.time[startIndex];
  if (!Number.isFinite(elapsedTimeSec) || elapsedTimeSec <= 0) {
    throw new Error('Segment elapsed time is invalid');
  }

  const startLatLng = baseStreams.latlng[startIndex];
  const endLatLng = baseStreams.latlng[endIndex];
  const bearingDeg = bearingDegrees(startLatLng, endLatLng);
  const elevationGainM = computeElevationGainBetween(baseStreams.altitude, startIndex, endIndex) ?? 0;
  const avgGradePct = segmentDistanceM > 0 ? (elevationGainM / segmentDistanceM) * 100 : 0;
  const climbCategory = classifyClimbCategory(segmentDistanceM, elevationGainM, avgGradePct);
  const localFingerprint = buildManualSegmentFingerprint(
    activity.type || 'Ride',
    startLatLng,
    endLatLng,
    segmentDistanceM
  );
  const existingSegment = await db.getSegmentByLocalFingerprint(localFingerprint);
  const providedName = String(input.name || '').trim();
  let segmentName = providedName || String(existingSegment?.name || '').trim();
  if (!segmentName) {
    segmentName = (
      await buildLocalSegmentName({
        distanceM: segmentDistanceM,
        avgGradePct,
        climbCategory,
        activityType: activity.type || 'Ride',
        activityName: activity.name || null,
        startLatLng,
        endLatLng,
        namingOptions,
      })
    ).replace(/^Climb /, 'Segment ');
  }

  const segmentId = existingSegment?.id
    ? Number(existingSegment.id)
    : await db.getNextLocalSegmentId();

  await db.upsertSegment({
    id: segmentId,
    name: segmentName,
    activity_type: activity.type || 'Ride',
    distance: segmentDistanceM,
    average_grade: avgGradePct,
    maximum_grade: avgGradePct,
    elevation_high: elevationGainM,
    elevation_low: 0,
    start_latlng: startLatLng,
    end_latlng: endLatLng,
    climb_category: climbCategory ?? undefined,
    source: 'local',
    local_fingerprint: localFingerprint,
    is_auto_climb: false,
  });

  await db.query(
    `
    DELETE FROM strava.segment_efforts
    WHERE segment_id = $1 AND source = 'local'
    `,
    [segmentId]
  );

  const activityTypes = getActivityTypeFamily(activity.type || 'Ride');
  const candidatesResult = await db.query(
    `
    SELECT a.strava_activity_id, a.user_id, a.start_date
    FROM strava.activities a
    WHERE a.type = ANY($1::text[])
      AND EXISTS (
        SELECT 1 FROM strava.activity_streams s
        WHERE s.activity_id = a.strava_activity_id AND s.stream_type = 'time'
      )
      AND EXISTS (
        SELECT 1 FROM strava.activity_streams s
        WHERE s.activity_id = a.strava_activity_id AND s.stream_type = 'distance'
      )
      AND EXISTS (
        SELECT 1 FROM strava.activity_streams s
        WHERE s.activity_id = a.strava_activity_id AND s.stream_type = 'latlng'
      )
    ORDER BY a.start_date DESC
    `,
    [activityTypes]
  );

  const matchingRadiusM = positiveOrDefault(input.matchingRadiusM, DEFAULT_MANUAL_MATCHING_RADIUS_M);

  let matchedActivities = 0;
  let persistedEfforts = 0;
  for (const row of candidatesResult.rows) {
    const activityId = Number(row.strava_activity_id);
    const userId = row.user_id ? Number(row.user_id) : null;
    const startDate = new Date(row.start_date);

    let match: ManualMatchCandidate | null = null;
    if (activityId === input.activityId) {
      match = {
        startIndex,
        endIndex,
        startTimeSec: baseStreams.time[startIndex],
        elapsedTimeSec,
        distanceM: segmentDistanceM,
      };
    } else {
      const activityStreams = await db.getActivityStreams(activityId);
      const matchStreams = getManualMatchingStreams(activityStreams);
      if (!matchStreams) continue;
      match = findManualMatchCandidate(matchStreams, {
        startLatLng,
        endLatLng,
        distanceM: segmentDistanceM,
        bearingDeg,
        matchingRadiusM,
      });
    }

    if (!match) continue;
    matchedActivities += 1;
    const effortId = await db.getNextLocalSegmentEffortId();
    const effortStartDate = new Date(startDate.getTime() + (Math.max(0, match.startTimeSec) * 1000));

    await upsertLocalEffort(db, {
      effortId,
      segmentId,
      activityId,
      userId,
      effortName: segmentName,
      startDate: effortStartDate,
      elapsedTimeSec: match.elapsedTimeSec,
      movingTimeSec: match.elapsedTimeSec,
      distanceM: match.distanceM,
      startIndex: match.startIndex,
      endIndex: match.endIndex,
    });
    persistedEfforts += 1;
  }

  await cleanupOrphanLocalSegments(db);

  return {
    activityId: input.activityId,
    segmentId,
    created: !existingSegment,
    name: segmentName,
    matchedActivities,
    persistedEfforts,
  };
};

const persistLocalClimbsForActivity = async (
  db: DatabaseService,
  activity: {
    activityId: number;
    userId: number | null;
    activityType: string;
    activityName?: string | null;
    startDate: Date;
  },
  climbs: DetectedLocalClimb[],
  namingOptions?: LocalSegmentNamingOptions
): Promise<number> => {
  await db.deleteSegmentEffortsForActivity(activity.activityId, 'local');

  let persisted = 0;
  for (const climb of climbs) {
    const ensuredSegment = await ensureLocalSegment(
      db,
      climb,
      activity.activityType,
      activity.activityName,
      namingOptions
    );
    const effortId = await db.getNextLocalSegmentEffortId();
    const effortStartDate = new Date(activity.startDate.getTime() + (climb.startTimeSec * 1000));

    await upsertLocalEffort(db, {
      effortId,
      segmentId: ensuredSegment.segmentId,
      activityId: activity.activityId,
      userId: activity.userId,
      effortName: ensuredSegment.segmentName,
      startDate: effortStartDate,
      elapsedTimeSec: climb.elapsedTimeSec,
      movingTimeSec: climb.elapsedTimeSec,
      distanceM: climb.distanceM,
      startIndex: climb.startIndex,
      endIndex: climb.endIndex,
    });
    persisted += 1;
  }

  await cleanupOrphanLocalSegments(db);
  return persisted;
};

export const rebuildLocalClimbsForActivity = async (
  db: DatabaseService,
  activityId: number,
  options?: AutoClimbDetectionOptions,
  namingOptions?: LocalSegmentNamingOptions
): Promise<RebuildLocalClimbsResult> => {
  const activityResult = await db.query(
    `
    SELECT strava_activity_id, user_id, type, name, start_date
    FROM strava.activities
    WHERE strava_activity_id = $1
    LIMIT 1
    `,
    [activityId]
  );

  if (activityResult.rows.length === 0) {
    return {
      activityId,
      processed: false,
      detected: 0,
      persisted: 0,
      message: 'Activity not found',
    };
  }

  const activity = activityResult.rows[0];
  const streamsRows = await db.getActivityStreams(activityId);
  const streams = getDetectionStreams(streamsRows);
  if (!streams) {
    await db.deleteSegmentEffortsForActivity(activityId, 'local');
    await cleanupOrphanLocalSegments(db);
    return {
      activityId,
      processed: true,
      detected: 0,
      persisted: 0,
      message: 'Missing required streams (time + altitude)',
    };
  }

  const climbs = detectAutoClimbsFromStreams(activity.type || 'Ride', streams, options);
  const persisted = await persistLocalClimbsForActivity(db, {
    activityId,
    userId: activity.user_id ? Number(activity.user_id) : null,
    activityType: activity.type || 'Ride',
    activityName: activity.name || null,
    startDate: new Date(activity.start_date),
  }, climbs, namingOptions);

  return {
    activityId,
    processed: true,
    detected: climbs.length,
    persisted,
    message: climbs.length > 0
      ? `Detected ${climbs.length} local segments`
      : 'No segments detected for activity',
  };
};

export const backfillLocalClimbs = async (
  db: DatabaseService,
  limit: number = 100,
  options?: LocalClimbBackfillOptions,
  namingOptions?: LocalSegmentNamingOptions
): Promise<LocalClimbBackfillResult> => {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 2000)) : 100;
  const safeOffset = Number.isFinite(options?.offset) ? Math.max(0, Math.floor(Number(options?.offset))) : 0;
  const includeStrava = options?.includeStrava ?? false;
  const includeImported = options?.includeImported ?? true;
  const includeRide = options?.includeRide ?? true;
  const includeRun = options?.includeRun ?? true;
  const allowedTypes = buildAllowedActivityTypes(includeRide, includeRun);

  const summary: LocalClimbBackfillResult = {
    matchedActivities: 0,
    processedActivities: 0,
    activitiesWithClimbs: 0,
    detectedClimbs: 0,
    persistedClimbs: 0,
    errors: [],
  };

  if (!includeStrava && !includeImported) {
    return summary;
  }
  if (allowedTypes.length === 0) {
    return summary;
  }

  const sourceFilters: string[] = [];
  if (includeStrava) {
    sourceFilters.push(`COALESCE(a.source, 'strava') = 'strava'`);
  }
  if (includeImported) {
    sourceFilters.push(`COALESCE(a.source, 'strava') <> 'strava'`);
  }

  const activityResult = await db.query(
    `
    SELECT a.strava_activity_id
    FROM strava.activities a
    WHERE (${sourceFilters.join(' OR ')})
      AND a.type = ANY($1::text[])
      AND EXISTS (
        SELECT 1 FROM strava.activity_streams s
        WHERE s.activity_id = a.strava_activity_id AND s.stream_type = 'time'
      )
      AND EXISTS (
        SELECT 1 FROM strava.activity_streams s
        WHERE s.activity_id = a.strava_activity_id AND s.stream_type = 'altitude'
      )
    ORDER BY a.start_date DESC
    LIMIT $2
    OFFSET $3
    `,
    [allowedTypes, safeLimit, safeOffset]
  );
  summary.matchedActivities = activityResult.rows.length;

  const detectionOptions: AutoClimbDetectionOptions = {
    minDistanceM: options?.minDistanceM,
    minElevationGainM: options?.minElevationGainM,
    minAvgGradePct: options?.minAvgGradePct,
    maxFlatDistanceM: options?.maxFlatDistanceM,
    maxDescentM: options?.maxDescentM,
  };

  for (const row of activityResult.rows) {
    const activityId = Number(row.strava_activity_id);
    try {
      const result = await rebuildLocalClimbsForActivity(db, activityId, detectionOptions, namingOptions);
      if (!result.processed) {
        summary.errors.push({ activityId, message: result.message });
        continue;
      }

      summary.processedActivities += 1;
      summary.detectedClimbs += result.detected;
      summary.persistedClimbs += result.persisted;
      if (result.persisted > 0) {
        summary.activitiesWithClimbs += 1;
      }
    } catch (error: any) {
      summary.errors.push({
        activityId,
        message: error?.message || 'Unknown error',
      });
    }
  }

  return summary;
};

export const renameLocalSegments = async (
  db: DatabaseService,
  limit: number = 200,
  options?: RenameLocalSegmentsOptions,
  namingOptions?: LocalSegmentNamingOptions
): Promise<RenameLocalSegmentsResult> => {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 2000)) : 200;
  const safeOffset = Number.isFinite(options?.offset) ? Math.max(0, Math.floor(Number(options?.offset))) : 0;
  const includeManual = options?.includeManual ?? false;
  const renameManualNames = options?.renameManualNames ?? false;

  const summary: RenameLocalSegmentsResult = {
    matchedSegments: 0,
    processedSegments: 0,
    renamedSegments: 0,
    skippedSegments: 0,
    errors: [],
  };

  const segmentResult = await db.query(
    `
    SELECT
      s.id,
      s.name,
      s.activity_type,
      s.distance,
      s.average_grade,
      s.climb_category,
      s.start_latlng,
      s.end_latlng,
      s.is_auto_climb,
      sample.activity_name AS sample_activity_name
    FROM strava.segments s
    LEFT JOIN LATERAL (
      SELECT a.name AS activity_name
      FROM strava.segment_efforts se
      JOIN strava.activities a ON a.strava_activity_id = se.activity_id
      WHERE se.segment_id = s.id
      ORDER BY se.start_date ASC NULLS LAST, se.id ASC
      LIMIT 1
    ) sample ON true
    WHERE s.source = 'local'
      AND ($1::boolean = true OR s.is_auto_climb = true)
    ORDER BY s.id ASC
    LIMIT $2
    OFFSET $3
    `,
    [includeManual, safeLimit, safeOffset]
  );

  summary.matchedSegments = segmentResult.rows.length;

  for (const row of segmentResult.rows) {
    const segmentId = Number(row.id);
    try {
      const distanceM = finiteNumber(row.distance);
      if (distanceM === null || distanceM <= 0) {
        summary.skippedSegments += 1;
        continue;
      }

      const avgGradePct = finiteNumber(row.average_grade) ?? 0;
      const elevationGainApprox = Math.max(0, distanceM * (avgGradePct / 100));
      const climbCategory = finiteNumber(row.climb_category)
        ?? classifyClimbCategory(distanceM, elevationGainApprox, avgGradePct);
      const startLatLng = asLatLngTuple(row.start_latlng);
      const endLatLng = asLatLngTuple(row.end_latlng);
      const oldName = String(row.name || '').trim();
      if (!row.is_auto_climb && !renameManualNames) {
        summary.skippedSegments += 1;
        continue;
      }
      const nextName = await buildLocalSegmentName({
        distanceM,
        avgGradePct,
        climbCategory,
        activityType: row.activity_type,
        activityName: row.sample_activity_name,
        startLatLng,
        endLatLng,
        namingOptions,
        preferFallbackIfNoLocation: false,
      });

      summary.processedSegments += 1;
      if (!nextName || nextName === oldName) {
        summary.skippedSegments += 1;
        continue;
      }

      await db.query(
        `
        UPDATE strava.segments
        SET
          name = $2,
          climb_category = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [segmentId, nextName, climbCategory]
      );

      await db.query(
        `
        UPDATE strava.segment_efforts
        SET name = $2, updated_at = CURRENT_TIMESTAMP
        WHERE segment_id = $1 AND source = 'local'
        `,
        [segmentId, nextName]
      );

      summary.renamedSegments += 1;
    } catch (error: any) {
      summary.errors.push({
        segmentId,
        message: error?.message || 'Unknown error',
      });
    }
  }

  return summary;
};
