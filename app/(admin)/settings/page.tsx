"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const SETTINGS_SLUG = "adminSettings";

type NumberDraft = number | "";

type AdminSettingsContent = {
  commerce: {
    expressShipping: NumberDraft;
    freeShippingThreshold: NumberDraft;
    gstRate: NumberDraft;
    holdMinutes: NumberDraft;
    standardShipping: NumberDraft;
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

type PersistedAdminSettingsContent = {
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

const blankPersistedSettings: PersistedAdminSettingsContent = {
  commerce: {
    expressShipping: 0,
    freeShippingThreshold: 0,
    gstRate: 0,
    holdMinutes: 0,
    standardShipping: 0,
  },
  integrations: {
    electricRealtimeEnabled: false,
    razorpayEnabled: false,
    resendEmailEnabled: false,
  },
  operations: {
    maintenanceMessage: "",
    maintenanceMode: false,
    supportEmail: "",
    supportPhone: "",
  },
};

const createBlankSettings = (): AdminSettingsContent => ({
  commerce: { ...blankPersistedSettings.commerce },
  integrations: { ...blankPersistedSettings.integrations },
  operations: { ...blankPersistedSettings.operations },
});

const defaultPasswordForm: PasswordFormState = {
  confirmNewPassword: "",
  currentPassword: "",
  newPassword: "",
};

const passwordRequirements =
  "Use at least 8 characters with uppercase, lowercase, and a number.";

const meetsPasswordRequirements = (value: string) =>
  value.length >= 8 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /[0-9]/.test(value);

const passwordUppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const passwordLowercase = "abcdefghijkmnopqrstuvwxyz";
const passwordNumbers = "23456789";
const passwordSymbols = "!@#$%&*?";
const passwordCharacters = `${passwordUppercase}${passwordLowercase}${passwordNumbers}${passwordSymbols}`;

const randomIndex = (length: number) => {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % length;
  }

  return Math.floor(Math.random() * length);
};

const pickCharacter = (characters: string) =>
  characters.charAt(randomIndex(characters.length));

const shuffleCharacters = (characters: string[]) => {
  const copy = [...characters];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy.join("");
};

const generateTemporaryPassword = () => {
  const requiredCharacters = [
    pickCharacter(passwordUppercase),
    pickCharacter(passwordLowercase),
    pickCharacter(passwordNumbers),
    pickCharacter(passwordSymbols),
  ];

  const remainingCharacters = Array.from({ length: 10 }, () =>
    pickCharacter(passwordCharacters),
  );

  return shuffleCharacters([...requiredCharacters, ...remainingCharacters]);
};

const readErrorMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string };
    if (typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
  } catch {
    // fall through
  }

  return `Request failed with ${response.status}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
};

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const readString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const normalizeLoadedSettings = (content: unknown): AdminSettingsContent => {
  const source = isRecord(content) ? content : {};
  const commerce = isRecord(source.commerce) ? source.commerce : {};
  const integrations = isRecord(source.integrations) ? source.integrations : {};
  const operations = isRecord(source.operations) ? source.operations : {};

  return {
    commerce: {
      expressShipping: readNumber(
        commerce.expressShipping,
        blankPersistedSettings.commerce.expressShipping,
      ),
      freeShippingThreshold: readNumber(
        commerce.freeShippingThreshold,
        blankPersistedSettings.commerce.freeShippingThreshold,
      ),
      gstRate: readNumber(
        commerce.gstRate,
        blankPersistedSettings.commerce.gstRate,
      ),
      holdMinutes: readNumber(
        commerce.holdMinutes,
        blankPersistedSettings.commerce.holdMinutes,
      ),
      standardShipping: readNumber(
        commerce.standardShipping,
        blankPersistedSettings.commerce.standardShipping,
      ),
    },
    integrations: {
      electricRealtimeEnabled: readBoolean(
        integrations.electricRealtimeEnabled,
        blankPersistedSettings.integrations.electricRealtimeEnabled,
      ),
      razorpayEnabled: readBoolean(
        integrations.razorpayEnabled,
        blankPersistedSettings.integrations.razorpayEnabled,
      ),
      resendEmailEnabled: readBoolean(
        integrations.resendEmailEnabled,
        blankPersistedSettings.integrations.resendEmailEnabled,
      ),
    },
    operations: {
      maintenanceMessage: readString(
        operations.maintenanceMessage,
        blankPersistedSettings.operations.maintenanceMessage,
      ),
      maintenanceMode: readBoolean(
        operations.maintenanceMode,
        blankPersistedSettings.operations.maintenanceMode,
      ),
      supportEmail: readString(
        operations.supportEmail,
        blankPersistedSettings.operations.supportEmail,
      ),
      supportPhone: readString(
        operations.supportPhone,
        blankPersistedSettings.operations.supportPhone,
      ),
    },
  };
};

const toPersistedNumber = (value: NumberDraft) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const toInputValue = (value: NumberDraft) =>
  value === "" ? "" : String(value);

const toGstInputValue = (value: NumberDraft) => {
  if (value === "") return "";

  const percent = value * 100;
  return Number.isInteger(percent)
    ? String(percent)
    : String(Number(percent.toFixed(2)));
};

const parseNumberInput = (value: string): NumberDraft => {
  if (value === "") return "";

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
};

const parseGstPercentInput = (value: string): NumberDraft => {
  if (value === "") return "";

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 100 : "";
};

const toPersistedSettings = (
  settings: AdminSettingsContent,
): PersistedAdminSettingsContent => ({
  commerce: {
    expressShipping: toPersistedNumber(settings.commerce.expressShipping),
    freeShippingThreshold: toPersistedNumber(
      settings.commerce.freeShippingThreshold,
    ),
    gstRate: toPersistedNumber(settings.commerce.gstRate),
    holdMinutes: toPersistedNumber(settings.commerce.holdMinutes),
    standardShipping: toPersistedNumber(settings.commerce.standardShipping),
  },
  integrations: {
    electricRealtimeEnabled: settings.integrations.electricRealtimeEnabled,
    razorpayEnabled: settings.integrations.razorpayEnabled,
    resendEmailEnabled: settings.integrations.resendEmailEnabled,
  },
  operations: {
    maintenanceMessage: settings.operations.maintenanceMessage,
    maintenanceMode: settings.operations.maintenanceMode,
    supportEmail: settings.operations.supportEmail,
    supportPhone: settings.operations.supportPhone,
  },
});

function StatusNote({
  children,
  tone = "warning",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <div
      className={`rounded-xl border p-3 text-sm ${
        tone === "warning"
          ? "border-amber-300/60 bg-amber-50 text-amber-950"
          : "border-border/70 bg-background/70 text-muted-foreground"
      }`}
    >
      <div className="flex gap-2">
        {tone === "warning" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="leading-6">{children}</div>
      </div>
    </div>
  );
}

function NumberSettingInput({
  description,
  disabled,
  id,
  label,
  min,
  onChange,
  placeholder = "0",
  prefix,
  step,
  suffix,
  value,
}: {
  description: string;
  disabled: boolean;
  id: string;
  label: string;
  min?: number;
  onChange: (value: NumberDraft) => void;
  placeholder?: string;
  prefix?: string;
  step?: string;
  suffix?: string;
  value: NumberDraft;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <Input
          className={`${prefix ? "pl-8" : ""} ${suffix ? "pr-14" : ""}`}
          disabled={disabled}
          id={id}
          min={min}
          onChange={(event) => onChange(parseNumberInput(event.target.value))}
          placeholder={placeholder}
          step={step}
          type="number"
          value={toInputValue(value)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function PasswordField({
  autoComplete,
  disabled,
  id,
  label,
  onChange,
  onGenerate,
  placeholder,
  value,
}: {
  autoComplete?: string;
  disabled?: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  onGenerate?: () => void;
  placeholder?: string;
  value: string;
}) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Input
            autoComplete={autoComplete}
            className="pr-10"
            disabled={disabled}
            id={id}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            type={isVisible ? "text" : "password"}
            value={value}
          />

          <Button
            aria-label={isVisible ? `Hide ${label}` : `Show ${label}`}
            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
            disabled={disabled}
            onClick={() => setIsVisible((prev) => !prev)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {isVisible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        </div>

        {onGenerate ? (
          <Button
            className="shrink-0 gap-2"
            disabled={disabled}
            onClick={onGenerate}
            type="button"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
            Generate
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  description,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/60 p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          <Badge variant="outline">Saved only</Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettingsContent>(() =>
    createBlankSettings(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] =
    useState<PasswordFormState>(defaultPasswordForm);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/v2/globals/${SETTINGS_SLUG}`);
        if (!response.ok) {
          setIsLoading(false);
          return;
        }

        const data = (await response.json()) as {
          content?: unknown;
        };

        setSettings(normalizeLoadedSettings(data.content));
      } catch {
        toast.error("Unable to load settings. Showing blank defaults.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const gstPercentDisplay = useMemo(
    () => toGstInputValue(settings.commerce.gstRate),
    [settings.commerce.gstRate],
  );

  const save = async () => {
    setIsSaving(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/v2/globals/${SETTINGS_SLUG}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: toPersistedSettings(settings) }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setStatus("Settings saved successfully.");
      toast.success("Settings saved.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save settings.";
      setStatus(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const resetDraftToBlankDefaults = () => {
    setSettings(createBlankSettings());
    setStatus("Draft reset to blank defaults. Save to persist.");
    toast.success("Draft reset to blank defaults.");
  };

  const updatePasswordField = <TKey extends keyof PasswordFormState>(
    key: TKey,
    value: PasswordFormState[TKey],
  ) => {
    setPasswordForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const generateNewPassword = () => {
    const generatedPassword = generateTemporaryPassword();

    setPasswordForm((prev) => ({
      ...prev,
      confirmNewPassword: generatedPassword,
      newPassword: generatedPassword,
    }));

    setPasswordError(null);
    setPasswordStatus(
      "Generated a secure password. Use the eye icon to review it before updating.",
    );
    toast.success("Generated a secure password.");
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
        throw new Error(await readErrorMessage(response));
      }

      setPasswordForm(defaultPasswordForm);
      setPasswordStatus("Password updated successfully.");
      toast.success("Password updated.");
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : "Unable to update password.",
      );
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const updateCommerce = <TKey extends keyof AdminSettingsContent["commerce"]>(
    key: TKey,
    value: AdminSettingsContent["commerce"][TKey],
  ) => {
    setSettings((prev) => ({
      ...prev,
      commerce: {
        ...prev.commerce,
        [key]: value,
      },
    }));
  };

  const updateIntegrations = <
    TKey extends keyof AdminSettingsContent["integrations"],
  >(
    key: TKey,
    value: AdminSettingsContent["integrations"][TKey],
  ) => {
    setSettings((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        [key]: value,
      },
    }));
  };

  const updateOperations = <
    TKey extends keyof AdminSettingsContent["operations"],
  >(
    key: TKey,
    value: AdminSettingsContent["operations"][TKey],
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Admin configuration
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Settings
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure saved commerce defaults, operational notes, and your own
            admin password.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {status ? (
            <p className="text-sm text-muted-foreground">{status}</p>
          ) : null}

          <Button
            className="gap-2 rounded-full"
            disabled={isLoading || isSaving}
            onClick={resetDraftToBlankDefaults}
            type="button"
            variant="outline"
          >
            <RotateCcw className="h-4 w-4" />
            Reset draft
          </Button>

          <Button
            className="gap-2 rounded-full"
            disabled={isLoading || isSaving}
            onClick={() => void save()}
            type="button"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Settings
          </Button>
        </div>
      </div>

      <StatusNote>
        These settings are saved to{" "}
        <span className="font-mono">adminSettings</span>. Current code search
        shows most Commerce, Integration, and Operation controls are saved only
        until the website checkout/maintenance flows are explicitly wired to
        read them.
      </StatusNote>

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Commerce Defaults</CardTitle>
            <Badge variant="outline">Saved only</Badge>
          </div>
          <CardDescription>
            Shipping, GST, and reservation defaults. Blank fields are allowed
            while typing. Empty values are saved as 0.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <StatusNote tone="info">
            Checkout currently has a GST estimate helper, but this settings
            object is not yet confirmed as the live source for checkout totals.
          </StatusNote>

          <div className="grid gap-4 md:grid-cols-2">
            <NumberSettingInput
              description="Order subtotal above this amount may qualify for free shipping once wired."
              disabled={isLoading}
              id="free-shipping-threshold"
              label="Free Shipping Threshold"
              min={0}
              onChange={(value) =>
                updateCommerce("freeShippingThreshold", value)
              }
              placeholder="0"
              prefix="₹"
              value={settings.commerce.freeShippingThreshold}
            />

            <div className="space-y-2">
              <Label htmlFor="gst-rate">GST Rate</Label>
              <div className="relative">
                <Input
                  className="pr-10"
                  disabled={isLoading}
                  id="gst-rate"
                  min={0}
                  onChange={(event) =>
                    updateCommerce(
                      "gstRate",
                      parseGstPercentInput(event.target.value),
                    )
                  }
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={gstPercentDisplay}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Stored internally as a decimal, for example 12% is saved as
                0.12. Empty values save as 0.
              </p>
            </div>

            <NumberSettingInput
              description="Default standard shipping charge once checkout uses adminSettings."
              disabled={isLoading}
              id="standard-shipping"
              label="Standard Shipping"
              min={0}
              onChange={(value) => updateCommerce("standardShipping", value)}
              placeholder="0"
              prefix="₹"
              value={settings.commerce.standardShipping}
            />

            <NumberSettingInput
              description="Default express shipping charge once checkout uses adminSettings."
              disabled={isLoading}
              id="express-shipping"
              label="Express Shipping"
              min={0}
              onChange={(value) => updateCommerce("expressShipping", value)}
              placeholder="0"
              prefix="₹"
              value={settings.commerce.expressShipping}
            />

            <NumberSettingInput
              description="How long a cart reservation should be held once reservation logic reads this setting."
              disabled={isLoading}
              id="reservation-hold"
              label="Reservation Hold"
              min={0}
              onChange={(value) => updateCommerce("holdMinutes", value)}
              placeholder="0"
              suffix="min"
              value={settings.commerce.holdMinutes}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Integrations</CardTitle>
            <Badge variant="outline">Saved only</Badge>
          </div>
          <CardDescription>
            These toggles are saved for future integration control. Current live
            integrations appear to be controlled by code and environment
            variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            checked={settings.integrations.razorpayEnabled}
            description="Saved preference for payment availability. Wire checkout before relying on this as a live kill-switch."
            disabled={isLoading}
            label="Razorpay payments"
            onCheckedChange={(checked) =>
              updateIntegrations("razorpayEnabled", checked)
            }
          />

          <ToggleRow
            checked={settings.integrations.resendEmailEnabled}
            description="Saved preference for email delivery. Wire email senders before treating this as a live provider toggle."
            disabled={isLoading}
            label="Resend email delivery"
            onCheckedChange={(checked) =>
              updateIntegrations("resendEmailEnabled", checked)
            }
          />

          <ToggleRow
            checked={settings.integrations.electricRealtimeEnabled}
            description="Saved preference for live sync. Wire admin table data sources before treating this as a live realtime toggle."
            disabled={isLoading}
            label="ElectricSQL live sync"
            onCheckedChange={(checked) =>
              updateIntegrations("electricRealtimeEnabled", checked)
            }
          />
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Operations</CardTitle>
            <Badge variant="outline">Saved only</Badge>
          </div>
          <CardDescription>
            Support contact details and storefront maintenance messaging. These
            fields need storefront wiring before they affect the live website.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusNote>
            Maintenance mode is saved here, but current code search did not show
            the storefront reading it to block checkout or show a maintenance
            screen.
          </StatusNote>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="support-email">Support Email</Label>
              <Input
                disabled={isLoading}
                id="support-email"
                onChange={(event) =>
                  updateOperations("supportEmail", event.target.value)
                }
                placeholder="hello@fromthetrunk.shop"
                type="email"
                value={settings.operations.supportEmail}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-phone">Support Phone</Label>
              <Input
                disabled={isLoading}
                id="support-phone"
                onChange={(event) =>
                  updateOperations("supportPhone", event.target.value)
                }
                placeholder="+91..."
                value={settings.operations.supportPhone}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maintenance-message">Maintenance Message</Label>
            <Textarea
              className="min-h-24"
              disabled={isLoading}
              id="maintenance-message"
              onChange={(event) =>
                updateOperations("maintenanceMessage", event.target.value)
              }
              placeholder="The storefront is temporarily unavailable. Please check back soon."
              value={settings.operations.maintenanceMessage}
            />
          </div>

          <ToggleRow
            checked={settings.operations.maintenanceMode}
            description="Saved maintenance preference. Wire storefront middleware/page rendering before relying on it."
            disabled={isLoading}
            label="Maintenance mode"
            onCheckedChange={(checked) =>
              updateOperations("maintenanceMode", checked)
            }
          />
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Change my password</CardTitle>
            <Badge variant="default">Live</Badge>
          </div>
          <CardDescription>
            Update the password for the admin account you are currently logged
            into. Existing admins should change their own passwords from here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusNote tone="info">
            This live flow currently requires your current password. A future
            recovery flow can verify the logged-in admin through email or SMS
            OTP before allowing a password change.
          </StatusNote>

          <div className="grid gap-4 md:grid-cols-3">
            <PasswordField
              autoComplete="current-password"
              id="current-password"
              label="Current Password"
              onChange={(value) =>
                updatePasswordField("currentPassword", value)
              }
              value={passwordForm.currentPassword}
            />

            <PasswordField
              autoComplete="new-password"
              id="new-password"
              label="New Password"
              onChange={(value) => updatePasswordField("newPassword", value)}
              onGenerate={generateNewPassword}
              value={passwordForm.newPassword}
            />

            <PasswordField
              autoComplete="new-password"
              id="confirm-new-password"
              label="Confirm New Password"
              onChange={(value) =>
                updatePasswordField("confirmNewPassword", value)
              }
              value={passwordForm.confirmNewPassword}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {passwordRequirements}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="gap-2"
              disabled={isUpdatingPassword}
              onClick={() => void changePassword()}
              type="button"
            >
              {isUpdatingPassword ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Settings2 className="h-4 w-4" />
              )}
              {isUpdatingPassword ? "Updating..." : "Update my password"}
            </Button>

            {passwordError ? (
              <p className="text-sm text-destructive">{passwordError}</p>
            ) : null}

            {!passwordError && passwordStatus ? (
              <p className="text-sm text-muted-foreground">{passwordStatus}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Save settings after making changes. Saved-only controls will not
          affect live behavior until wired.
        </p>
        <Button
          className="gap-2 rounded-full"
          disabled={isLoading || isSaving}
          onClick={() => void save()}
          type="button"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
