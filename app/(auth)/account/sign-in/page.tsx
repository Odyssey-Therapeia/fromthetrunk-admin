import { redirect } from "next/navigation";

type LegacyAdminSignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyAdminSignInPage({
  searchParams,
}: LegacyAdminSignInPageProps) {
  const params = searchParams ? await searchParams : {};
  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;

  redirect(
    callbackUrl
      ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "/login",
  );
}
