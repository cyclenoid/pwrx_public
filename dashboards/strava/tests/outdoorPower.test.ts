import test from 'node:test'
import assert from 'node:assert/strict'
import { canAssess } from '../src/features/outdoorPower/types'

const ride = { strava_activity_id: -1, type: 'Ride', streams: { latlng: [[50, 8], [50.001, 8], [50.002, 8]] as [number, number][] } }
test('the comparison card only appears for moving outdoor rides and runs', () => {
  assert.equal(canAssess(ride), true)
  assert.equal(canAssess({ ...ride, type: 'Run', sport_type: 'TrailRun' }), true)
  for (const activity of [{ ...ride, type: 'VirtualRide' }, { ...ride, sport_type: 'VirtualRide' },
    { ...ride, sport_type: 'VirtualRun', type: 'Run' }, { ...ride, trainer: true }, { ...ride, indoor: true },
    { ...ride, type: 'Swim' }, { ...ride, sport_type: 'EBikeRide' }, { ...ride, device_name: 'Zwift' },
    { ...ride, streams: undefined }, { ...ride, streams: { latlng: [[50, 8], [50, 8], [50, 8]] as [number, number][] } },
  ]) assert.equal(canAssess(activity), false)
})
