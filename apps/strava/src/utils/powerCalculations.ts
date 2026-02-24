/**
 * Power Calculation Utilities
 *
 * Functions for calculating advanced power metrics:
 * - Normalized Power (NP): (average of (rolling 30s average)^4)^0.25
 * - Intensity Factor (IF): NP / FTP
 * - Training Stress Score (TSS): (seconds × NP × IF) / (FTP × 3600) × 100
 */

export interface PowerMetrics {
  normalized_power: number | null;
  intensity_factor: number | null;
  training_stress_score: number | null;
  average_power: number | null;
  max_power: number | null;
  duration_seconds: number;
}

/**
 * Calculate Normalized Power (NP) from power stream data
 *
 * NP Algorithm:
 * 1. Calculate 30-second rolling average of power
 * 2. Raise each value to the 4th power
 * 3. Take average of all raised values
 * 4. Take 4th root of that average
 *
 * @param powerData Array of power values (watts)
 * @returns Normalized Power in watts, or null if insufficient data
 */
export function calculateNormalizedPower(powerData: number[]): number | null {
  if (!powerData || powerData.length < 30) {
    return null; // Need at least 30 seconds of data
  }

  // Step 1: Calculate 30-second rolling averages
  const rollingAverages: number[] = [];
  const windowSize = 30; // 30 seconds (assuming 1 sample per second)

  for (let i = 0; i <= powerData.length - windowSize; i++) {
    const window = powerData.slice(i, i + windowSize);
    const avg = window.reduce((sum, val) => sum + val, 0) / windowSize;
    rollingAverages.push(avg);
  }

  if (rollingAverages.length === 0) {
    return null;
  }

  // Step 2 & 3: Raise to 4th power and calculate average
  const raisedValues = rollingAverages.map(avg => Math.pow(avg, 4));
  const avgRaised = raisedValues.reduce((sum, val) => sum + val, 0) / raisedValues.length;

  // Step 4: Take 4th root
  const normalizedPower = Math.pow(avgRaised, 0.25);

  return Math.round(normalizedPower);
}

/**
 * Calculate Intensity Factor (IF)
 * IF = Normalized Power / FTP
 *
 * @param normalizedPower Normalized Power in watts
 * @param ftp Functional Threshold Power in watts
 * @returns Intensity Factor (0-2+), or null if FTP not available
 */
export function calculateIntensityFactor(
  normalizedPower: number,
  ftp: number | null
): number | null {
  if (!normalizedPower || !ftp || ftp === 0) {
    return null;
  }

  const intensityFactor = normalizedPower / ftp;
  return Math.round(intensityFactor * 1000) / 1000; // Round to 3 decimal places
}

/**
 * Calculate Training Stress Score (TSS)
 * TSS = (seconds × NP × IF) / (FTP × 3600) × 100
 *
 * @param durationSeconds Activity duration in seconds
 * @param normalizedPower Normalized Power in watts
 * @param intensityFactor Intensity Factor
 * @param ftp Functional Threshold Power in watts
 * @returns Training Stress Score, or null if insufficient data
 */
export function calculateTrainingStressScore(
  durationSeconds: number,
  normalizedPower: number,
  intensityFactor: number,
  ftp: number | null
): number | null {
  if (!normalizedPower || !intensityFactor || !ftp || ftp === 0) {
    return null;
  }

  const tss = (durationSeconds * normalizedPower * intensityFactor) / (ftp * 3600) * 100;
  return Math.round(tss * 10) / 10; // Round to 1 decimal place
}

/**
 * Calculate all power metrics for an activity
 *
 * @param powerData Array of power values (watts)
 * @param durationSeconds Activity duration in seconds
 * @param ftp Functional Threshold Power in watts (optional)
 * @returns Complete power metrics object
 */
export function calculatePowerMetrics(
  powerData: number[],
  durationSeconds: number,
  ftp: number | null = null
): PowerMetrics {
  if (!powerData || powerData.length === 0) {
    return {
      normalized_power: null,
      intensity_factor: null,
      training_stress_score: null,
      average_power: null,
      max_power: null,
      duration_seconds: durationSeconds,
    };
  }

  // Calculate basic stats
  const averagePower = Math.round(
    powerData.reduce((sum, val) => sum + val, 0) / powerData.length
  );
  const maxPower = Math.max(...powerData);

  // Calculate Normalized Power
  const normalizedPower = calculateNormalizedPower(powerData);

  // Calculate Intensity Factor
  const intensityFactor = normalizedPower && ftp
    ? calculateIntensityFactor(normalizedPower, ftp)
    : null;

  // Calculate Training Stress Score
  const trainingStressScore = normalizedPower && intensityFactor && ftp
    ? calculateTrainingStressScore(durationSeconds, normalizedPower, intensityFactor, ftp)
    : null;

  return {
    normalized_power: normalizedPower,
    intensity_factor: intensityFactor,
    training_stress_score: trainingStressScore,
    average_power: averagePower,
    max_power: maxPower,
    duration_seconds: durationSeconds,
  };
}

/**
 * Calculate Variability Index (VI)
 * VI = Normalized Power / Average Power
 *
 * A measure of how variable the power output was:
 * - VI = 1.00-1.05: Very steady (time trial, flat ride)
 * - VI = 1.05-1.10: Steady (rolling terrain)
 * - VI = 1.10-1.15: Variable (hilly or interval workout)
 * - VI > 1.15: Very variable (racing, criterium)
 *
 * @param normalizedPower Normalized Power in watts
 * @param averagePower Average Power in watts
 * @returns Variability Index, or null if insufficient data
 */
export function calculateVariabilityIndex(
  normalizedPower: number,
  averagePower: number
): number | null {
  if (!normalizedPower || !averagePower || averagePower === 0) {
    return null;
  }

  const vi = normalizedPower / averagePower;
  return Math.round(vi * 100) / 100; // Round to 2 decimal places
}
