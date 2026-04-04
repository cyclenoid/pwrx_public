#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const STRAVA_OAUTH_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function boolFrom(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase().trim());
}

function intFrom(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString();
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 64) || 'activity';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArray(streams, key) {
  const maybe = streams?.[key]?.data;
  return Array.isArray(maybe) ? maybe : [];
}

function formatPointExtensions({ hr, cad, atemp, power }) {
  const parts = [];
  if (Number.isFinite(hr)) parts.push(`<gpxtpx:hr>${Math.round(hr)}</gpxtpx:hr>`);
  if (Number.isFinite(cad)) parts.push(`<gpxtpx:cad>${Math.round(cad)}</gpxtpx:cad>`);
  if (Number.isFinite(atemp)) parts.push(`<gpxtpx:atemp>${Math.round(atemp)}</gpxtpx:atemp>`);
  if (Number.isFinite(power)) parts.push(`<power>${Math.round(power)}</power>`);
  if (parts.length === 0) return '';
  return `<extensions><gpxtpx:TrackPointExtension>${parts.join('')}</gpxtpx:TrackPointExtension></extensions>`;
}

function buildGpx(activity, streams) {
  const latlng = getArray(streams, 'latlng');
  const time = getArray(streams, 'time');
  const altitude = getArray(streams, 'altitude');
  const heartrate = getArray(streams, 'heartrate');
  const cadence = getArray(streams, 'cadence');
  const temp = getArray(streams, 'temp');
  const watts = getArray(streams, 'watts');

  const length = Math.min(latlng.length, time.length);
  if (length < 2) {
    return null;
  }

  const startEpoch = Math.floor(new Date(activity.start_date).getTime() / 1000);
  const name = xmlEscape(activity.name || `Strava ${activity.id}`);
  const sport = xmlEscape(activity.sport_type || activity.type || 'Ride');
  const description = xmlEscape(`Strava activity ${activity.id}`);

  const points = [];
  for (let i = 0; i < length; i += 1) {
    const coords = latlng[i];
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lat = Number(coords[0]);
    const lon = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const timeOffset = Number(time[i]);
    if (!Number.isFinite(timeOffset)) continue;
    const ele = Number(altitude[i]);
    const hr = Number(heartrate[i]);
    const cad = Number(cadence[i]);
    const atemp = Number(temp[i]);
    const power = Number(watts[i]);
    const ext = formatPointExtensions({ hr, cad, atemp, power });
    const eleTag = Number.isFinite(ele) ? `<ele>${ele.toFixed(1)}</ele>` : '';
    points.push(
      `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">${eleTag}<time>${toIso(startEpoch + timeOffset)}</time>${ext}</trkpt>`
    );
  }

  if (points.length < 2) return null;

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PWRX Strava Sidecar" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>${name}</name>
    <desc>${description}</desc>
    <time>${xmlEscape(activity.start_date)}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <type>${sport}</type>
    <trkseg>
      ${points.join('\n      ')}
    </trkseg>
  </trk>
</gpx>
`;
}

async function requestJson(url, init, retries = 3) {
  let attempt = 0;
  let lastError = null;
  while (attempt <= retries) {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return await response.json();
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          const waitMs = 600 * (attempt + 1);
          await sleep(waitMs);
          attempt += 1;
          continue;
        }
      }
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(600 * (attempt + 1));
      attempt += 1;
    }
  }
  throw lastError || new Error('request failed');
}

async function getStravaAccessToken(config) {
  const payload = new URLSearchParams();
  payload.set('client_id', String(config.clientId));
  payload.set('client_secret', String(config.clientSecret));
  payload.set('grant_type', 'refresh_token');
  payload.set('refresh_token', String(config.refreshToken));

  const json = await requestJson(STRAVA_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  if (!json?.access_token) {
    throw new Error('Strava OAuth response does not include access_token');
  }

  return json;
}

async function fetchActivities(config, accessToken) {
  const all = [];
  const headers = { Authorization: `Bearer ${accessToken}` };
  const after = Math.floor(Date.now() / 1000) - config.lookbackDays * 86400;
  let page = 1;
  while (all.length < config.maxActivities) {
    const url = `${STRAVA_API_BASE}/athlete/activities?per_page=200&page=${page}&after=${after}`;
    const batch = await requestJson(url, { headers });
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 200) break;
    page += 1;
  }
  return all.slice(0, config.maxActivities);
}

async function fetchActivityStreams(accessToken, activityId) {
  const url = `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=time,latlng,altitude,heartrate,cadence,temp,watts&key_by_type=true`;
  return requestJson(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function createMockActivities() {
  const now = new Date();
  return [
    {
      id: 900000001,
      name: 'Mock Ride',
      start_date: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      sport_type: 'Ride',
    },
    {
      id: 900000002,
      name: 'Mock Run',
      start_date: new Date(now.getTime() - 26 * 3600 * 1000).toISOString(),
      sport_type: 'Run',
    },
  ];
}

function createMockStreams() {
  return {
    time: { data: [0, 30, 60, 90, 120] },
    latlng: {
      data: [
        [49.12345, 10.12345],
        [49.12355, 10.12375],
        [49.12375, 10.12415],
        [49.12395, 10.12455],
        [49.12415, 10.12495],
      ],
    },
    altitude: { data: [315, 316, 318, 319, 321] },
    heartrate: { data: [132, 136, 141, 145, 143] },
    cadence: { data: [84, 86, 88, 87, 85] },
    watts: { data: [210, 225, 235, 228, 220] },
    temp: { data: [12, 12, 13, 13, 13] },
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uploadToImportApi(config, filePath, fileName) {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.set('file', new Blob([buffer], { type: 'application/gpx+xml' }), fileName);
  const base = config.importApiBase.replace(/\/+$/g, '');
  const uploadUrl = `${base}/import/file`;
  const response = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Import API upload failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return response.json();
}

function readConfig() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    return { help: true };
  }

  const mode = String(args.mode || process.env.PWRX_SIDECAR_MODE || 'watch_folder');
  const outputDir = path.resolve(
    String(args['output-dir'] || process.env.PWRX_SIDECAR_OUTPUT_DIR || './data/imports/watch/sidecar-strava')
  );
  const importApiBase = String(args['api-base'] || process.env.PWRX_SIDECAR_API_BASE || 'http://127.0.0.1:3001/api');

  return {
    help: false,
    mode,
    outputDir,
    importApiBase,
    lookbackDays: intFrom(args['lookback-days'] || process.env.PWRX_SIDECAR_LOOKBACK_DAYS, 14),
    maxActivities: intFrom(args['max-activities'] || process.env.PWRX_SIDECAR_MAX_ACTIVITIES, 200),
    delayMs: intFrom(args['delay-ms'] || process.env.PWRX_SIDECAR_DELAY_MS, 120),
    dryRun: boolFrom(args['dry-run'] || process.env.PWRX_SIDECAR_DRY_RUN, false),
    mock: boolFrom(args.mock || process.env.PWRX_SIDECAR_MOCK, false),
    clientId: args['client-id'] || process.env.STRAVA_CLIENT_ID || '',
    clientSecret: args['client-secret'] || process.env.STRAVA_CLIENT_SECRET || '',
    refreshToken: args['refresh-token'] || process.env.STRAVA_REFRESH_TOKEN || '',
  };
}

function printUsage() {
  console.log(`PWRX Strava Sidecar

Usage:
  node scripts/strava-sidecar.mjs [options]

Options:
  --mode <watch_folder|import_api>   Output mode (default: watch_folder)
  --output-dir <path>                GPX output folder
  --api-base <url>                   PWRX API base (default: http://127.0.0.1:3001/api)
  --lookback-days <n>                Pull recent activities (default: 14)
  --max-activities <n>               Max activities per run (default: 200)
  --delay-ms <n>                     Delay between stream calls (default: 120)
  --dry-run                          No file writes and no uploads
  --mock                             Use built-in mock activities (no Strava API calls)
  --client-id <id>                   Override STRAVA_CLIENT_ID
  --client-secret <secret>           Override STRAVA_CLIENT_SECRET
  --refresh-token <token>            Override STRAVA_REFRESH_TOKEN
  --help                             Show this help

Environment:
  STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
  PWRX_SIDECAR_MODE, PWRX_SIDECAR_OUTPUT_DIR, PWRX_SIDECAR_API_BASE
  PWRX_SIDECAR_LOOKBACK_DAYS, PWRX_SIDECAR_MAX_ACTIVITIES
  PWRX_SIDECAR_DELAY_MS, PWRX_SIDECAR_DRY_RUN, PWRX_SIDECAR_MOCK
`);
}

async function run() {
  const config = readConfig();
  if (config.help) {
    printUsage();
    return;
  }

  if (!['watch_folder', 'import_api'].includes(config.mode)) {
    throw new Error(`Unsupported mode "${config.mode}". Use watch_folder or import_api.`);
  }

  console.log(`[sidecar] mode=${config.mode} mock=${config.mock} dry_run=${config.dryRun}`);
  console.log(`[sidecar] output_dir=${config.outputDir}`);

  if (!config.dryRun) {
    await ensureDir(config.outputDir);
  }

  let activities;
  let accessToken = null;
  if (config.mock) {
    activities = createMockActivities();
  } else {
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      throw new Error('Missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET / STRAVA_REFRESH_TOKEN');
    }
    const tokenResponse = await getStravaAccessToken(config);
    accessToken = tokenResponse.access_token;
    if (tokenResponse.refresh_token && tokenResponse.refresh_token !== config.refreshToken) {
      console.log('[sidecar] Strava refresh token rotated. Update your secret config.');
    }
    activities = await fetchActivities(config, accessToken);
  }

  console.log(`[sidecar] fetched activities: ${activities.length}`);

  let skippedExisting = 0;
  let skippedNoGps = 0;
  let generated = 0;
  let uploaded = 0;
  let failed = 0;

  for (const activity of activities) {
    try {
      const slug = slugify(activity.name);
      const fileName = `${activity.id}-${slug}.gpx`;
      const filePath = path.join(config.outputDir, fileName);

      if (await fileExists(filePath)) {
        skippedExisting += 1;
        continue;
      }

      const streams = config.mock ? createMockStreams() : await fetchActivityStreams(accessToken, activity.id);
      const gpx = buildGpx(activity, streams);
      if (!gpx) {
        skippedNoGps += 1;
        continue;
      }

      if (config.dryRun) {
        generated += 1;
      } else {
        await fs.writeFile(filePath, gpx, 'utf8');
        generated += 1;
      }

      if (config.mode === 'import_api') {
        if (config.dryRun) {
          uploaded += 1;
        } else {
          await uploadToImportApi(config, filePath, fileName);
          uploaded += 1;
        }
      }

      if (config.delayMs > 0) {
        await sleep(config.delayMs);
      }
    } catch (error) {
      failed += 1;
      console.warn(`[sidecar] activity ${activity?.id || 'unknown'} failed: ${error.message}`);
    }
  }

  console.log(
    `[sidecar] done generated=${generated} uploaded=${uploaded} skipped_existing=${skippedExisting} skipped_no_gps=${skippedNoGps} failed=${failed}`
  );
}

run().catch((error) => {
  console.error(`[sidecar] fatal: ${error?.message || error}`);
  process.exitCode = 1;
});
