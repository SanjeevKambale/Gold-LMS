// activityLogger.ts — now backed by SQL database
// Delegates all activity logging/querying to the activityService DB module.

import { ActivityLog, ActivityType, User } from '../types';
import {
  logActivity as dbLogActivity,
  getActivityLogs as dbGetActivityLogs,
  getActivityLogsByUser as dbGetActivityLogsByUser,
  getActivityLogsByDateRange as dbGetActivityLogsByDateRange,
  getStaffLoginHistory as dbGetStaffLoginHistory,
  getMonthlyReport as dbGetMonthlyReport,
  clearLogs as dbClearLogs,
} from './db/activityService';

/**
 * Fires off the log mutation asynchronously in the background.
 * Signature remains synchronous so UI calls do not block.
 */
export const logActivity = (
  user: User,
  activityType: ActivityType,
  description: string,
  details?: string
): void => {
  dbLogActivity(user, activityType, description, details).catch((err) => {
    console.warn("Background logActivity failed:", err);
  });
};

export const getActivityLogs = async (): Promise<ActivityLog[]> => {
  try {
    return await dbGetActivityLogs();
  } catch {
    return [];
  }
};

export const getActivityLogsByUser = async (userId: string): Promise<ActivityLog[]> => {
  try {
    return await dbGetActivityLogsByUser(userId);
  } catch {
    return [];
  }
};

export const getActivityLogsByDateRange = async (startDate: string, endDate: string): Promise<ActivityLog[]> => {
  try {
    return await dbGetActivityLogsByDateRange(startDate, endDate);
  } catch {
    return [];
  }
};

export const getActivityLogsByType = async (activityType: ActivityType): Promise<ActivityLog[]> => {
  try {
    const logs = await getActivityLogs();
    return logs.filter(log => log.activityType === activityType);
  } catch {
    return [];
  }
};

export const getMonthlyReport = async (userId: string, year: number, month: number): Promise<ActivityLog[]> => {
  try {
    return await dbGetMonthlyReport(userId, year, month);
  } catch {
    return [];
  }
};

export const getStaffLoginHistory = async (): Promise<ActivityLog[]> => {
  try {
    return await dbGetStaffLoginHistory();
  } catch {
    return [];
  }
};

export const clearActivityLogs = async (): Promise<void> => {
  try {
    await dbClearLogs();
  } catch (err) {
    console.error("Failed to clear logs:", err);
  }
};
