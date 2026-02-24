import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import * as zlib from 'node:zlib';

const { parseActivity } = require('../services/import/parser');
const { detectImportFormat, decodeImportBufferIfNeeded, isSupportedImportFilename } = require('../services/import/detector');

const FIT_SEMICIRCLE = 2147483648 / 180;

const withMockedFitParser = async (
  mockData: any,
  run: () => Promise<void>,
  exportStyle: 'direct' | 'default' | 'named' = 'direct'
) => {
  const moduleAny = Module as any;
  const originalLoad = moduleAny._load;

  class MockFitParser {
    parse(_buffer: Buffer, callback: (error: Error | null, data?: any) => void) {
      callback(null, mockData);
    }
  }

  moduleAny._load = function patchedLoad(request: string, parent: any, isMain: boolean) {
    if (request === 'fit-file-parser') {
      if (exportStyle === 'default') return { default: MockFitParser };
      if (exportStyle === 'named') return { FitParser: MockFitParser };
      return MockFitParser;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    await run();
  } finally {
    moduleAny._load = originalLoad;
  }
};

test('GPX parser reads extension streams (HR/Power/Cadence/Speed)', async () => {
  const gpxXml = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <name>Morning Ride</name>
    <trkseg>
      <trkpt lat="52.5" lon="13.4">
        <ele>30</ele>
        <time>2026-02-06T08:00:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr><gpxtpx:cad>80</gpxtpx:cad><gpxtpx:power>210</gpxtpx:power><gpxtpx:speed>4.1</gpxtpx:speed></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="52.5005" lon="13.401">
        <ele>34</ele>
        <time>2026-02-06T08:00:20Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>130</gpxtpx:hr><gpxtpx:cad>84</gpxtpx:cad><gpxtpx:power>230</gpxtpx:power><gpxtpx:speed>4.3</gpxtpx:speed></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const parsed = await parseActivity('gpx', Buffer.from(gpxXml), 'sample.gpx');
  assert.equal(parsed.metadata.sportType, 'Workout');
  assert.equal(parsed.streams.time.length, 2);
  assert.equal(parsed.streams.heartrate?.length, 2);
  assert.equal(parsed.streams.watts?.length, 2);
  assert.equal(parsed.streams.cadence?.length, 2);
  assert.equal(parsed.streams.velocity_smooth?.length, 2);
  assert.equal(parsed.metadata.avgHr, 125);
  assert.equal(parsed.metadata.avgPower, 220);
  assert.equal(parsed.metadata.maxPower, 230);
});

test('GPX parser ignores metadata link MIME type when detecting sport type', async () => {
  const gpxXml = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <metadata>
    <link href="https://example.org">
      <type>text/html</type>
    </link>
  </metadata>
  <trk>
    <name>Road Ride</name>
    <type>cycling</type>
    <trkseg>
      <trkpt lat="52.5" lon="13.4"><time>2026-02-06T08:00:00Z</time></trkpt>
      <trkpt lat="52.5005" lon="13.401"><time>2026-02-06T08:00:20Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const parsed = await parseActivity('gpx', Buffer.from(gpxXml), 'sample.gpx');
  assert.equal(parsed.metadata.sportType, 'Ride');
});

test('TCX parser prefers extension speed and does not duplicate speed samples', async () => {
  const tcxXml = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities>
    <Activity Sport="Biking">
      <Id>2026-02-06T08:00:00Z</Id>
      <Lap StartTime="2026-02-06T08:00:00Z">
        <Track>
          <Trackpoint>
            <Time>2026-02-06T08:00:00Z</Time>
            <Position><LatitudeDegrees>52.5</LatitudeDegrees><LongitudeDegrees>13.4</LongitudeDegrees></Position>
            <DistanceMeters>0</DistanceMeters>
            <HeartRateBpm><Value>121</Value></HeartRateBpm>
            <Cadence>81</Cadence>
            <Extensions><ns3:TPX><ns3:Speed>4.2</ns3:Speed><ns3:Watts>222</ns3:Watts></ns3:TPX></Extensions>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-02-06T08:00:20Z</Time>
            <Position><LatitudeDegrees>52.5003</LatitudeDegrees><LongitudeDegrees>13.4005</LongitudeDegrees></Position>
            <DistanceMeters>65</DistanceMeters>
            <HeartRateBpm><Value>129</Value></HeartRateBpm>
            <Cadence>87</Cadence>
            <Extensions><ns3:TPX><ns3:Speed>4.4</ns3:Speed><ns3:Watts>244</ns3:Watts></ns3:TPX></Extensions>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

  const parsed = await parseActivity('tcx', Buffer.from(tcxXml), 'sample.tcx');
  assert.equal(parsed.metadata.sportType, 'Ride');
  assert.equal(parsed.streams.time.length, 2);
  assert.equal(parsed.streams.velocity_smooth?.length, 2);
  assert.deepEqual(parsed.streams.velocity_smooth, [4.2, 4.4]);
  assert.equal(parsed.streams.watts?.length, 2);
  assert.equal(parsed.metadata.avgPower, 233);
});

test('GPX parser rejects broken track data', async () => {
  const brokenGpx = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="52.5" lon="13.4"><ele>30</ele></trkpt></trkseg></trk></gpx>`;

  await assert.rejects(
    parseActivity('gpx', Buffer.from(brokenGpx), 'broken.gpx'),
    /GPX parse error/i
  );
});

test('GPX parser falls back to geo distance when embedded distance stays at zero', async () => {
  const gpxXml = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Zero distance tags</name>
    <trkseg>
      <trkpt lat="52.5000" lon="13.4000"><time>2026-02-06T08:00:00Z</time><distance>0</distance></trkpt>
      <trkpt lat="52.5100" lon="13.4100"><time>2026-02-06T08:05:00Z</time><distance>0</distance></trkpt>
      <trkpt lat="52.5200" lon="13.4200"><time>2026-02-06T08:10:00Z</time><distance>0</distance></trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const parsed = await parseActivity('gpx', Buffer.from(gpxXml), 'zero-distance.gpx');
  const totalDistance = parsed.metadata.distanceM || 0;
  const streamDistance = parsed.streams.distance?.[parsed.streams.distance.length - 1] || 0;

  assert.ok(totalDistance > 1000, `expected >1000m distance, got ${totalDistance}`);
  assert.ok(streamDistance > 1000, `expected >1000m stream distance, got ${streamDistance}`);
});

test('FIT parser handles data without GPS and uses session summary', async () => {
  const mockFitData = {
    sport: 'cycling',
    sessions: [{
      start_time: '2026-02-06T08:00:00Z',
      total_elapsed_time: 60,
      total_distance: 410,
      total_ascent: 22,
      avg_heart_rate: 140,
      max_heart_rate: 160,
      avg_power: 230,
      max_power: 280,
      avg_cadence: 85,
    }],
    records: [
      {
        timestamp: '2026-02-06T08:00:00Z',
        heart_rate: 138,
        power: 220,
        cadence: 82,
        distance: 0,
        enhanced_speed: 3.5,
      },
      {
        timestamp: '2026-02-06T08:01:00Z',
        heart_rate: 142,
        power: 240,
        cadence: 88,
        distance: 410,
        enhanced_speed: 3.8,
      },
    ],
  };

  await withMockedFitParser(mockFitData, async () => {
    const parsed = await parseActivity('fit', Buffer.from('mock-fit'), 'indoor.fit');
    assert.equal(parsed.metadata.sportType, 'Ride');
    assert.equal(parsed.metadata.durationSec, 60);
    assert.equal(parsed.metadata.distanceM, 410);
    assert.equal(parsed.metadata.avgPower, 230);
    assert.equal(parsed.streams.latlng, undefined);
    assert.equal(parsed.streams.watts?.length, 2);
  });
});

test('FIT parser converts semicircle coordinates to degrees', async () => {
  const latSemicircle = Math.round(52.5 * FIT_SEMICIRCLE);
  const lonSemicircle = Math.round(13.4 * FIT_SEMICIRCLE);

  const mockFitData = {
    sport: 'cycling',
    sessions: [{
      start_time: '2026-02-06T08:00:00Z',
      total_elapsed_time: 30,
    }],
    records: [
      {
        timestamp: '2026-02-06T08:00:00Z',
        position_lat: latSemicircle,
        position_long: lonSemicircle,
        distance: 0,
      },
      {
        timestamp: '2026-02-06T08:00:30Z',
        position_lat: latSemicircle + 1000,
        position_long: lonSemicircle + 1000,
        distance: 80,
      },
    ],
  };

  await withMockedFitParser(mockFitData, async () => {
    const parsed = await parseActivity('fit', Buffer.from('mock-fit'), 'outdoor.fit');
    assert.equal(parsed.streams.time.length, 2);
    assert.equal(parsed.streams.latlng?.length, 2);

    const first = parsed.streams.latlng?.[0];
    assert.ok(first);
    assert.ok(Math.abs(first[0] - 52.5) < 0.0001);
    assert.ok(Math.abs(first[1] - 13.4) < 0.0001);
  });
});

test('FIT parser supports default-export module shape', async () => {
  const mockFitData = {
    sport: 'cycling',
    sessions: [{
      start_time: '2026-02-06T08:00:00Z',
      total_elapsed_time: 30,
      total_distance: 120,
    }],
    records: [
      {
        timestamp: '2026-02-06T08:00:00Z',
        distance: 0,
      },
      {
        timestamp: '2026-02-06T08:00:30Z',
        distance: 120,
      },
    ],
  };

  await withMockedFitParser(mockFitData, async () => {
    const parsed = await parseActivity('fit', Buffer.from('mock-fit'), 'default-export.fit');
    assert.equal(parsed.metadata.durationSec, 30);
    assert.equal(parsed.metadata.distanceM, 120);
  }, 'default');
});

test('FIT parser flags metadata-only files as skippable', async () => {
  const mockFitData = {
    file_ids: [
      {
        type: 'activity',
        time_created: '2019-03-23T11:12:21Z',
      },
    ],
    sessions: [],
    records: [],
  };

  await withMockedFitParser(mockFitData, async () => {
    await assert.rejects(
      parseActivity('fit', Buffer.from('mock-fit'), 'metadata-only.fit'),
      /FIT parse skip: metadata-only FIT file/
    );
  }, 'default');
});

test('Import detector recognizes .fit.gz and decode helper inflates payload', () => {
  const fitLikePayload = Buffer.alloc(24);
  fitLikePayload.write('.FIT', 8, 'ascii');
  const gzPayload = zlib.gzipSync(fitLikePayload);

  assert.equal(detectImportFormat('activity.fit.gz', gzPayload), 'fit');
  const decoded = decodeImportBufferIfNeeded('activity.fit.gz', gzPayload);
  assert.deepEqual(decoded, fitLikePayload);
});

test('Import detector can detect compressed GPX content with generic .gz extension', () => {
  const gpxPayload = Buffer.from('<?xml version="1.0"?><gpx><trk></trk></gpx>', 'utf8');
  const gzPayload = zlib.gzipSync(gpxPayload);

  assert.equal(detectImportFormat('activity.gz', gzPayload), 'gpx');
});

test('Import detector recognizes activities.csv and activities.csv.gz', () => {
  const csvPayload = Buffer.from('Activity ID,Activity Name,Filename\n123,Test Ride,activities/123.fit.gz', 'utf8');
  const gzPayload = zlib.gzipSync(csvPayload);

  assert.equal(isSupportedImportFilename('activities.csv'), true);
  assert.equal(isSupportedImportFilename('activities.csv.gz'), true);
  assert.equal(detectImportFormat('activities.csv', csvPayload), 'csv');
  assert.equal(detectImportFormat('activities.csv.gz', gzPayload), 'csv');
});
