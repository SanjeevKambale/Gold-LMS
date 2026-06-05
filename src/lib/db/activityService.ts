import { ActivityLog, ActivityType, User } from '../../types';
import { supabase } from '../supabaseClient';
import { cachedActivityLogs, syncWrite, getDB, saveDB } from '../database';

export async function logActivity(
  user: User,
  activityType: ActivityType,
  description: string,
  details?: string
): Promise<ActivityLog> {
  const timestamp = new Date().toISOString();
  const id = `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logRow: ActivityLog = {
    id,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    activityType,
    description,
    details,
    timestamp,
  };

  // 1. Sync to cache synchronously (prepend to show latest first)
  cachedActivityLogs.unshift(logRow);

  // 2. Sync locally and to Supabase
  const payload = {
    id,
    user_id: user.id,
    user_name: user.name,
    user_role: user.role,
    activity_type: activityType,
    description,
    details: details || null,
    timestamp,
  };
  syncWrite('activity_logs', 'insert', id, payload);

  return logRow;
}

export function getActivityLogs(): ActivityLog[] {
  return cachedActivityLogs;
}

export function getActivityLogsByUser(userId: string): ActivityLog[] {
  return cachedActivityLogs.filter(log => log.userId === userId);
}

export function getActivityLogsByDateRange(startDate: string, endDate: string): ActivityLog[] {
  const safeEnd = endDate.split('T')[0] + 'T23:59:59.999Z';
  return cachedActivityLogs.filter(log => log.timestamp >= startDate && log.timestamp <= safeEnd);
}

export function getStaffLoginHistory(): ActivityLog[] {
  return cachedActivityLogs.filter(log => 
    (log.activityType === 'login' || log.activityType === 'logout') && log.userRole === 'staff'
  );
}

export function getMonthlyReport(userId: string, year: number, month: number): ActivityLog[] {
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 0, 23, 59, 59).toISOString();
  return cachedActivityLogs.filter(log => 
    log.userId === userId && log.timestamp >= start && log.timestamp <= end
  );
}

export async function clearLogs(): Promise<void> {
  // 1. Clear cache synchronously
  cachedActivityLogs.length = 0;

  // 2. Clear SQLite locally
  try {
    const localDb = getDB();
    localDb.run("DELETE FROM activity_logs");
    saveDB();
  } catch (err) {
    console.error("Failed to clear local SQLite activity logs:", err);
  }

  // 3. Delete in Supabase in background
  supabase
    .from('activity_logs')
    .delete()
    .neq('id', 'placeholder')
    .then(({ error }) => {
      if (error) console.error('Failed to clear logs in Supabase background:', error.message);
    });
}
