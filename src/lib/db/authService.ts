import { User } from '../../types';
import { getDB, saveDB } from '../database';

// ─── Password hashing (SHA-256 via Web Crypto API) ────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function rowToUser(row: any[]): User {
  return {
    id: row[0] as string,
    username: row[1] as string,
    name: row[3] as string,
    role: row[4] as 'admin' | 'staff',
    email: row[5] as string,
    createdAt: row[6] as string,
  };
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const db = getDB();
  const hashed = await hashPassword(password);
  const result = db.exec(
    'SELECT id, username, password, name, role, email, created_at FROM users WHERE username=? AND password=?',
    [username, hashed]
  );
  if (!result.length || !result[0].values.length) return null;
  return rowToUser(result[0].values[0]);
}

export async function registerUser(
  username: string,
  password: string,
  name: string,
  email: string,
  role: 'admin' | 'staff'
): Promise<User | null> {
  const db = getDB();
  // Check if username already exists
  const existing = db.exec('SELECT id FROM users WHERE username=?', [username]);
  if (existing.length && existing[0].values.length) return null;

  const id = crypto.randomUUID();
  const hashed = await hashPassword(password);
  const createdAt = new Date().toISOString().split('T')[0];
  db.run(
    'INSERT INTO users (id, username, password, name, role, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, username, hashed, name, role, email, createdAt]
  );
  saveDB();

  return { id, username, name, role, email, createdAt };
}

export function getAllUsers(): User[] {
  const db = getDB();
  const result = db.exec(
    'SELECT id, username, password, name, role, email, created_at FROM users ORDER BY created_at ASC'
  );
  if (!result.length) return [];
  return result[0].values.map(rowToUser);
}
export function deleteUser(id: string): void {
  const db = getDB();
  db.run('DELETE FROM users WHERE id=?', [id]);
  saveDB();
}

/**
 * Looks up a user by username and verifies the email matches.
 * Returns the user if found & email matches, otherwise null.
 */
export function getUserByUsernameAndEmail(username: string, email: string): User | null {
  const db = getDB();
  const result = db.exec(
    'SELECT id, username, password, name, role, email, created_at FROM users WHERE username=? AND LOWER(email)=LOWER(?)',
    [username, email]
  );
  if (!result.length || !result[0].values.length) return null;
  return rowToUser(result[0].values[0]);
}

/**
 * Resets the password for a user identified by their id.
 */
export async function resetPassword(userId: string, newPassword: string): Promise<void> {
  const db = getDB();
  const hashed = await hashPassword(newPassword);
  db.run('UPDATE users SET password=? WHERE id=?', [hashed, userId]);
  saveDB();
}
