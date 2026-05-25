import { ActivityLog, ActivityType, User } from '../../types';
import { getDB, saveDB } from '../database';

const ACTIVITY_LOG_LIMIT = 1000;

function rowToActivityLog(row: any[]): ActivityLog {
  return {
    id: row[0] as string,
    userId: row[1] as string,
    userName: row[2] as string,
    userRole: row[3] as 'admin' | 'staff',
    activityType: row[4] as ActivityType,
    description: row[5] as string,
    details: row[6] as string | undefined,
    timestamp: row[7] as string,
  };
}

export function logActivity(
  user: User,
  activityType: ActivityType,
  description: string,
  details?: string
): ActivityLog {
  const timestamp = new Date().toISOString();
  const id = `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const db = getDB();
  db.run(
    `INSERT INTO activity_logs (id, user_id, user_name, user_role, activity_type, description, details, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, user.id, user.name, user.role, activityType, description, details ?? null, timestamp]
  );
  saveDB();

  return {
    id,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    activityType,
    description,
    details,
    timestamp,
  };
}

export function getActivityLogs(): ActivityLog[] {
  const db = getDB();
  const result = db.exec(
    `SELECT id, user_id, user_name, user_role, activity_type, description, details, timestamp FROM activity_logs ORDER BY timestamp DESC LIMIT ${ACTIVITY_LOG_LIMIT}`
  );
  if (!result.length) return [];
  return result[0].values.map(rowToActivityLog);
}

export function getActivityLogsByUser(userId: string): ActivityLog[] {
  const db = getDB();
  const result = db.exec(
    'SELECT id, user_id, user_name, user_role, activity_type, description, details, timestamp FROM activity_logs WHERE user_id=? ORDER BY timestamp DESC',
    [userId]
  );
  if (!result.length) return [];
  return result[0].values.map(rowToActivityLog);
}

export function getActivityLogsByDateRange(startDate: string, endDate: string): ActivityLog[] {
  const db = getDB();
  // Strip any existing time portion before appending end-of-day time (#8 fix)
  const safeEnd = endDate.split('T')[0] + 'T23:59:59.999Z';
  const result = db.exec(
    `SELECT id, user_id, user_name, user_role, activity_type, description, details, timestamp
     FROM activity_logs
     WHERE timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp DESC`,
    [startDate, safeEnd]
  );
  if (!result.length) return [];
  return result[0].values.map(rowToActivityLog);
}

export function getStaffLoginHistory(): ActivityLog[] {
  const db = getDB();
  const result = db.exec(
    `SELECT id, user_id, user_name, user_role, activity_type, description, details, timestamp
     FROM activity_logs
     WHERE (activity_type='login' OR activity_type='logout') AND user_role='staff'
     ORDER BY timestamp DESC`
  );
  if (!result.length) return [];
  return result[0].values.map(rowToActivityLog);
}

export function getMonthlyReport(userId: string, year: number, month: number): ActivityLog[] {
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 0, 23, 59, 59).toISOString();
  const db = getDB();
  const result = db.exec(
    `SELECT id, user_id, user_name, user_role, activity_type, description, details, timestamp
     FROM activity_logs
     WHERE user_id=? AND timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp DESC`,
    [userId, start, end]
  );
  if (!result.length) return [];
  return result[0].values.map(rowToActivityLog);
}
export function clearLogs(): void {
  const db = getDB();
  db.run('DELETE FROM activity_logs');
  saveDB();
}
