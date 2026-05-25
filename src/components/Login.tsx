import { useState } from 'react';
import { LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { authenticateUser, saveUserToStorage } from '../lib/auth';
import { adminExists } from '../lib/database';
import { User } from '../types';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  onSwitchToSignUp?: () => void;
  onForgotPassword?: () => void;
  onBack: () => void;
}

export function Login({ onLoginSuccess, onSwitchToSignUp, onForgotPassword, onBack }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Check if system is initialized
    if (!adminExists()) {
      setError('System is not initialized. Please create an admin account first.');
      if (onSwitchToSignUp) {
        setTimeout(onSwitchToSignUp, 2000);
      }
      return;
    }

    setIsLoading(true);

    try {
      const user = await authenticateUser(username, password);

      if (user) {
        saveUserToStorage(user);
        onLoginSuccess(user);
      } else {
        setError('Invalid username or password');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const msg = err?.message || 'Check if app is blocked by antivirus';
      setError(`System Error: ${msg}. Try restarting.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-yellow-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">

          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Gold Loan Manager
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            Sign in to manage customers, loans & EMIs
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-none border border-black/15 shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-500">
          <div className="px-6 py-8 border-b border-black/15 bg-gray-50/30 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Welcome Back</h2>
            <p className="text-sm md:text-base text-gray-500 mt-2">
              Enter your credentials to access your account
            </p>
          </div>
          <div className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="py-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="h-12 md:h-14 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base px-4"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 md:h-14 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base font-medium"
                    style={{ paddingRight: '3rem', paddingLeft: '1rem' }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    style={{ right: '1rem', left: 'auto' }}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5 md:w-6 md:h-6" />
                    ) : (
                      <Eye className="w-5 h-5 md:w-6 md:h-6" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center px-1">
                <button
                  type="button"
                  onClick={onBack}
                  className="text-sm text-gray-400 hover:text-gray-600 font-bold hover:underline transition-colors"
                >
                  ← Back to Start
                </button>
                {onForgotPassword && (
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-sm text-yellow-600 hover:text-yellow-700 font-bold hover:underline transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 md:h-14 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-lg rounded-none border border-black/15 shadow-lg shadow-yellow-100 transition-all hover:-translate-y-0.5"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LogIn className="w-6 h-6" />
                    <span>Sign In</span>
                  </div>
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Sign Up Link */}
        {onSwitchToSignUp && (
          <div className="text-center mt-6">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onSwitchToSignUp}
                className="text-yellow-600 hover:text-yellow-700 font-medium underline"
              >
                Sign up here
              </button>
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs md:text-sm text-gray-500 mt-6">
          © 2026 Gold Loan Manager. All rights reserved.
        </p>
      </div>
    </div>
  );
}
