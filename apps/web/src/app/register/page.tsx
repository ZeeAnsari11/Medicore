'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Pill, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { Button, Input, Label, Alert, Card, CardContent, CardHeader } from '@medicore/ui';

interface RegisterFormValues {
  tenantName: string;
  fullName: string;
  email: string;
  password: string;
}

export default function RegisterPage() {
  const { register: registerTenant, isRegistering, registerError, user, isLoading } = useAuth();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [isLoading, user, router]);

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      await registerTenant(values);
      router.replace('/dashboard');
    } catch {
      // surfaced via registerError below
    }
  };

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-secondary/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Pill className="size-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Create your organization</h1>
          <p className="text-sm text-muted-foreground">
            Set up a new Medicore workspace for your distribution business
          </p>
        </div>

        <Card>
          <CardHeader className="pb-0" />
          <CardContent className="pt-6">
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              {registerError && (
                <Alert variant="destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {registerError instanceof ApiError ? registerError.message : 'Unable to register'}
                  </span>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="tenantName">Business name</Label>
                <Input
                  id="tenantName"
                  placeholder="Acme Pharma Distributors"
                  aria-invalid={!!errors.tenantName}
                  {...register('tenantName', { required: 'Business name is required' })}
                />
                {errors.tenantName && (
                  <p className="text-xs text-destructive">{errors.tenantName.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fullName">Your full name</Label>
                <Input
                  id="fullName"
                  placeholder="Jane Doe"
                  aria-invalid={!!errors.fullName}
                  {...register('fullName', { required: 'Full name is required' })}
                />
                {errors.fullName && (
                  <p className="text-xs text-destructive">{errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  aria-invalid={!!errors.email}
                  {...register('email', { required: 'Email is required' })}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  aria-invalid={!!errors.password}
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  })}
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isRegistering}>
                {isRegistering ? 'Creating workspace…' : 'Create workspace'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have a workspace?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
