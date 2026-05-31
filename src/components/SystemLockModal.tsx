import { useState } from 'react';
import { Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { authenticateUser } from '../lib/auth';
import { User } from '../types';

interface SystemLockModalProps {
  currentUser: User;
  onUnlock: () => void;
}

export function SystemLockModal({ currentUser, onUnlock }: SystemLockModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const verifiedUser = await authenticateUser(currentUser.username, password);
      if (verifiedUser) {
        onUnlock();
      } else {
        setError('Incorrect password');
      }
    } catch (err) {
      setError('An error occurred during verification');
    } finally {
      setIsLoading(false);
    }
  };

  const isRoleAdmin = currentUser.role === 'admin';

  return (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/30 backdrop-blur-xl animate-in fade-in duration-300"
      style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
    >
      <div 
        className="bg-white rounded-none shadow-2xl border border-black/15 animate-in zoom-in-95 duration-300 overflow-hidden"
        style={{ width: '460px', maxWidth: '100%' }}
      >
        {/* Header Header styling to match premium welcome card */}
        <div className="px-6 py-8 border-b border-black/15 bg-gray-50/30 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-none border border-black/15 bg-yellow-50 flex items-center justify-center text-yellow-600 mb-3 shadow-sm">
            <Lock className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {isRoleAdmin ? 'Admin Verification' : 'Staff Verification'}
          </h2>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
            System Locked
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          {/* User Profile Card */}
          <div className="p-4 bg-gray-50 border border-black/15 rounded-none flex items-center gap-4 hover:bg-gray-100/50 transition-colors">
            <div className="w-12 h-12 rounded-none border border-black/15 bg-yellow-500 text-white flex items-center justify-center text-xl font-bold shadow-sm flex-shrink-0">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-gray-900 truncate">{currentUser.name}</p>
              <p className="text-xs text-gray-400 capitalize font-semibold mt-0.5">{currentUser.role} Account</p>
            </div>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed text-center font-medium">
            This session is standlocked for security. Enter your account password to resume your active workspace.
          </p>

          {error && (
            <Alert variant="destructive" className="py-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs font-bold leading-normal">{error}</AlertDescription>
            </Alert>
          )}

          {/* Password Input with Show/Hide Toggle */}
          <div className="space-y-3">
            <Label 
              htmlFor="lock-password" 
              className="block text-xs font-bold text-gray-500 uppercase tracking-wider ml-1 mb-2"
              style={{ display: 'block', marginBottom: '10px' }}
            >
              Password
            </Label>
            <div className="relative">
              <Input
                id="lock-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password to unlock"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base font-medium"
                style={{ paddingRight: '3rem', paddingLeft: '1rem' }}
                autoFocus
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

          {/* Action Button */}
          <div className="pt-2 border-t border-black/15">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-base rounded-none border border-black/15 shadow-lg shadow-yellow-100 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Unlocking...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  <span>Unlock Workspace</span>
                </div>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
