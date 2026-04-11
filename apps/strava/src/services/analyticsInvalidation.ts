type AnalyticsInvalidationHandler = (reason: string) => void;

let handler: AnalyticsInvalidationHandler | null = null;
let importDebounceTimer: NodeJS.Timeout | null = null;

const IMPORT_INVALIDATION_DEBOUNCE_MS = 1500;

export const registerAnalyticsInvalidationHandler = (
  nextHandler: AnalyticsInvalidationHandler
): void => {
  handler = nextHandler;
};

export const notifyAnalyticsDataChanged = (reason: string = 'manual'): void => {
  handler?.(reason);
};

export const notifyImportedDataChanged = (reason: string = 'import'): void => {
  if (!handler) return;

  if (importDebounceTimer) {
    clearTimeout(importDebounceTimer);
  }

  importDebounceTimer = setTimeout(() => {
    importDebounceTimer = null;
    handler?.(reason);
  }, IMPORT_INVALIDATION_DEBOUNCE_MS);
};
