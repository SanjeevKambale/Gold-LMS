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
export const logActivity = (
  user: User,
  activityType: ActivityType,
  description: string,
  details?: string
): void => {
  try {
    dbLogActivity(user, activityType, description, details);
  } catch {
    // DB may not be ready on very first call; silently ignore
  }
};

export const getActivityLogs = (): ActivityLog[] => {
  try {
    return dbGetActivityLogs();
  } catch {
    return [];
  }
};

export const getActivityLogsByUser = (userId: string): ActivityLog[] => {
  try {
    return dbGetActivityLogsByUser(userId);
  } catch {
    return [];
  }
};

export const getActivityLogsByDateRange = (startDate: string, endDate: string): ActivityLog[] => {
  try {
    return dbGetActivityLogsByDateRange(startDate, endDate);
  } catch {
    return [];
  }
};

export const getActivityLogsByType = (activityType: ActivityType): ActivityLog[] => {
  try {
    return getActivityLogs().filter(log => log.activityType === activityType);
  } catch {
    return [];
  }
};

export const getMonthlyReport = (userId: string, year: number, month: number): ActivityLog[] => {
  try {
    return dbGetMonthlyReport(userId, year, month);
  } catch {
    return [];
  }
};

export const getStaffLoginHistory = (): ActivityLog[] => {
  try {
    return dbGetStaffLoginHistory();
  } catch {
    return [];
  }
};

export const clearActivityLogs = (): void => {
  try {
    dbClearLogs();
  } catch (err) {
    console.error("Failed to clear logs:", err);
  }
};
