import type { ReactNode } from "react";

import { RootLayout, metadata } from "@payloadcms/next/layouts";

import config from "@payload-config";
import { importMap } from "@/payload/importMap";
import { payloadAdminServerFunction } from "./payload-admin-server-function";

import "@payloadcms/next/css";
import "../../styles/admin-custom.css";

export { metadata };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={payloadAdminServerFunction}
    >
      {children}
    </RootLayout>
  );
}
