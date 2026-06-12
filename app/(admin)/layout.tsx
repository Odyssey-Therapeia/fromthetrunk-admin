import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import "../globals.css";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopBar } from "@/components/admin/top-bar";
import { AgentPanelProvider } from "@/components/admin/agent-panel/agent-panel-provider";
import { ReleaseAnnouncementDialog } from "@/components/admin/release-announcement-dialog";
import { Providers } from "@/components/providers";
import { currentAdminRelease } from "@/lib/admin/releases";
import { getServerAuthSession } from "@/lib/auth/get-session";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({
  children,
}: AdminLayoutProps) {
  const session = await getServerAuthSession();
  if (!session || session.user.role !== "admin") {
    redirect("/account/sign-in?callbackUrl=/admin");
  }

  const user = {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };

  return (
    <html lang="en" className={sans.variable}>
      <body className="bg-background font-sans text-foreground">
        <Providers>
          <div className="min-h-screen bg-background">
            <div className="flex min-h-screen">
              <AdminSidebar user={user} />
              <div className="flex min-h-screen flex-1 flex-col bg-[linear-gradient(180deg,rgba(250,246,240,0.92),rgba(245,240,232,0.98))]">
                <AdminTopBar
                  email={user.email}
                  image={user.image}
                  name={user.name}
                />
                <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
              </div>
            </div>
          </div>
          <ReleaseAnnouncementDialog
            adminId={user.id}
            release={currentAdminRelease}
          />
          <AgentPanelProvider />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
