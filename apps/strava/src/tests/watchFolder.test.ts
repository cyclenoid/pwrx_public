import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

type ImportResultStatus = 'done' | 'duplicate' | 'failed';

const GPX_SAMPLE = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="52.5" lon="13.4"><time>2026-02-08T10:00:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const withMockedWatchFolderDeps = async (
  importStatus: ImportResultStatus,
  run: (ctx: { WatchFolderService: any; importCallCount: () => number }) => Promise<void>
) => {
  const moduleAny = Module as any;
  const originalLoad = moduleAny._load;
  const watchFolderModulePath = require.resolve('../services/import/watchFolder');
  const importCalls: Array<{ fileName: string }> = [];

  class MockDatabaseService {
    async close() {
      return;
    }
  }

  const importSingleFile = async (_db: any, file: { originalname: string }) => {
    importCalls.push({ fileName: file.originalname });
    return {
      status: importStatus,
      message: `mock-${importStatus}`,
    };
  };

  moduleAny._load = function patchedLoad(request: string, parent: any, isMain: boolean) {
    if (request === '../database') return MockDatabaseService;
    if (request === './service') return { importSingleFile };
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[watchFolderModulePath];

  try {
    const { WatchFolderService } = require('../services/import/watchFolder');
    await run({
      WatchFolderService,
      importCallCount: () => importCalls.length,
    });
  } finally {
    moduleAny._load = originalLoad;
    delete require.cache[watchFolderModulePath];
  }
};

const withWatchEnv = async (
  folderPath: string,
  stableChecks: number,
  run: () => Promise<void>
) => {
  const oldEnabled = process.env.WATCH_FOLDER_ENABLED;
  const oldPath = process.env.WATCH_FOLDER_PATH;
  const oldStableChecks = process.env.WATCH_FOLDER_STABLE_CHECKS;

  process.env.WATCH_FOLDER_ENABLED = 'true';
  process.env.WATCH_FOLDER_PATH = folderPath;
  process.env.WATCH_FOLDER_STABLE_CHECKS = String(stableChecks);

  try {
    await run();
  } finally {
    if (oldEnabled === undefined) delete process.env.WATCH_FOLDER_ENABLED;
    else process.env.WATCH_FOLDER_ENABLED = oldEnabled;

    if (oldPath === undefined) delete process.env.WATCH_FOLDER_PATH;
    else process.env.WATCH_FOLDER_PATH = oldPath;

    if (oldStableChecks === undefined) delete process.env.WATCH_FOLDER_STABLE_CHECKS;
    else process.env.WATCH_FOLDER_STABLE_CHECKS = oldStableChecks;
  }
};

test('Watchfolder imports only after stable checks and skips unchanged files afterwards', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watch-folder-'));
  const filePath = path.join(tempDir, 'stable.gpx');
  await fs.writeFile(filePath, GPX_SAMPLE, 'utf8');

  try {
    await withWatchEnv(tempDir, 2, async () => {
      await withMockedWatchFolderDeps('done', async ({ WatchFolderService, importCallCount }) => {
        const service = new WatchFolderService();
        const scanOnce = (service as any).scanOnce.bind(service);

        await scanOnce();
        await scanOnce();
        assert.equal(importCallCount(), 0);

        await scanOnce();
        assert.equal(importCallCount(), 1);

        await scanOnce();
        assert.equal(importCallCount(), 1);

        const status = service.getStatus();
        assert.equal(status.stats.importedFiles, 1);
        assert.equal(status.stats.duplicates, 0);
        assert.equal(status.stats.failed, 0);
      });
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('Watchfolder tracks duplicate imports when importer reports duplicate', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watch-folder-dup-'));
  const filePath = path.join(tempDir, 'duplicate.gpx');
  await fs.writeFile(filePath, GPX_SAMPLE, 'utf8');

  try {
    await withWatchEnv(tempDir, 1, async () => {
      await withMockedWatchFolderDeps('duplicate', async ({ WatchFolderService, importCallCount }) => {
        const service = new WatchFolderService();
        const scanOnce = (service as any).scanOnce.bind(service);

        await scanOnce();
        await scanOnce();

        assert.equal(importCallCount(), 1);
        const status = service.getStatus();
        assert.equal(status.stats.importedFiles, 0);
        assert.equal(status.stats.duplicates, 1);
        assert.equal(status.stats.failed, 0);
      });
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
