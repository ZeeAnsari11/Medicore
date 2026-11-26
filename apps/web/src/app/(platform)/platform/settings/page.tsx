'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { PageHeader } from '@/components/layout/page-header';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { usePlatformSettings } from '@/hooks/use-platform-settings';
import { usePlatformPlans } from '@/hooks/use-platform-plans';

interface SettingsFormValues {
  platformName: string;
  logoUrl: string;
  supportEmail: string;
  defaultTrialDays: string;
  defaultPlanId: string;
  contactPhone: string;
}

export default function PlatformSettingsPage() {
  const { settings, isLoading, update, isUpdating } = usePlatformSettings();
  const { plans } = usePlatformPlans();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    defaultValues: {
      platformName: '',
      logoUrl: '',
      supportEmail: '',
      defaultTrialDays: '14',
      defaultPlanId: '',
      contactPhone: '',
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        platformName: settings.platformName,
        logoUrl: settings.logoUrl ?? '',
        supportEmail: settings.supportEmail,
        defaultTrialDays: settings.defaultTrialDays.toString(),
        defaultPlanId: settings.defaultPlanId ?? '',
        contactPhone: settings.contactPhone ?? '',
      });
    }
  }, [settings, reset]);

  const onSubmit = async (values: SettingsFormValues) => {
    await update({
      platformName: values.platformName,
      logoUrl: values.logoUrl.trim() === '' ? null : values.logoUrl,
      supportEmail: values.supportEmail,
      defaultTrialDays: parseInt(values.defaultTrialDays, 10),
      defaultPlanId: values.defaultPlanId === '' ? null : values.defaultPlanId,
      contactPhone: values.contactPhone.trim() === '' ? null : values.contactPhone,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Platform Settings" description="Configure the Medicore platform for every tenant" />

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 lg:max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="platformName">Platform name</Label>
              <Input
                id="platformName"
                aria-invalid={!!errors.platformName}
                {...register('platformName', { required: 'Platform name is required', minLength: { value: 2, message: 'Must be at least 2 characters' } })}
              />
              {errors.platformName && <p className="text-xs text-destructive">{errors.platformName.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input id="logoUrl" placeholder="https://example.com/logo.png" {...register('logoUrl')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="supportEmail">Support email</Label>
              <Input
                id="supportEmail"
                type="email"
                aria-invalid={!!errors.supportEmail}
                {...register('supportEmail', { required: 'Support email is required' })}
              />
              {errors.supportEmail && <p className="text-xs text-destructive">{errors.supportEmail.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contactPhone">Contact phone</Label>
              <Input id="contactPhone" placeholder="Optional" {...register('contactPhone')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New tenants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="defaultTrialDays">Default trial length (days)</Label>
              <Input
                id="defaultTrialDays"
                type="number"
                integer
                min="0"
                aria-invalid={!!errors.defaultTrialDays}
                {...register('defaultTrialDays', { required: 'Trial length is required' })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="defaultPlanId">Default plan</Label>
              <Select
                value={watch('defaultPlanId')}
                onValueChange={(value) => setValue('defaultPlanId', value)}
              >
                <SelectTrigger id="defaultPlanId">
                  <SelectValue placeholder="No default plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No default plan</SelectItem>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                New tenants are subscribed to this plan automatically when they&apos;re created.
              </p>
            </div>
          </CardContent>
        </Card>

        <div>
          <Button type="submit" disabled={isUpdating}>
            {isUpdating ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </form>
    </>
  );
}
