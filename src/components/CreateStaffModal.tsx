import { useState } from 'react';
import { X, UserPlus, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { registerUser } from '../lib/auth';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';

interface CreateStaffModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateStaffModal({ onClose, onSuccess }: CreateStaffModalProps) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.username || !formData.password || !formData.name || !formData.email) {
      setError('All fields are required');
      return;
    }

    setIsLoading(true);
    try {
      const user = await registerUser(
        formData.username.trim(),
        formData.password,
        formData.name.trim(),
        formData.email.trim(),
        'staff'
      );

      if (user) {
        onSuccess();
        onClose();
      } else {
        setError('Username already exists');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create staff account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-none border border-black/15 w-full max-w-md shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/15 bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Add New Staff</h3>
            <p className="text-xs text-gray-500">Create a new access account for staff</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-gray-500 uppercase ml-1">Full Name</Label>
            <Input
              required
              placeholder="John Doe"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="rounded-none border border-black/15"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-gray-500 uppercase ml-1">Email Address</Label>
            <Input
              required
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="rounded-none border border-black/15"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase ml-1">Username</Label>
              <Input
                required
                placeholder="johndoe"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                className="rounded-none border border-black/15"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase ml-1">Password</Label>
              <div className="relative">
                <Input
                  required
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="rounded-none border border-black/15 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-black/15 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 rounded-none border border-black/15 h-11"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded-none border border-black/15 h-11 shadow-md shadow-yellow-100"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create Staff
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
