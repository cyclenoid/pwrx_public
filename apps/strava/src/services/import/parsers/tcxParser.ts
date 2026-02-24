import { ParsedActivity } from '../types';
import {
  average,
  haversineMeters,
  max,
  normalizeSportType,
  positiveElevationGain,
  toDate,
  toFiniteNumber,
} from './utils';

const readTagValue = (xml: string, regex: RegExp): string | null => {
  const match = xml.match(regex);
  return match?.[1] ? String(match[1]).trim() : null;
};

const readAnyValue = (xml: string, patterns: RegExp[]): string | null => {
  for (const pattern of patterns) {
    const value = readTagValue(xml, pattern);
    if (value !== null) return value;
  }
  return null;
};

export const parseTcx = (buffer: Buffer, fallbackName: string): ParsedActivity => {
  const xml = buffer.toString('utf8');
  const pointRegex = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/gi;
  const sportRaw = readTagValue(xml, /<Activity[^>]*Sport="([^"]+)"/i);
  const sport = normalizeSportType(sportRaw);
  const activityId = readTagValue(xml, /<Activity[\s\S]*?<Id>([^<]+)<\/Id>/i);
  const activityName = readAnyValue(xml, [
    /<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/i,
    /<(?:\w+:)?Notes>([^<]+)<\/(?:\w+:)?Notes>/i,
  ]);

  const latlng: Array<[number, number]> = [];
  const time: number[] = [];
  const altitude: number[] = [];
  const heartrate: number[] = [];
  const watts: number[] = [];
  const cadence: number[] = [];
  const distance: number[] = [];
  const speed: number[] = [];

  let match: RegExpExecArray | null;
  let firstTimestamp: Date | null = null;
  let cumulativeDistance = 0;

  while ((match = pointRegex.exec(xml)) !== null) {
    const body = match[1] || '';
    const ts = toDate(readTagValue(body, /<Time>([^<]+)<\/Time>/i));
    if (!ts) continue;
    if (!firstTimestamp) firstTimestamp = ts;
    const secondsFromStart = Math.max(0, Math.round((ts.getTime() - firstTimestamp.getTime()) / 1000));
    time.push(secondsFromStart);

    const speedValue = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?Speed>([^<]+)<\/(?:\w+:)?Speed>/i,
      /<(?:\w+:)?speed>([^<]+)<\/(?:\w+:)?speed>/i,
      /<(?:\w+:)?velocity>([^<]+)<\/(?:\w+:)?velocity>/i,
      /<(?:\w+:)?velocity_smooth>([^<]+)<\/(?:\w+:)?velocity_smooth>/i,
    ]));

    const lat = toFiniteNumber(readTagValue(body, /<LatitudeDegrees>([^<]+)<\/LatitudeDegrees>/i));
    const lon = toFiniteNumber(readTagValue(body, /<LongitudeDegrees>([^<]+)<\/LongitudeDegrees>/i));
    if (lat !== null && lon !== null) {
      const last = latlng[latlng.length - 1];
      if (last) {
        const segmentDistance = haversineMeters(last[0], last[1], lat, lon);
        cumulativeDistance += segmentDistance;
        const prevSec = time.length > 1 ? time[time.length - 2] : 0;
        const deltaT = secondsFromStart - prevSec;
        speed.push(speedValue ?? (deltaT > 0 ? segmentDistance / deltaT : 0));
      } else {
        speed.push(speedValue ?? 0);
      }
      latlng.push([lat, lon]);
    } else if (speedValue !== null) {
      speed.push(speedValue);
    }

    const ele = toFiniteNumber(readTagValue(body, /<AltitudeMeters>([^<]+)<\/AltitudeMeters>/i));
    if (ele !== null) altitude.push(ele);

    const dist = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?DistanceMeters>([^<]+)<\/(?:\w+:)?DistanceMeters>/i,
      /<(?:\w+:)?distance>([^<]+)<\/(?:\w+:)?distance>/i,
      /<(?:\w+:)?distance_m>([^<]+)<\/(?:\w+:)?distance_m>/i,
    ]));
    if (dist !== null) distance.push(dist);

    const hr = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?HeartRateBpm>[\s\S]*?<Value>([^<]+)<\/Value>[\s\S]*?<\/(?:\w+:)?HeartRateBpm>/i,
      /<(?:\w+:)?hr>([^<]+)<\/(?:\w+:)?hr>/i,
      /<(?:\w+:)?heartrate>([^<]+)<\/(?:\w+:)?heartrate>/i,
      /<(?:\w+:)?heart_rate>([^<]+)<\/(?:\w+:)?heart_rate>/i,
    ]));
    if (hr !== null) heartrate.push(hr);

    const cad = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?Cadence>([^<]+)<\/(?:\w+:)?Cadence>/i,
      /<(?:\w+:)?RunCadence>([^<]+)<\/(?:\w+:)?RunCadence>/i,
      /<(?:\w+:)?cad>([^<]+)<\/(?:\w+:)?cad>/i,
      /<(?:\w+:)?cadence>([^<]+)<\/(?:\w+:)?cadence>/i,
    ]));
    if (cad !== null) cadence.push(cad);

    const pwr = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?Watts>([^<]+)<\/(?:\w+:)?Watts>/i,
      /<(?:\w+:)?Power>([^<]+)<\/(?:\w+:)?Power>/i,
      /<(?:\w+:)?power>([^<]+)<\/(?:\w+:)?power>/i,
    ]));
    if (pwr !== null) watts.push(pwr);

  }

  if (!time.length || !firstTimestamp) {
    throw new Error('TCX parse error: no valid trackpoints with timestamp found');
  }

  const durationSec = Math.max(...time);
  const elevationGainM = positiveElevationGain(altitude);
  const distanceM = distance.length ? distance[distance.length - 1] : cumulativeDistance;

  if (!speed.length && latlng.length && time.length > 1) {
    speed.push(0);
    for (let i = 1; i < latlng.length && i < time.length; i += 1) {
      const d = haversineMeters(latlng[i - 1][0], latlng[i - 1][1], latlng[i][0], latlng[i][1]);
      const dt = time[i] - time[i - 1];
      speed.push(dt > 0 ? d / dt : 0);
    }
  }

  return {
    metadata: {
      name: activityName || fallbackName,
      sportType: sport.sportType,
      startTimeUtc: firstTimestamp,
      durationSec,
      distanceM,
      elevationGainM,
      avgHr: average(heartrate),
      maxHr: max(heartrate),
      avgPower: average(watts),
      maxPower: max(watts),
      avgCadence: average(cadence),
      externalId: activityId || undefined,
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
