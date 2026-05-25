import { useState } from 'react';
import { UserPlus, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { registerUser, saveUserToStorage } from '../lib/auth';
import { adminExists } from '../lib/database';
import { User } from '../types';

interface SignUpProps {
  onSignUpSuccess: (user: User) => void;
  onSwitchToLogin: () => void;
  onBack: () => void;
}

export function SignUp({ onSignUpSuccess, onSwitchToLogin, onBack }: SignUpProps) {
  const hasAdmin = adminExists();
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    name: '',
    email: '',
    role: (!hasAdmin ? 'admin' : 'staff') as 'admin' | 'staff' | '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev: typeof formData) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const validateForm = () => {
    if (!formData.username.trim()) return 'Username is required';
    if (!formData.password) return 'Password is required';
    if (!formData.confirmPassword) return 'Please confirm your password';
    if (formData.password !== formData.confirmPassword) return 'Passwords do not match';
    if (formData.password.length < 6) return 'Password must be at least 6 characters';
    if (!formData.name.trim()) return 'Full name is required';
    if (!formData.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return 'Please enter a valid email';
    if (!formData.role) return 'Please select a role';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const validationError = validateForm();
      if (validationError) {
        setError(validationError);
        setIsLoading(false);
        return;
      }

      const user = await registerUser(
        formData.username.trim(),
        formData.password,
        formData.name.trim(),
        formData.email.trim(),
        formData.role as 'admin' | 'staff'
      );

      if (user) {
        // Auto-login the newly created user
        saveUserToStorage(user);
        onSignUpSuccess(user);
      } else {
        setError('Username already exists. Please choose a different username.');
      }
    } catch (err: any) {
      console.error('Signup error:', err);
      const msg = err?.message || 'Check if app is blocked by antivirus';
      setError(`System Error: ${msg}. Try restarting.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-yellow-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Sign Up Card */}
        <div className="bg-white rounded-none border border-black/15 shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-500">
          <div className="px-6 py-8 border-b border-black/15 bg-gray-50/30 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{!hasAdmin ? 'Initialize System' : 'Create Account'}</h2>
            <p className="text-sm md:text-base text-gray-500 mt-2">
              {!hasAdmin ? 'Set up the administrator account' : 'Fill in your details to create a new account'}
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


              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Choose a username"
                    value={formData.username}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('username', e.target.value)}
                    className="h-12 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base px-4"
                    autoComplete="username"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('name', e.target.value)}
                    className="h-12 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base px-4"
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('email', e.target.value)}
                  className="h-12 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base px-4 font-medium"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Role</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(value: string) => handleInputChange('role', value)}
                  disabled={!hasAdmin}
                >
                  <SelectTrigger className="h-12 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base px-4">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border border-black/15 shadow-xl">
                    <SelectItem value="staff">Staff Member</SelectItem>
                    {!hasAdmin && <SelectItem value="admin">Administrator (System Setup)</SelectItem>}
                  </SelectContent>
                </Select>
                {!hasAdmin && (
                  <p className="text-[10px] text-yellow-600 font-bold italic ml-1">
                    System setup: The first account must be an Administrator.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create password"
                      value={formData.password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('password', e.target.value)}
                      className="h-12 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base font-medium"
                      style={{ paddingRight: '3rem', paddingLeft: '1rem' }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      style={{ right: '1rem', left: 'auto' }}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Confirm</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm password"
                      value={formData.confirmPassword}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('confirmPassword', e.target.value)}
                      className="h-12 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base font-medium"
                      style={{ paddingRight: '3rem', paddingLeft: '1rem' }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      style={{ right: '1rem', left: 'auto' }}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 md:h-14 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-lg rounded-none border border-black/15 shadow-lg shadow-yellow-100 transition-all hover:-translate-y-0.5 active:scale-95 mt-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{hasAdmin ? 'Registering...' : 'Initializing...'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-6 h-6" />
                    <span>Create Account</span>
                  </div>
                )}
              </Button>
            </form>

            <div className="mt-6 flex flex-col gap-4 items-center">
              {hasAdmin && (
                <p className="text-sm text-gray-600">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={onSwitchToLogin}
                    className="text-yellow-600 hover:text-yellow-700 font-bold underline transition-colors"
                  >
                    Sign in here
                  </button>
                </p>
              )}
              <button
                type="button"
                onClick={onBack}
                className="text-sm text-gray-400 hover:text-gray-600 font-bold hover:underline transition-colors"
              >
                ← Back to Start
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs md:text-sm text-gray-500 mt-6">
          © 2026 Gold Loan Manager v0.2.4. All rights reserved.
        </p>
      </div>
    </div>
  );
}
