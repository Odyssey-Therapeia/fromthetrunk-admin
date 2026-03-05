import { access } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const requiredEnvVars = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_SERVER_URL",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "CRON_SECRET",
  "ADMIN_API_SECRET",
] as const;

const optionalAuthEnvVars = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AZURE_AD_CLIENT_ID",
  "AZURE_AD_CLIENT_SECRET",
  "TWITTER_CLIENT_ID",
  "TWITTER_CLIENT_SECRET",
] as const;

const requiredAssetPaths = [
  "public/favicon.ico",
  "public/apple-touch-icon.png",
  "public/icon-192.png",
  "public/icon-512.png",
] as const;

const invalidValueFragments = [
  "yourdomain.com",
  "generate-a-random",
  "placeholder",
  "[REDACTED]",
  "postgres://user:password@host/database",
  "rzp_live_xxxxx",
  "re_xxxxx",
];

const asBool = (value: string | undefined) => value === "true";

const hasPlaceholderValue = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return invalidValueFragments.some((fragment) =>
    normalized.includes(fragment.toLowerCase())
  );
};

const validateEnv = (): CheckResult[] => {
  const checks: CheckResult[] = [];

  for (const key of requiredEnvVars) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      checks.push({
        name: `ENV ${key}`,
        ok: false,
        detail: "Missing",
      });
      continue;
    }

    if (hasPlaceholderValue(value)) {
      checks.push({
        name: `ENV ${key}`,
        ok: false,
        detail: "Value looks like a placeholder",
      });
      continue;
    }

    checks.push({
      name: `ENV ${key}`,
      ok: true,
      detail: "Set",
    });
  }

  const hasGoogle =
    Boolean(process.env.GOOGLE_CLIENT_ID) && Boolean(process.env.GOOGLE_CLIENT_SECRET);
  const hasAzure =
    Boolean(process.env.AZURE_AD_CLIENT_ID) &&
    Boolean(process.env.AZURE_AD_CLIENT_SECRET);
  const hasTwitter =
    Boolean(process.env.TWITTER_CLIENT_ID) &&
    Boolean(process.env.TWITTER_CLIENT_SECRET);

  checks.push({
    name: "OAuth Provider Pair",
    ok: hasGoogle || hasAzure || hasTwitter,
    detail:
      hasGoogle || hasAzure || hasTwitter
        ? "At least one OAuth provider pair is configured"
        : `No complete provider pair found. Checked: ${optionalAuthEnvVars.join(", ")}`,
  });

  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  const authUrl = process.env.NEXTAUTH_URL;
  if (serverUrl) {
    try {
      const parsed = new URL(serverUrl);
      const isLocalhost = ["127.0.0.1", "localhost"].includes(parsed.hostname);
      const validProtocol = parsed.protocol === "https:" || isLocalhost;
      checks.push({
        name: "NEXT_PUBLIC_SERVER_URL format",
        ok: validProtocol,
        detail: validProtocol
          ? isLocalhost
            ? "Valid local development URL"
            : "Valid https URL"
          : "URL should use https unless it targets localhost",
      });
    } catch {
      checks.push({
        name: "NEXT_PUBLIC_SERVER_URL format",
        ok: false,
        detail: "Invalid URL value",
      });
    }
  }

  if (serverUrl && authUrl) {
    try {
      const publicOrigin = new URL(serverUrl).origin;
      const authOrigin = new URL(authUrl).origin;
      checks.push({
        name: "Auth/Public URL alignment",
        ok: publicOrigin === authOrigin,
        detail:
          publicOrigin === authOrigin
            ? "NEXTAUTH_URL and NEXT_PUBLIC_SERVER_URL are aligned"
            : `Mismatch detected: ${authOrigin} vs ${publicOrigin}`,
      });
    } catch {
      checks.push({
        name: "Auth/Public URL alignment",
        ok: false,
        detail: "Unable to compare NEXTAUTH_URL and NEXT_PUBLIC_SERVER_URL",
      });
    }
  }

  return checks;
};

const validateAssets = async (): Promise<CheckResult[]> => {
  const checks = await Promise.all(
    requiredAssetPaths.map(async (relativePath) => {
      try {
        await access(path.join(process.cwd(), relativePath));
        return {
          name: `Asset ${relativePath}`,
          ok: true,
          detail: "Present",
        } satisfies CheckResult;
      } catch {
        return {
          name: `Asset ${relativePath}`,
          ok: false,
          detail: "Missing",
        } satisfies CheckResult;
      }
    })
  );

  return checks;
};

const validateSeedData = async (): Promise<CheckResult> => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return {
      name: "Seed data check",
      ok: false,
      detail: "DATABASE_URL is missing",
    };
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query<{ count: string }>(
      "select count(*)::text as count from products where status = 'published'"
    );
    const count = Number(result.rows[0]?.count ?? 0);
    return {
      name: "Published products seeded",
      ok: count > 0,
      detail:
        count > 0
          ? `${count} published products found`
          : "No published products found. Run your Drizzle seed script.",
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unable to query products table";
    return {
      name: "Published products seeded",
      ok: false,
      detail,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
};

const printResults = (title: string, results: CheckResult[]) => {
  console.log(`\n${title}`);
  for (const check of results) {
    const icon = check.ok ? "✅" : "❌";
    console.log(`${icon} ${check.name} — ${check.detail}`);
  }
};

const run = async () => {
  const skipDb = asBool(process.env.DEMO_CHECK_SKIP_DB);

  const envChecks = validateEnv();
  const assetChecks = await validateAssets();
  const dbChecks = skipDb
    ? [
        {
          name: "Published products seeded",
          ok: true,
          detail: "Skipped via DEMO_CHECK_SKIP_DB=true",
        } satisfies CheckResult,
      ]
    : [await validateSeedData()];

  printResults("Environment checks", envChecks);
  printResults("Asset checks", assetChecks);
  printResults("Database checks", dbChecks);

  const failedCount = [...envChecks, ...assetChecks, ...dbChecks].filter(
    (check) => !check.ok
  ).length;

  console.log(
    `\nDemo readiness summary: ${failedCount === 0 ? "PASS" : "FAIL"} (${
      failedCount === 0 ? "0" : String(failedCount)
    } failing checks)`
  );

  if (failedCount > 0) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error("Demo readiness check failed unexpectedly:", error);
  process.exit(1);
});
