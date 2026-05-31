import { useState } from 'react';
import { X, Lock, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { authenticateUser } from '../lib/auth';
import { User } from '../types';

interface StaffVerificationModalProps {
  staffUser: User;
  onClose: () => void;
  onSuccess: () => void;
}

export function StaffVerificationModal({ staffUser, onClose, onSuccess }: StaffVerificationModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const verifiedUser = await authenticateUser(staffUser.username, password);
      if (verifiedUser && verifiedUser.id === staffUser.id) {
        onSuccess();
      } else {
        setError('Incorrect password');
      }
    } catch (err) {
      setError('An error occurred during verification');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black">
      <div className="bg-white rounded-none shadow-xl w-full max-w-md border border-black/15">
        <div className="flex items-center justify-between p-6 border-b border-black/15 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-yellow-600" />
            <h2 className="text-xl font-bold text-gray-900">Staff Verification</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-600 font-medium">
            Please enter the password for <span className="font-bold text-gray-900">{staffUser.name}</span> to switch to their Staff Dashboard.
          </p>

          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col">
            <Label 
              htmlFor="staff-password"
              style={{ display: 'block', marginBottom: '8px' }}
            >
              Password
            </Label>
            <Input
              id="staff-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter staff password"
              required
              className="rounded-none border-black/15 focus:ring-yellow-500"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-black/15">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-none border-black/15 font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="rounded-none bg-yellow-500 hover:bg-yellow-600 text-white font-semibold"
            >
              {isLoading ? 'Verifying...' : 'Verify & Switch'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
