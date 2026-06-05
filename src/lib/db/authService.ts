import { User } from '../../types';
import { supabase } from '../supabaseClient';
import { cachedUsers, syncWrite, isOnline, queryRows } from '../database';

// ─── Password Hashing (SHA-256 via Web Crypto API) ────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── User Authentication & Registration ───

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  try {
    const hashed = await hashPassword(password);
    const online = await isOnline();

    if (online) {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, name, role, email, created_at')
        .eq('username', username)
        .eq('password', hashed)
        .maybeSingle();

      if (error) {
        console.error('Authentication query failed:', error);
        return null;
      }
      
      if (!data) return null;
      
      return {
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role as 'admin' | 'staff',
        email: data.email,
        createdAt: data.created_at,
      };
    } else {
      // Offline mode: query credentials directly from local SQLite
      const rows = queryRows(
        "SELECT id, username, name, role, email, created_at FROM users WHERE username = ? AND password = ?",
        [username, hashed]
      );
      if (rows.length === 0) return null;
      const data = rows[0];
      return {
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role as 'admin' | 'staff',
        email: data.email,
        createdAt: data.created_at
      };
    }
  } catch (err) {
    console.error('Authentication exception:', err);
    return null;
  }
}

export async function registerUser(
  username: string,
  password: string,
  name: string,
  email: string,
  role: 'admin' | 'staff'
): Promise<User | null> {
  try {
    // 1. Check if the username is already registered in the system (check cache first!)
    const usernameTaken = cachedUsers.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (usernameTaken) {
      console.warn(`Registration rejected: Username "${username}" is already taken.`);
      return null;
    }

    const id = crypto.randomUUID();
    const hashed = await hashPassword(password);
    const createdAt = new Date().toISOString().split('T')[0];
    const newUser: User = { id, username, name, role, email, createdAt };

    // 2. Add to cache synchronously
    cachedUsers.push(newUser);

    // 3. Sync locally and to Supabase
    const payload = {
      id,
      username,
      password: hashed,
      name,
      role,
      email,
      created_at: createdAt
    };
    syncWrite('users', 'insert', id, payload);

    return newUser;
  } catch (err) {
    console.error('Registration exception:', err);
    return null;
  }
}

export function getAllUsers(): User[] {
  return cachedUsers;
}

export function deleteUser(id: string): void {
  // 1. Remove from cache synchronously
  const idx = cachedUsers.findIndex(u => u.id === id);
  if (idx !== -1) {
    cachedUsers.splice(idx, 1);
  }

  // 2. Sync deletion to Supabase and SQLite
  syncWrite('users', 'delete', id);
}

/**
 * Looks up a user by username and verifies that the email matches.
 */
export function getUserByUsernameAndEmail(username: string, email: string): User | null {
  const user = cachedUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return null;

  // Direct case-insensitive email matching check
  if (user.email.toLowerCase() !== email.toLowerCase()) {
    return null;
  }

  return user;
}

/**
 * Resets the password for a user.
 */
export async function resetPassword(userId: string, newPassword: string): Promise<void> {
  try {
    const hashed = await hashPassword(newPassword);
    
    // Sync update to SQLite and Supabase
    const payload = { password: hashed };
    syncWrite('users', 'update', userId, payload);
  } catch (err) {
    console.error('resetPassword exception:', err);
    throw err;
  }
}
