import type { ReactNode } from "react";

import { RootLayout, handleServerFunctions, metadata } from "@payloadcms/next/layouts";

import config from "@/payload.config";
import { importMap } from "@/payload/importMap";

export { metadata };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={handleServerFunctions}
    >
      {children}
    </RootLayout>
  );
}
