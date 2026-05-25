// auth.ts — now backed by SQL database
// The in-memory MOCK_USERS array is replaced by the authService DB functions.
// localStorage is still used only for the current session (logged-in user token).

import { User } from '../types';
import { authenticateUser as dbAuthenticateUser, registerUser as dbRegisterUser } from './db/authService';

// Both functions are now async (password hashing via Web Crypto API)
export { dbAuthenticateUser as authenticateUser, dbRegisterUser as registerUser };

export const saveUserToStorage = (user: User) => {
  localStorage.setItem('currentUser', JSON.stringify(user));
};

export const getUserFromStorage = (): User | null => {
  const userStr = localStorage.getItem('currentUser');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
};

export const clearUserFromStorage = () => {
  localStorage.removeItem('currentUser');
};
