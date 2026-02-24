/**
 * VAM (Velocità Ascensionale Media) Calculation Service
 *
 * VAM represents the rate of vertical ascent in meters per hour.
 * This implementation correctly calculates VAM by:
 * 1. Analyzing altitude and time streams
 * 2. Identifying climbing segments (positive elevation gain)
 * 3. Filtering for significant climbs (>25m elevation gain)
 * 4. Calculating VAM only for time spent climbing
 */

interface ClimbSegment {
  startIndex: number;
  endIndex: number;
  elevationGain: number;
  duration: number; // in seconds
}

interface VAMResult {
  vam: number; // meters per hour
  totalClimbingTime: number; // seconds
  totalElevationGain: number; // meters
  climbSegments: ClimbSegment[];
}

/**
 * Calculate VAM from altitude and time stream data
 * @param altitudeData Array of altitude values in meters
 * @param timeData Array of time values in seconds (relative to activity start)
 * @param minClimbHeight Minimum elevation gain (meters) to consider a segment as a climb (default: 25m)
 * @returns VAMResult object with calculated VAM and climbing segments
 */
export function calculateVAM(
  altitudeData: number[],
  timeData: number[],
  minClimbHeight: number = 25
): VAMResult | null {
  if (!altitudeData || !timeData || altitudeData.length === 0 || timeData.length === 0) {
    return null;
  }

  if (altitudeData.length !== timeData.length) {
    console.warn('Altitude and time data arrays have different lengths');
    return null;
  }

  const climbSegments: ClimbSegment[] = [];
  let currentClimbStart: number | null = null;
  let currentClimbStartAltitude = 0;
  let lowestPointInClimb = 0;
  let lowestPointIndex = 0;

  // Iterate through the altitude profile to identify climbing segments
  for (let i = 0; i < altitudeData.length; i++) {
    const altitude = altitudeData[i];

    if (currentClimbStart === null) {
      // Not currently in a climb - look for start of climb
      if (i < altitudeData.length - 1 && altitudeData[i + 1] > altitude) {
        // Start of potential climb
        currentClimbStart = i;
        currentClimbStartAltitude = altitude;
        lowestPointInClimb = altitude;
        lowestPointIndex = i;
      }
    } else {
      // Currently in a climb
      // Track the lowest point in case we descend
      if (altitude < lowestPointInClimb) {
        lowestPointInClimb = altitude;
        lowestPointIndex = i;
      }

      // Check if this is the end of the climb
      const isEndOfData = i === altitudeData.length - 1;
      const isDescending = i < altitudeData.length - 1 && altitudeData[i + 1] < altitude;
      const significantDescent = altitude - lowestPointInClimb > 10; // More than 10m descent

      if (isEndOfData || (isDescending && significantDescent)) {
        // End of climb - calculate total elevation gain from lowest to highest
        const elevationGain = altitude - currentClimbStartAltitude;

        if (elevationGain >= minClimbHeight) {
          // This is a significant climb
          const duration = timeData[i] - timeData[currentClimbStart];

          if (duration > 0) {
            climbSegments.push({
              startIndex: currentClimbStart,
              endIndex: i,
              elevationGain,
              duration
            });
          }
        }

        // Reset for next climb
        currentClimbStart = null;
      }
    }
  }

  // Calculate totals
  const totalElevationGain = climbSegments.reduce((sum, seg) => sum + seg.elevationGain, 0);
  const totalClimbingTime = climbSegments.reduce((sum, seg) => sum + seg.duration, 0);

  // Calculate VAM (meters per hour)
  const vam = totalClimbingTime > 0 ? (totalElevationGain * 3600) / totalClimbingTime : 0;

  return {
    vam: Math.round(vam),
    totalClimbingTime,
    totalElevationGain: Math.round(totalElevationGain),
    climbSegments
  };
}

/**
 * Calculate VAM from activity streams stored in database
 * @param streams Array of activity stream objects from database
 * @param minClimbHeight Minimum elevation gain to consider (default: 25m)
 * @returns VAMResult or null if data is insufficient
 */
export function calculateVAMFromStreams(
  streams: Array<{ stream_type: string; data: any }>,
  minClimbHeight: number = 25
): VAMResult | null {
  // Find altitude and time streams
  const altitudeStream = streams.find(s => s.stream_type === 'altitude');
  const timeStream = streams.find(s => s.stream_type === 'time');

  if (!altitudeStream || !timeStream) {
    return null;
  }

  // Extract data arrays
  const altitudeData = Array.isArray(altitudeStream.data) ? altitudeStream.data : [];
  const timeData = Array.isArray(timeStream.data) ? timeStream.data : [];

  return calculateVAM(altitudeData, timeData, minClimbHeight);
}
