import { RootPage } from "@payloadcms/next/views";

import config from "@/payload.config";
import { importMap } from "@/payload/importMap";

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }> | { segments?: string[] };
  searchParams: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  return (
    <RootPage config={config} importMap={importMap} params={params} searchParams={searchParams} />
  );
}
