"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const SETTINGS_SLUG = "adminSettings";

type AdminSettingsContent = {
  commerce: {
    expressShipping: number;
    freeShippingThreshold: number;
    gstRate: number;
    holdMinutes: number;
    standardShipping: number;
  };
  integrations: {
    electricRealtimeEnabled: boolean;
    razorpayEnabled: boolean;
    resendEmailEnabled: boolean;
  };
  operations: {
    maintenanceMessage: string;
    maintenanceMode: boolean;
    supportEmail: string;
    supportPhone: string;
  };
};

type PasswordFormState = {
  confirmNewPassword: string;
  currentPassword: string;
  newPassword: string;
};

const defaultSettings: AdminSettingsContent = {
  commerce: {
    expressShipping: 1200,
    freeShippingThreshold: 25000,
    gstRate: 0.12,
    holdMinutes: 30,
    standardShipping: 500,
  },
  integrations: {
    electricRealtimeEnabled: true,
    razorpayEnabled: true,
    resendEmailEnabled: true,
  },
  operations: {
    maintenanceMessage: "The storefront is under scheduled maintenance.",
    maintenanceMode: false,
    supportEmail: "hello@fromthetrunk.com",
    supportPhone: "",
  },
};

const defaultPasswordForm: PasswordFormState = {
  confirmNewPassword: "",
  currentPassword: "",
  newPassword: "",
};

const passwordRequirements =
  "Use at least 8 characters with uppercase, lowercase, and a number.";

