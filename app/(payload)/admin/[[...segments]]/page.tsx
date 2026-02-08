import { RootPage } from "@payloadcms/next/views";

import config from "@/payload.config";
import { importMap } from "@/payload/importMap";

export default function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }> | { segments?: string[] };
  searchParams:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}) {
  return (
    <RootPage
      config={config}
      importMap={importMap}
      params={Promise.resolve(params as { segments?: string[] })}
      searchParams={Promise.resolve(
        searchParams as Record<string, string | string[] | undefined>
      )}
    />
  );
}
