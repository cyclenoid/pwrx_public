export type ImportFormat = 'fit' | 'gpx' | 'tcx' | 'csv';
export type ActivityImportFormat = Exclude<ImportFormat, 'csv'>;

export interface ParsedStreams {
  time: number[];
  latlng?: Array<[number, number]>;
  altitude?: number[];
  heartrate?: number[];
  watts?: number[];
  cadence?: number[];
  distance?: number[];
  velocity_smooth?: number[];
}

export interface ParsedActivityMetadata {
  name?: string;
  sportType: string;
  startTimeUtc: Date;
  durationSec: number;
  distanceM?: number;
  elevationGainM?: number;
  avgHr?: number;
  maxHr?: number;
  avgPower?: number;
  maxPower?: number;
  avgCadence?: number;
  calories?: number;
  device?: string;
  externalId?: string;
}

export interface ParsedActivity {
  metadata: ParsedActivityMetadata;
  streams: ParsedStreams;
}
