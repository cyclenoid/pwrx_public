import * as fs from 'fs';
import * as path from 'path';
import DatabaseService from './database';

export class CSVExporter {
  private db: DatabaseService;
  private exportPath: string;

  constructor() {
    this.db = new DatabaseService();
    this.exportPath = process.env.CSV_EXPORT_PATH || './exports';
  }

  /**
   * Export all data to CSV files
   */
  async exportAll(): Promise<void> {
    console.log('📤 Exporting data to CSV...\n');

    try {
      // Create export directory if it doesn't exist
      if (!fs.existsSync(this.exportPath)) {
        fs.mkdirSync(this.exportPath, { recursive: true });
      }

      // Export activities
      await this.exportActivities();

      // Export monthly stats
      await this.exportMonthlyStats();

      // Export gear usage
      await this.exportGearUsage();

      console.log('\n✅ All exports completed successfully! 🎉\n');

    } catch (error: any) {
      console.error('❌ Export failed:', error.message);
      throw error;
    }
  }

  /**
   * Export all activities to CSV
   */
  async exportActivities(): Promise<void> {
    console.log('📊 Exporting activities...');

    const result = await this.db.query(`
      SELECT
        strava_activity_id,
        name,
        type,
        sport_type,
        start_date,
        distance / 1000 as distance_km,
        moving_time / 60 as moving_time_min,
        elapsed_time / 60 as elapsed_time_min,
        total_elevation_gain,
        average_speed * 3.6 as avg_speed_kmh,
        max_speed * 3.6 as max_speed_kmh,
        average_heartrate,
        max_heartrate,
        average_watts,
        max_watts,
        average_cadence,
        kilojoules,
        calories,
        gear_id
      FROM activities
      ORDER BY start_date DESC
    `);

    const csvPath = path.join(this.exportPath, 'activities.csv');
    const headers = [
      'Activity ID',
      'Name',
      'Type',
      'Sport Type',
      'Date',
      'Distance (km)',
      'Moving Time (min)',
      'Elapsed Time (min)',
      'Elevation Gain (m)',
      'Avg Speed (km/h)',
      'Max Speed (km/h)',
      'Avg Heart Rate',
      'Max Heart Rate',
      'Avg Power (W)',
      'Max Power (W)',
      'Avg Cadence',
      'Kilojoules',
      'Calories',
      'Gear ID',
    ].join(',');

    const rows = result.rows.map((row: any) => [
      row.strava_activity_id,
      `"${row.name?.replace(/"/g, '""') || ''}"`,
      row.type,
      row.sport_type,
      new Date(row.start_date).toISOString().split('T')[0],
      parseFloat(row.distance_km || 0).toFixed(2),
      Math.round(row.moving_time_min || 0),
      Math.round(row.elapsed_time_min || 0),
      Math.round(row.total_elevation_gain || 0),
      parseFloat(row.avg_speed_kmh || 0).toFixed(2),
      parseFloat(row.max_speed_kmh || 0).toFixed(2),
      Math.round(row.average_heartrate || 0),
      row.max_heartrate || '',
      Math.round(row.average_watts || 0),
      row.max_watts || '',
      parseFloat(row.average_cadence || 0).toFixed(1),
      parseFloat(row.kilojoules || 0).toFixed(0),
      Math.round(row.calories || 0),
      row.gear_id || '',
    ].join(','));

    const csv = [headers, ...rows].join('\n');
    fs.writeFileSync(csvPath, csv, 'utf8');

    console.log(`   ✅ Exported ${result.rows.length} activities to ${csvPath}`);
  }

  /**
   * Export monthly statistics
   */
  async exportMonthlyStats(): Promise<void> {
    console.log('📊 Exporting monthly statistics...');

    const result = await this.db.query(`
      SELECT
        TO_CHAR(start_date, 'YYYY-MM') as month,
        type,
        COUNT(*) as activity_count,
        SUM(distance) / 1000 as total_distance_km,
        SUM(moving_time) / 3600 as total_hours,
        SUM(total_elevation_gain) as total_elevation_m,
        AVG(average_speed) * 3.6 as avg_speed_kmh,
        AVG(average_heartrate) as avg_heartrate,
        AVG(average_watts) as avg_watts
      FROM activities
      GROUP BY TO_CHAR(start_date, 'YYYY-MM'), type
      ORDER BY month DESC, type
    `);

    const csvPath = path.join(this.exportPath, 'monthly_stats.csv');
    const headers = [
      'Month',
      'Type',
      'Activities',
      'Distance (km)',
      'Time (hours)',
      'Elevation (m)',
      'Avg Speed (km/h)',
      'Avg Heart Rate',
      'Avg Power (W)',
    ].join(',');

    const rows = result.rows.map((row: any) => [
      row.month,
      row.type,
      row.activity_count,
      parseFloat(row.total_distance_km || 0).toFixed(2),
      parseFloat(row.total_hours || 0).toFixed(2),
      Math.round(row.total_elevation_m || 0),
      parseFloat(row.avg_speed_kmh || 0).toFixed(2),
      Math.round(row.avg_heartrate || 0),
      Math.round(row.avg_watts || 0),
    ].join(','));

    const csv = [headers, ...rows].join('\n');
    fs.writeFileSync(csvPath, csv, 'utf8');

    console.log(`   ✅ Exported monthly stats to ${csvPath}`);
  }

  /**
   * Export gear usage statistics
   */
  async exportGearUsage(): Promise<void> {
    console.log('📊 Exporting gear usage...');

    const result = await this.db.query(`
      SELECT
        g.id,
        g.name,
        g.brand_name,
        g.model_name,
        g.type,
        g.distance / 1000 as total_distance_km,
        g.retired,
        COUNT(a.id) as activity_count,
        MIN(a.start_date) as first_use,
        MAX(a.start_date) as last_use
      FROM gear g
      LEFT JOIN activities a ON a.gear_id = g.id
      GROUP BY g.id, g.name, g.brand_name, g.model_name, g.type, g.distance, g.retired
      ORDER BY g.distance DESC
    `);

    const csvPath = path.join(this.exportPath, 'gear_usage.csv');
    const headers = [
      'Gear ID',
      'Name',
      'Brand',
      'Model',
      'Type',
      'Total Distance (km)',
      'Activities',
      'First Use',
      'Last Use',
      'Retired',
    ].join(',');

    const rows = result.rows.map((row: any) => [
      row.id,
      `"${row.name?.replace(/"/g, '""') || ''}"`,
      row.brand_name || '',
      row.model_name || '',
      row.type || '',
      parseFloat(row.total_distance_km || 0).toFixed(2),
      row.activity_count || 0,
      row.first_use ? new Date(row.first_use).toISOString().split('T')[0] : '',
      row.last_use ? new Date(row.last_use).toISOString().split('T')[0] : '',
      row.retired ? 'Yes' : 'No',
    ].join(','));

    const csv = [headers, ...rows].join('\n');
    fs.writeFileSync(csvPath, csv, 'utf8');

    console.log(`   ✅ Exported gear usage to ${csvPath}`);
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.db.close();
  }
}

export default CSVExporter;
