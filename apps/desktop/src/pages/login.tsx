import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Pill, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { Button, Input, Label, Alert, Card, CardContent, CardHeader } from '@medicore/ui';

interface LoginFormValues {
  email: string;
  password: string;
}

function LoginPage() {
  const { login, isLoggingIn, loginError, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>();

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoading, user, navigate]);

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await login(values);
      navigate('/dashboard', { replace: true });
    } catch {
      // surfaced via loginError below
    }
  };

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-secondary/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Pill className="size-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Sign in to Medicore</h1>
          <p className="text-sm text-muted-foreground">
            Distribution management for your pharmacy business
          </p>
        </div>

        <Card>
          <CardHeader className="pb-0" />
          <CardContent className="pt-6">
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              {loginError && (
                <Alert variant="destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {loginError instanceof ApiError ? loginError.message : 'Unable to sign in'}
                  </span>
                </Alert>
              )}

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
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  {...register('password', { required: 'Password is required' })}
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default LoginPage;
