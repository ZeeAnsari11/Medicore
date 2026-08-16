'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Pill, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { Button, Input, Label, Alert } from '@medicore/ui';

interface LoginFormValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { login, isLoggingIn, loginError, user, isLoading } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>();

  useEffect(() => {
    if (!isLoading && user) {
      const destination = user.systemRole === 'SUPER_ADMIN' ? '/platform/tenants' : '/dashboard';
      router.replace(destination);
    }
  }, [isLoading, user, router]);

  const onSubmit = async (values: LoginFormValues) => {
    try {
      const result = await login(values);
      const destination = result.user.systemRole === 'SUPER_ADMIN' ? '/platform/tenants' : '/dashboard';
      router.replace(destination);
    } catch {
      // surfaced via loginError below
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-emerald-50" />

        {/* Animated blob decorations */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header with logo and branding */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center animate-fade-in">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-shadow duration-300">
            <Pill className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-emerald-600 bg-clip-text text-transparent">
              Medicore
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Distribution management for your pharmacy
            </p>
          </div>
        </div>

        {/* Glass morphism card */}
        <div className="relative">
          {/* Glassmorphism background */}
          <div className="absolute inset-0 bg-white/40 backdrop-blur-xl rounded-3xl border border-white/20 shadow-xl" />

          {/* Content */}
          <div className="relative p-8 sm:p-10">
            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
              {/* Error Alert with animation */}
              {loginError && (
                <div className="animate-slide-down">
                  <Alert variant="destructive" className="border-red-200 bg-red-50/50 backdrop-blur-sm">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                    <span className="text-red-800">
                      {loginError instanceof ApiError ? loginError.message : 'Unable to sign in'}
                    </span>
                  </Alert>
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-2 animate-fade-in-delay-1">
                <Label htmlFor="email" className="text-gray-700 font-medium text-sm">
                  Email address
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    aria-invalid={!!errors.email}
                    className={`w-full px-4 py-3 bg-white/50 backdrop-blur-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 ${
                      errors.email
                        ? 'border-red-300 bg-red-50/50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    {...register('email', { required: 'Email is required' })}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2 animate-fade-in-delay-2">
                <Label htmlFor="password" className="text-gray-700 font-medium text-sm">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={!!errors.password}
                    className={`w-full px-4 py-3 pr-12 bg-white/50 backdrop-blur-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 ${
                      errors.password
                        ? 'border-red-300 bg-red-50/50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    {...register('password', { required: 'Password is required' })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoggingIn}
                className="w-full mt-8 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold rounded-xl shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all duration-200 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2 animate-fade-in-delay-3"
              >
                {isLoggingIn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <span>Sign in</span>
                    <CheckCircle2 className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </>
                )}
              </Button>
            </form>

            {/* Footer info */}
            <div className="mt-6 pt-6 border-t border-gray-200/50 text-center animate-fade-in-delay-4">
              <p className="text-xs text-gray-600">
                Demo credentials:
                <br />
                <code className="text-gray-700 font-mono text-xs bg-gray-100/50 px-2 py-1 rounded inline-block mt-2">
                  admin@gmail.com / admin
                </code>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom decorative element */}
        <div className="mt-8 flex justify-center gap-2 animate-fade-in-delay-5">
          <div className="w-2 h-2 rounded-full bg-indigo-400 opacity-50" />
          <div className="w-2 h-2 rounded-full bg-emerald-400 opacity-50" />
          <div className="w-2 h-2 rounded-full bg-purple-400 opacity-50" />
        </div>
      </div>

      {/* Global animations styles */}
      <style jsx>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        .animate-fade-in-delay-1 {
          animation: fade-in 0.6s ease-out 0.1s both;
        }
        .animate-fade-in-delay-2 {
          animation: fade-in 0.6s ease-out 0.2s both;
        }
        .animate-fade-in-delay-3 {
          animation: fade-in 0.6s ease-out 0.3s both;
        }
        .animate-fade-in-delay-4 {
          animation: fade-in 0.6s ease-out 0.4s both;
        }
        .animate-fade-in-delay-5 {
          animation: fade-in 0.6s ease-out 0.5s both;
        }
        .animate-slide-down {
          animation: slide-down 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
