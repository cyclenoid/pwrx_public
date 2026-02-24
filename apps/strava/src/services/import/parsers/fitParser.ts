import { ParsedActivity } from '../types';
import {
  average,
  max,
  normalizeSportType,
  positiveElevationGain,
  toDate,
  toFiniteNumber,
} from './utils';

const FIT_SEMICIRCLE_TO_DEG = 180 / 2147483648;

const toArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
};

const maybeSemicircleToDegrees = (value: number): number => {
  if (Math.abs(value) > 180) {
    return value * FIT_SEMICIRCLE_TO_DEG;
  }
  return value;
};

export const parseFit = async (buffer: Buffer, fallbackName: string): Promise<ParsedActivity> => {
  const fitParserModule = require('fit-file-parser');
  const FitParser =
    (typeof fitParserModule === 'function'
      ? fitParserModule
      : (fitParserModule?.default || fitParserModule?.FitParser));

  if (typeof FitParser !== 'function') {
    throw new Error('FIT parse error: unsupported fit-file-parser export');
  }

  const parser = new FitParser({
    force: true,
    speedUnit: 'm/s',
    lengthUnit: 'm',
    temperatureUnit: 'celsius',
    elapsedRecordField: true,
    mode: 'list',
  });

  const parsedData: any = await new Promise((resolve, reject) => {
    parser.parse(buffer, (error: Error | null, data: any) => {
      if (error) return reject(error);
      return resolve(data);
    });
  });

  const records = toArray<any>(parsedData?.records);
  const session = toArray<any>(parsedData?.sessions)[0] || {};

  if (!records.length && !session?.start_time) {
    throw new Error('FIT parse skip: metadata-only FIT file');
  }

  const time: number[] = [];
  const latlng: Array<[number, number]> = [];
  const altitude: number[] = [];
  const heartrate: number[] = [];
  const watts: number[] = [];
  const cadence: number[] = [];
  const distance: number[] = [];
  const speed: number[] = [];

  let firstTimestamp: Date | null = null;

  for (const record of records) {
    const ts = toDate(record?.timestamp || record?.time || record?.date_time);
    if (!ts) continue;
    if (!firstTimestamp) firstTimestamp = ts;
    const secondsFromStart = Math.max(0, Math.round((ts.getTime() - firstTimestamp.getTime()) / 1000));
    time.push(secondsFromStart);

    const latRaw = toFiniteNumber(record?.position_lat);
    const lonRaw = toFiniteNumber(record?.position_long);
    if (latRaw !== null && lonRaw !== null) {
      latlng.push([
        maybeSemicircleToDegrees(latRaw),
        maybeSemicircleToDegrees(lonRaw),
      ]);
    }

    const alt = toFiniteNumber(record?.enhanced_altitude ?? record?.altitude);
    if (alt !== null) altitude.push(alt);

    const hr = toFiniteNumber(record?.heart_rate ?? record?.heartrate);
    if (hr !== null) heartrate.push(hr);

    const pwr = toFiniteNumber(record?.power ?? record?.watts);
    if (pwr !== null) watts.push(pwr);

    const cad = toFiniteNumber(record?.cadence);
    if (cad !== null) cadence.push(cad);

    const dist = toFiniteNumber(record?.distance);
    if (dist !== null) distance.push(dist);

    const spd = toFiniteNumber(record?.enhanced_speed ?? record?.speed);
    if (spd !== null) speed.push(spd);
  }

  const startTime = toDate(session?.start_time) || firstTimestamp;
  if (!startTime) {
    throw new Error('FIT parse error: no valid start time found');
  }

  const durationFromSession = toFiniteNumber(session?.total_elapsed_time ?? session?.total_timer_time);
  const durationSec = durationFromSession !== null
    ? Math.round(durationFromSession)
    : (time.length ? Math.max(...time) : 0);
  const distanceFromSession = toFiniteNumber(session?.total_distance);
  const distanceM = distanceFromSession !== null
    ? distanceFromSession
    : (distance.length ? distance[distance.length - 1] : undefined);
  const elevationGain = toFiniteNumber(session?.total_ascent) ?? positiveElevationGain(altitude);

  const sport = normalizeSportType(session?.sport || session?.sub_sport || parsedData?.sport);

  return {
    metadata: {
      name: fallbackName,
      sportType: sport.sportType,
      startTimeUtc: startTime,
      durationSec,
      distanceM: distanceM ?? undefined,
      elevationGainM: elevationGain ?? undefined,
      avgHr: toFiniteNumber(session?.avg_heart_rate) ?? average(heartrate),
      maxHr: toFiniteNumber(session?.max_heart_rate) ?? max(heartrate),
      avgPower: toFiniteNumber(session?.avg_power) ?? average(watts),
      maxPower: toFiniteNumber(session?.max_power) ?? max(watts),
      avgCadence: toFiniteNumber(session?.avg_cadence) ?? average(cadence),
    },
    streams: {
      time,
      latlng: latlng.length ? latlng : undefined,
      altitude: altitude.length ? altitude : undefined,
      heartrate: heartrate.length ? heartrate : undefined,
      watts: watts.length ? watts : undefined,
      cadence: cadence.length ? cadence : undefined,
      distance: distance.length ? distance : undefined,
      velocity_smooth: speed.length ? speed : undefined,
    },
  };
};
