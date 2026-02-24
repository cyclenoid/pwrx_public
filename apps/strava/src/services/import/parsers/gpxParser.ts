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

export const parseGpx = (buffer: Buffer, fallbackName: string): ParsedActivity => {
  const xml = buffer.toString('utf8');
  const pointRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
  const name = readTagValue(xml, /<trk>\s*[\s\S]*?<name>([^<]+)<\/name>/i)
    || readTagValue(xml, /<name>([^<]+)<\/name>/i)
    || fallbackName;
  // Prefer activity-level type from track/route blocks. GPX metadata often contains
  // link MIME types like <type>text/html</type>, which are not sport types.
  const typeTag = readTagValue(xml, /<trk\b[\s\S]*?<type>([^<]+)<\/type>[\s\S]*?<\/trk>/i)
    || readTagValue(xml, /<rte\b[\s\S]*?<type>([^<]+)<\/type>[\s\S]*?<\/rte>/i)
    || null;
  const sport = normalizeSportType(typeTag);

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
  let fallbackSeconds = 0;
  let cumulativeDistance = 0;

  while ((match = pointRegex.exec(xml)) !== null) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const lat = toFiniteNumber(readTagValue(attrs, /lat="([^"]+)"/i));
    const lon = toFiniteNumber(readTagValue(attrs, /lon="([^"]+)"/i));
    if (lat === null || lon === null) continue;

    const ts = toDate(readTagValue(body, /<time>([^<]+)<\/time>/i));
    if (!ts) continue;

    if (!firstTimestamp) firstTimestamp = ts;
    const secondsFromStart = Math.max(0, Math.round((ts.getTime() - firstTimestamp.getTime()) / 1000));
    time.push(secondsFromStart);
    fallbackSeconds = secondsFromStart + 1;

    const ele = toFiniteNumber(readTagValue(body, /<ele>([^<]+)<\/ele>/i));
    if (ele !== null) altitude.push(ele);

    const hr = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?hr>([^<]+)<\/(?:\w+:)?hr>/i,
      /<(?:\w+:)?heartrate>([^<]+)<\/(?:\w+:)?heartrate>/i,
      /<(?:\w+:)?heart_rate>([^<]+)<\/(?:\w+:)?heart_rate>/i,
      /<(?:\w+:)?HeartRateBpm>[\s\S]*?<Value>([^<]+)<\/Value>[\s\S]*?<\/(?:\w+:)?HeartRateBpm>/i,
    ]));
    if (hr !== null) heartrate.push(hr);

    const cad = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?cad>([^<]+)<\/(?:\w+:)?cad>/i,
      /<(?:\w+:)?cadence>([^<]+)<\/(?:\w+:)?cadence>/i,
      /<(?:\w+:)?run_cadence>([^<]+)<\/(?:\w+:)?run_cadence>/i,
    ]));
    if (cad !== null) cadence.push(cad);

    const pwr = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?power>([^<]+)<\/(?:\w+:)?power>/i,
      /<(?:\w+:)?watts>([^<]+)<\/(?:\w+:)?watts>/i,
      /<(?:\w+:)?PowerInWatts>([^<]+)<\/(?:\w+:)?PowerInWatts>/i,
      /<(?:\w+:)?avg_watts>([^<]+)<\/(?:\w+:)?avg_watts>/i,
    ]));
    if (pwr !== null) watts.push(pwr);

    const speedValue = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?speed>([^<]+)<\/(?:\w+:)?speed>/i,
      /<(?:\w+:)?velocity>([^<]+)<\/(?:\w+:)?velocity>/i,
      /<(?:\w+:)?velocity_smooth>([^<]+)<\/(?:\w+:)?velocity_smooth>/i,
    ]));

    const distanceValue = toFiniteNumber(readAnyValue(body, [
      /<(?:\w+:)?distance>([^<]+)<\/(?:\w+:)?distance>/i,
      /<(?:\w+:)?DistanceMeters>([^<]+)<\/(?:\w+:)?DistanceMeters>/i,
      /<(?:\w+:)?distance_m>([^<]+)<\/(?:\w+:)?distance_m>/i,
    ]));

    const lastPoint = latlng[latlng.length - 1];
    const useEmbeddedDistance = distanceValue !== null && (latlng.length === 0 || distanceValue > cumulativeDistance);
    if (useEmbeddedDistance) {
      cumulativeDistance = Math.max(cumulativeDistance, distanceValue);
      distance.push(cumulativeDistance);
      speed.push(speedValue ?? 0);
    } else if (lastPoint) {
      const segmentDistance = haversineMeters(lastPoint[0], lastPoint[1], lat, lon);
      cumulativeDistance += segmentDistance;
      distance.push(cumulativeDistance);

      if (speedValue !== null) {
        speed.push(speedValue);
      } else {
        const prevSec = time.length > 1 ? time[time.length - 2] : 0;
        const deltaT = secondsFromStart - prevSec;
        speed.push(deltaT > 0 ? segmentDistance / deltaT : 0);
      }
    } else {
      distance.push(cumulativeDistance);
      speed.push(speedValue ?? 0);
    }

    latlng.push([lat, lon]);
  }

  if (!latlng.length || !firstTimestamp) {
    throw new Error('GPX parse error: no valid trackpoints with timestamp found');
  }

  const durationSec = time.length ? Math.max(...time) : fallbackSeconds;
  const elevationGainM = positiveElevationGain(altitude);

  return {
    metadata: {
      name,
      sportType: sport.sportType,
      startTimeUtc: firstTimestamp,
      durationSec,
      distanceM: distance.length ? distance[distance.length - 1] : cumulativeDistance,
      elevationGainM,
      avgHr: average(heartrate),
      maxHr: max(heartrate),
      avgPower: average(watts),
      maxPower: max(watts),
      avgCadence: average(cadence),
    },
    streams: {
      time,
      latlng,
      altitude: altitude.length ? altitude : undefined,
      heartrate: heartrate.length ? heartrate : undefined,
      watts: watts.length ? watts : undefined,
      cadence: cadence.length ? cadence : undefined,
      distance: distance.length ? distance : undefined,
      velocity_smooth: speed.length ? speed : undefined,
    },
  };
};