const meetsPasswordRequirements = (value: string) =>
  value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettingsContent>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(defaultPasswordForm);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const response = await fetch(`/api/v2/globals/${SETTINGS_SLUG}`);
      if (!response.ok) {
        setIsLoading(false);
        return;
      }

      const data = (await response.json()) as { content?: Partial<AdminSettingsContent> };
      setSettings((prev) => ({
        commerce: {
          ...prev.commerce,
          ...data.content?.commerce,
        },
        integrations: {
          ...prev.integrations,
          ...data.content?.integrations,
        },
        operations: {
          ...prev.operations,
          ...data.content?.operations,
        },
      }));
      setIsLoading(false);
    };

    void load();
  }, []);

  const gstPercent = useMemo(() => Math.round(settings.commerce.gstRate * 100), [settings.commerce.gstRate]);

  const save = async () => {
    setIsSaving(true);
    setStatus(null);
    const response = await fetch(`/api/v2/globals/${SETTINGS_SLUG}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: settings }),
    });
    setIsSaving(false);
    setStatus(response.ok ? "Settings saved successfully." : `Save failed (${response.status}).`);
  };

  const updatePasswordField = <TKey extends keyof PasswordFormState>(
    key: TKey,
    value: PasswordFormState[TKey]
  ) => {
    setPasswordForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const changePassword = async () => {
    setPasswordError(null);
    setPasswordStatus(null);

    if (!passwordForm.currentPassword.trim()) {
      setPasswordError("Enter your current password.");
      return;
    }

    if (!meetsPasswordRequirements(passwordForm.newPassword)) {
      setPasswordError(passwordRequirements);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordError("New password and confirmation must match.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const response = await fetch("/api/v2/users/me/password", {
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        let message = `Password update failed (${response.status}).`;
        try {
          const data = (await response.json()) as { message?: string };
          if (typeof data.message === "string" && data.message.length > 0) {
            message = data.message;
          }
        } catch {
          // no-op
        }

        setPasswordError(message);
        return;
      }

      setPasswordForm(defaultPasswordForm);
      setPasswordStatus("Password updated successfully.");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const updateCommerce = <TKey extends keyof AdminSettingsContent["commerce"]>(
    key: TKey,
    value: AdminSettingsContent["commerce"][TKey]
  ) => {
    setSettings((prev) => ({
      ...prev,
      commerce: {
        ...prev.commerce,
        [key]: value,
      },
    }));
  };

  const updateIntegrations = <TKey extends keyof AdminSettingsContent["integrations"]>(
    key: TKey,
    value: AdminSettingsContent["integrations"][TKey]
  ) => {
    setSettings((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        [key]: value,
      },
    }));
  };

  const updateOperations = <TKey extends keyof AdminSettingsContent["operations"]>(
    key: TKey,
    value: AdminSettingsContent["operations"][TKey]
  ) => {
    setSettings((prev) => ({
      ...prev,
      operations: {
        ...prev.operations,
        [key]: value,
      },
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure commerce defaults, integrations, and operational controls.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commerce Defaults</CardTitle>
          <CardDescription>Control shipping thresholds, tax rates, and reservation windows.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="free-shipping-threshold">Free Shipping Threshold (₹)</Label>
            <Input
              disabled={isLoading}
              id="free-shipping-threshold"
              onChange={(event) => updateCommerce("freeShippingThreshold", Number(event.target.value || 0))}
              type="number"
              value={settings.commerce.freeShippingThreshold}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gst-rate">GST Rate (%)</Label>
            <Input
              disabled={isLoading}
              id="gst-rate"
              onChange={(event) => updateCommerce("gstRate", Number(event.target.value || 0) / 100)}
              type="number"
              value={gstPercent}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="standard-shipping">Standard Shipping (₹)</Label>
            <Input
              disabled={isLoading}
              id="standard-shipping"
              onChange={(event) => updateCommerce("standardShipping", Number(event.target.value || 0))}
              type="number"
              value={settings.commerce.standardShipping}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="express-shipping">Express Shipping (₹)</Label>
            <Input
              disabled={isLoading}
              id="express-shipping"
              onChange={(event) => updateCommerce("expressShipping", Number(event.target.value || 0))}
              type="number"
              value={settings.commerce.expressShipping}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="reservation-hold">Reservation Hold (minutes)</Label>
            <Input
              disabled={isLoading}
              id="reservation-hold"
              onChange={(event) => updateCommerce("holdMinutes", Number(event.target.value || 0))}
              type="number"
              value={settings.commerce.holdMinutes}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Toggle external providers for transactional workflows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Razorpay payments</p>
              <p className="text-xs text-muted-foreground">Allow checkout and payment verification flows.</p>
            </div>
            <Switch
              checked={settings.integrations.razorpayEnabled}
              disabled={isLoading}
              onCheckedChange={(checked) => updateIntegrations("razorpayEnabled", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Resend email delivery</p>
              <p className="text-xs text-muted-foreground">Send transactional + newsletter emails from the admin system.</p>
            </div>
            <Switch
              checked={settings.integrations.resendEmailEnabled}
              disabled={isLoading}
              onCheckedChange={(checked) => updateIntegrations("resendEmailEnabled", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">ElectricSQL live sync</p>
              <p className="text-xs text-muted-foreground">Enable realtime order and inventory views in admin tables.</p>
            </div>
            <Switch
              checked={settings.integrations.electricRealtimeEnabled}
              disabled={isLoading}
              onCheckedChange={(checked) => updateIntegrations("electricRealtimeEnabled", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
          <CardDescription>Support channels and maintenance communication.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="support-email">Support Email</Label>
              <Input
                disabled={isLoading}
                id="support-email"
                onChange={(event) => updateOperations("supportEmail", event.target.value)}
                type="email"
                value={settings.operations.supportEmail}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-phone">Support Phone</Label>
              <Input
                disabled={isLoading}
                id="support-phone"
                onChange={(event) => updateOperations("supportPhone", event.target.value)}
                value={settings.operations.supportPhone}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maintenance-message">Maintenance Message</Label>
            <Textarea
              className="min-h-[96px]"
              disabled={isLoading}
              id="maintenance-message"
              onChange={(event) => updateOperations("maintenanceMessage", event.target.value)}
              value={settings.operations.maintenanceMessage}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Maintenance mode</p>
              <p className="text-xs text-muted-foreground">Show storefront maintenance banner and pause checkouts.</p>
            </div>
            <Switch
              checked={settings.operations.maintenanceMode}
              disabled={isLoading}
              onCheckedChange={(checked) => updateOperations("maintenanceMode", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your admin password without leaving the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                onChange={(event) => updatePasswordField("currentPassword", event.target.value)}
                type="password"
                value={passwordForm.currentPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                onChange={(event) => updatePasswordField("newPassword", event.target.value)}
                type="password"
                value={passwordForm.newPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirm New Password</Label>
              <Input
                id="confirm-new-password"
                onChange={(event) => updatePasswordField("confirmNewPassword", event.target.value)}
                type="password"
                value={passwordForm.confirmNewPassword}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{passwordRequirements}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={isUpdatingPassword}
              onClick={() => void changePassword()}
              type="button"
            >
              {isUpdatingPassword ? "Updating..." : "Update Password"}
            </Button>
            {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
            {!passwordError && passwordStatus ? (
              <p className="text-sm text-muted-foreground">{passwordStatus}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center gap-3">
        <Button disabled={isLoading || isSaving} onClick={() => void save()} type="button">
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </div>
    </div>
  );
}
