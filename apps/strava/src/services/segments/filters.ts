export type SegmentSourceFilter = 'all' | 'local' | 'strava';
export type SegmentTypeFilter = 'sync' | 'auto' | 'manual';

const ALL_SEGMENT_TYPES: SegmentTypeFilter[] = ['sync', 'auto', 'manual'];

export const parseSegmentSourceFilter = (raw: unknown): SegmentSourceFilter => {
  const normalized = String(raw ?? 'all').trim().toLowerCase();
  if (normalized === 'local' || normalized === 'strava') {
    return normalized;
  }
  return 'all';
};

export const parseSegmentTypeFilters = (raw: unknown): SegmentTypeFilter[] => {
  const parsed = Array.from(new Set(
    String(raw ?? '')
      .toLowerCase()
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is SegmentTypeFilter => (
        value === 'sync' || value === 'auto' || value === 'manual'
      ))
  ));

  return parsed.length > 0 ? parsed : [...ALL_SEGMENT_TYPES];
};

export const buildSegmentTypeWhereClause = (
  segmentTypes: SegmentTypeFilter[],
  tableAlias = 's'
): string => {
  const hasAllTypes = ALL_SEGMENT_TYPES.every((type) => segmentTypes.includes(type));
  if (hasAllTypes) return '';

  const sourceColumn = `${tableAlias}.source`;
  const autoColumn = `${tableAlias}.is_auto_climb`;
  const clauses: string[] = [];

  if (segmentTypes.includes('sync')) {
    clauses.push(`${sourceColumn} = 'strava'`);
  }
  if (segmentTypes.includes('auto')) {
    clauses.push(`(${sourceColumn} = 'local' AND COALESCE(${autoColumn}, true) = true)`);
  }
  if (segmentTypes.includes('manual')) {
    clauses.push(`(${sourceColumn} = 'local' AND COALESCE(${autoColumn}, false) = false)`);
  }

  return clauses.length > 0 ? `(${clauses.join(' OR ')})` : '';
};

export const buildSegmentSourceAndTypeFilters = (
  source: SegmentSourceFilter,
  segmentTypes: SegmentTypeFilter[],
  options?: {
    tableAlias?: string;
    paramOffset?: number;
  }
): { clauses: string[]; params: string[] } => {
  const tableAlias = options?.tableAlias ?? 's';
  const paramOffset = options?.paramOffset ?? 0;
  const clauses: string[] = [];
  const params: string[] = [];

  if (source !== 'all') {
    params.push(source);
    clauses.push(`${tableAlias}.source = $${paramOffset + params.length}`);
  }

  const typeWhere = buildSegmentTypeWhereClause(segmentTypes, tableAlias);
  if (typeWhere) {
    clauses.push(typeWhere);
  }

  return { clauses, params };
};
