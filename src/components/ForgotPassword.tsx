import { useState } from 'react';
import { ArrowLeft, KeyRound, Mail, User, Eye, EyeOff, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { getUserByUsernameAndEmail, resetPassword } from '../lib/db/authService';

interface ForgotPasswordProps {
  onBackToLogin: () => void;
}

type Step = 'identify' | 'new-password' | 'success';

export function ForgotPassword({ onBackToLogin }: ForgotPasswordProps) {
  const [step, setStep] = useState<Step>('identify');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');

  // Step 1: Verify username + email
  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const user = getUserByUsernameAndEmail(username.trim(), email.trim());
      if (!user) {
        setError('No account found with that username and email combination. Please check your details.');
      } else {
        setUserId(user.id);
        setUserName(user.name);
        setStep('new-password');
      }
    } catch (err: any) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Set new password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(userId, newPassword);
      setStep('success');
    } catch (err: any) {
      setError('Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const stepConfig = {
    identify: { icon: Mail, title: 'Forgot Password', desc: 'Enter your username and registered email to continue' },
    'new-password': { icon: KeyRound, title: 'Set New Password', desc: `Welcome back, ${userName}! Choose a strong new password` },
    success: { icon: CheckCircle, title: 'Password Reset!', desc: 'Your password has been successfully updated' },
  };

  const { icon: StepIcon, title, desc } = stepConfig[step];

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm my-auto">

        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 mb-4 overflow-hidden">
            <BrandLogo className="w-full h-full" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Gold Loan Manager
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            Recover your account access
          </p>
        </div>

        {/* Step Indicator */}
        {step !== 'success' && (
          <div className="flex items-center justify-center gap-2 mb-10">
            {['identify', 'new-password'].map((s, idx) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  step === s
                    ? 'bg-yellow-500 text-white shadow-md shadow-yellow-200'
                    : (step === 'new-password' && s === 'identify')
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-400'
                }`}>
                  {step === 'new-password' && s === 'identify' ? '✓' : idx + 1}
                </div>
                {idx < 1 && <div className={`w-10 h-0.5 rounded transition-all duration-300 ${step === 'new-password' ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-none border border-black/15 shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-500">
          <div className="px-6 py-4 border-b border-black/15 bg-gray-50/30 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              {step === 'identify' && 'Account Verification'}
              {step === 'new-password' && 'New Password'}
              {step === 'success' && 'All Done!'}
            </h2>
            <p className="text-sm md:text-base text-gray-500 mt-2">
              {step === 'identify' && 'Verify your account using your username and email'}
              {step === 'new-password' && 'Enter and confirm your new password below'}
              {step === 'success' && 'You can now sign in with your new password'}
            </p>
          </div>
          <div className="p-5 md:p-6">
            {error && (
              <Alert variant="destructive" className="py-3 mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* ── Step 1: Identify ── */}
            {step === 'identify' && (
              <form onSubmit={handleIdentify} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fp-username" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="fp-username"
                      type="text"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="h-12 md:h-14 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base px-4"
                      style={{ paddingLeft: '3rem' }}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fp-email" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Registered Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="fp-email"
                      type="email"
                      placeholder="Enter your registered email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12 md:h-14 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base px-4"
                      style={{ paddingLeft: '3rem' }}
                      autoComplete="email"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium ml-1">Enter the email used during account creation.</p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 md:h-14 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-lg rounded-none border border-black/15 shadow-lg shadow-yellow-100 transition-all hover:-translate-y-0.5"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-6 h-6" />
                      <span>Verify Account</span>
                    </div>
                  )}
                </Button>
              </form>
            )}

            {/* ── Step 2: New Password ── */}
            {step === 'new-password' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fp-new-password" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">New Password</Label>
                  <div className="relative">
                    <Input
                      id="fp-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Enter at least 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="h-12 md:h-14 bg-gray-50 border-black/15 rounded-none border border-black/15 focus:ring-yellow-500 focus:bg-white transition-all text-base font-medium"
                      style={{ paddingRight: '3rem', paddingLeft: '1rem' }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      style={{ right: '1rem', left: 'auto' }}
                    >
                      {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Password Strength Indicator */}
                  {newPassword && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1,2,3,4].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            newPassword.length >= i * 3
                              ? newPassword.length >= 12 ? 'bg-green-500'
                              : newPassword.length >= 8 ? 'bg-yellow-500'
                              : 'bg-red-400'
                              : 'bg-gray-200'
                          }`} />
                        ))}
                      </div>
                      <p className={`text-xs font-medium ${
                        newPassword.length >= 12 ? 'text-green-600' :
                        newPassword.length >= 8 ? 'text-yellow-600' :
                        newPassword.length >= 6 ? 'text-orange-500' : 'text-red-500'
                      }`}>
                        {newPassword.length < 6 ? 'Too short' :
                         newPassword.length < 8 ? 'Weak' :
                         newPassword.length < 12 ? 'Good' : 'Strong'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fp-confirm-password" className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="fp-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className={`h-12 md:h-14 bg-gray-50 rounded-none border border-black/15 transition-all text-base font-medium ${
                        confirmPassword && confirmPassword !== newPassword ? 'border-black/15 focus:ring-red-400' :
                        confirmPassword && confirmPassword === newPassword ? 'border-black/15 focus:ring-green-400' : 'border-black/15 focus:ring-yellow-500'
                      }`}
                      style={{ paddingRight: '3rem', paddingLeft: '1rem' }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      style={{ right: '1rem', left: 'auto' }}
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword === newPassword && (
                    <p className="text-[10px] text-green-600 font-bold flex items-center gap-1 ml-1">
                      <CheckCircle className="w-3 h-3" /> Passwords match
                    </p>
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
                      <span>Updating...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-6 h-6" />
                      <span>Reset Password</span>
                    </div>
                  )}
                </Button>
              </form>
            )}

            {/* ── Step 3: Success ── */}
            {step === 'success' && (
              <div className="text-center space-y-6 py-4">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-12 h-12 text-green-500" />
                </div>
                <div className="space-y-2">
                  <p className="text-gray-700 font-medium">
                    Password reset successfully for <span className="font-bold text-gray-900">{userName}</span>!
                  </p>
                  <p className="text-sm text-gray-500">You can now log in with your new password.</p>
                </div>
                <Button
                  onClick={onBackToLogin}
                  className="w-full h-12 md:h-14 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-lg rounded-none border border-black/15 shadow-lg shadow-yellow-100 transition-all hover:-translate-y-0.5"
                >
                  <ArrowLeft className="w-5 h-5 mr-2" />
                  Back to Login
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Back to Login link */}
        {step !== 'success' && (
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-sm text-gray-500 hover:text-yellow-600 transition-colors flex items-center gap-1.5 mx-auto"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </button>
          </div>
        )}

        <p className="text-center text-xs md:text-sm text-gray-500 mt-6">
          © 2026 Gold Loan Manager v0.2.4. All rights reserved.
        </p>
      </div>
    </div>
  );
}
