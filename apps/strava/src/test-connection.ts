#!/usr/bin/env tsx

/**
 * Test Strava API connection
 */

import StravaAPIService from './services/stravaAPI';

async function testConnection() {
  console.log('🧪 Testing Strava API connection...\n');

  try {
    const strava = new StravaAPIService();

    // Test 1: Get athlete info
    console.log('1️⃣ Fetching athlete information...');
    const athlete = await strava.getAthlete();
    console.log(`   ✅ Athlete: ${athlete.firstname} ${athlete.lastname} (@${athlete.username})`);
    console.log(`   📍 Location: ${athlete.city}, ${athlete.country}`);
    console.log(`   ⚖️  Weight: ${athlete.weight} kg\n`);

    // Test 2: Get recent activities (just first page)
    console.log('2️⃣ Fetching recent activities (first 5)...');
    const activities = await strava.getActivities(1, 5);
    console.log(`   ✅ Found ${activities.length} recent activities:\n`);

    activities.forEach((activity, index) => {
      const distanceKm = (activity.distance / 1000).toFixed(2);
      const timeMin = Math.floor(activity.moving_time / 60);
      const date = new Date(activity.start_date).toLocaleDateString('de-DE');
      console.log(`   ${index + 1}. [${activity.type}] ${activity.name}`);
      console.log(`      📅 ${date} | 📏 ${distanceKm} km | ⏱️  ${timeMin} min`);
    });

    // Test 3: Get athlete stats
    console.log('\n3️⃣ Fetching athlete statistics...');
    const stats = await strava.getAthleteStats(athlete.id);
    const allRideKm = (stats.all_ride_totals.distance / 1000).toFixed(0);
    const allRunKm = (stats.all_run_totals.distance / 1000).toFixed(0);
    console.log(`   🚴 All-time Rides: ${stats.all_ride_totals.count} rides, ${allRideKm} km`);
    console.log(`   🏃 All-time Runs: ${stats.all_run_totals.count} runs, ${allRunKm} km`);

    console.log('\n✅ All tests passed! Strava API connection is working! 🎉');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testConnection();
