import type { Metadata } from "next";
import { ReactNode } from "react";

import { AccountShell } from "@/components/account/account-shell";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
