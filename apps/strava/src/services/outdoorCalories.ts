type EnergyBasis = {
  kind: 'ride' | 'run'; watts: number; lowWatts: number; highWatts: number;
  metabolicWatts: number | null; seconds: number;
};

export function outdoorCalories(basis: EnergyBasis, originalCalories: unknown) {
  const original = typeof originalCalories === 'number' || (typeof originalCalories === 'string' && originalCalories.trim())
    ? Number(originalCalories) : NaN;
  const efficiency = basis.kind === 'ride' ? .22 : null;
  // Cycling uses crank work / assumed efficiency; running uses metabolic cost directly,
  // never the arbitrary 25% running-watt equivalent. No resting energy is added.
  const joules = basis.kind === 'ride' ? basis.watts * basis.seconds / efficiency!
    : (basis.metabolicWatts || 0) * basis.seconds;
  const low = basis.kind === 'ride' ? basis.lowWatts * basis.seconds / .25 : joules * .85;
  const high = basis.kind === 'ride' ? basis.highWatts * basis.seconds / .18 : joules * 1.2;
  return {
    modelVersion: 'pwrx-energy-1', method: basis.kind === 'ride' ? 'cycling-work' : 'running-cost',
    kcal: Math.round(joules / 4184), lowKcal: Math.round(low / 4184), highKcal: Math.round(high / 4184),
    originalKcal: Number.isFinite(original) && original >= 0 ? Math.round(original) : null,
    efficiency,
  };
}
