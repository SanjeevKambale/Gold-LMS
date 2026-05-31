export function getSystemWorkingDate(): string {
  const stored = localStorage.getItem('system_working_date');
  if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) {
    return stored;
  }
  return new Date().toISOString().split('T')[0];
}

export function isSystemBackdated(): boolean {
  const stored = localStorage.getItem('system_working_date');
  if (!stored) return false;
  const today = new Date().toISOString().split('T')[0];
  return stored !== today;
}

export function setSystemWorkingDate(date: string | null): void {
  if (date) {
    localStorage.setItem('system_working_date', date);
  } else {
    localStorage.removeItem('system_working_date');
  }
  // Dispatch custom storage event for sync
  window.dispatchEvent(new Event('storage'));
}
