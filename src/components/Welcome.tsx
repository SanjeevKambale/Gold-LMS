import { LogIn, UserPlus, ShieldPlus } from 'lucide-react';
import { Button } from './ui/button';

interface WelcomeProps {
  onNavigate: (screen: 'login' | 'signup') => void;
  hasAdmin: boolean;
}

export function Welcome({ onNavigate, hasAdmin }: WelcomeProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#002147]/5 via-white to-[#d4af37]/10 flex items-center justify-center p-4 relative">
      {/* Top Navigation Buttons - Using inline styles for ironclad positioning */}
      {hasAdmin && (
        <nav 
          style={{ 
            position: 'fixed', 
            top: '1.5rem', 
            right: '1.5rem', 
            display: 'flex', 
            gap: '0.75rem', 
            zIndex: 1000 
          }}
        >
          <Button
            onClick={() => onNavigate('login')}
            className="btn-landing btn-landing-signin !w-auto !max-w-none px-5 h-10 text-xs font-bold shadow-lg group"
          >
            <LogIn className="w-4 h-4 mr-2 text-[#002147] group-hover:scale-110 transition-transform" />
            Sign In
          </Button>

          <Button
            onClick={() => onNavigate('signup')}
            className="btn-landing btn-landing-signup !w-auto !max-w-none px-5 h-10 text-xs font-bold shadow-lg group"
          >
            <UserPlus className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
            Sign Up
          </Button>
        </nav>
      )}



      <div className="w-full max-w-md text-center">
        {/* Logo and Hero Section */}
        <div className="mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-[#d4af37] blur-xl opacity-20 rounded-full animate-pulse" />
            <img 
              src="./logo.jpeg" 
              alt="Gold Loan Manager Logo" 
              className="relative mx-auto drop-shadow-lg transition-transform hover:scale-105 duration-500"
              style={{ width: '100px', height: '100px', objectFit: 'contain' }}
            />
          </div>
          <h1 className="mt-3 text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
            <span className="text-[#002147]">Gold</span> <span className="text-[#d4af37]">Loan</span> Manager
          </h1>
          <p className="mt-1 text-xs md:text-sm text-gray-600 font-medium max-w-[280px] mx-auto">
            Secure and efficient management of your gold loan business.
          </p>
        </div>

        {/* Admin Section */}
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">


          {!hasAdmin && (
            <>
              <div className="relative py-3">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-black/15"></span>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest text-gray-400">
                  <span className="bg-white/50 px-3">Admin Access</span>
                </div>
              </div>

              <Button
                onClick={() => onNavigate('signup')}
                variant="ghost"
                className="w-full h-11 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-black/15 font-bold text-sm rounded-none border border-black/15 transition-all active:scale-95 group shadow-sm"
              >
                <ShieldPlus className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                Create Admin Account
              </Button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-sm text-gray-400 font-medium">
          Powered by Advanced Gold Loan Management Systems v0.2.5
        </p>
      </div>
    </div>
  );
}
