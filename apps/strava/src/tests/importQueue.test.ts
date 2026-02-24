import test from 'node:test';
import assert from 'node:assert/strict';

type EnvPatch = Record<string, string | undefined>;

const serviceModulePath = require.resolve('../services/import/service');

const withFreshImportService = async (
  envPatch: EnvPatch,
  run: (serviceModule: any) => Promise<void> | void
) => {
  const previousValues: EnvPatch = {};

  for (const [key, value] of Object.entries(envPatch)) {
    previousValues[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  delete require.cache[serviceModulePath];

  try {
    const serviceModule = require('../services/import/service');
    await run(serviceModule);
  } finally {
    delete require.cache[serviceModulePath];
    for (const [key, value] of Object.entries(previousValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('Import queue retry delay is exponential and capped', async () => {
  await withFreshImportService(
    {
      IMPORT_QUEUE_RETRY_BASE_MS: '1000',
      IMPORT_QUEUE_RETRY_MAX_MS: '5000',
    },
    ({ computeImportQueueRetryDelayMs }) => {
      assert.equal(computeImportQueueRetryDelayMs(1), 1000);
      assert.equal(computeImportQueueRetryDelayMs(2), 2000);
      assert.equal(computeImportQueueRetryDelayMs(3), 4000);
      assert.equal(computeImportQueueRetryDelayMs(4), 5000);
      assert.equal(computeImportQueueRetryDelayMs(5), 5000);
    }
  );
});

test('Import queue retry delay respects minimum configuration bounds', async () => {
  await withFreshImportService(
    {
      IMPORT_QUEUE_RETRY_BASE_MS: '100',
      IMPORT_QUEUE_RETRY_MAX_MS: '200',
    },
    ({ computeImportQueueRetryDelayMs }) => {
      assert.equal(computeImportQueueRetryDelayMs(1), 250);
      assert.equal(computeImportQueueRetryDelayMs(6), 250);
    }
  );
});

test('Import queue alerts are emitted for thresholds and stale worker', async () => {
  await withFreshImportService(
    {
      IMPORT_QUEUE_ALERT_FAILED_24H: '3',
      IMPORT_QUEUE_ALERT_READY: '4',
    },
    ({ buildImportQueueAlerts }) => {
      const alerts = buildImportQueueAlerts(
        { failedLast24h: 3, ready: 4 },
        { stale: true, staleAfterMs: 60000 }
      );
      const codes = alerts.map((alert: { code: string }) => alert.code).sort();
      assert.deepEqual(codes, ['QUEUE_BACKLOG_READY', 'QUEUE_FAILED_24H', 'QUEUE_WORKER_STALE']);

      const none = buildImportQueueAlerts(
        { failedLast24h: 2, ready: 3 },
        { stale: false, staleAfterMs: 60000 }
      );
      assert.equal(none.length, 0);
    }
  );
});
