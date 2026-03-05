"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type AdminTopBarProps = {
  email: null | string;
  image: null | string;
  name: null | string;
};

const getInitials = (name: null | string, email: null | string) => {
  if (name && name.trim().length > 0) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return email?.slice(0, 2).toUpperCase() ?? "AD";
};

export function AdminTopBar({
  email,
  image,
  name,
}: AdminTopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur md:px-6">
      <div>
        <p className="text-sm text-muted-foreground">Control center</p>
        <h1 className="text-base font-semibold text-foreground">From the Trunk</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right md:block">
          <p className="text-sm font-medium">{name ?? "Admin"}</p>
          <p className="text-xs text-muted-foreground">{email ?? "admin@fromthetrunk.com"}</p>
        </div>

        <Avatar className="h-9 w-9">
          <AvatarImage alt={name ?? "Admin"} src={image ?? undefined} />
          <AvatarFallback>{getInitials(name, email)}</AvatarFallback>
        </Avatar>

        <Button
          className="gap-2"
          onClick={() => signOut({ callbackUrl: "/account/sign-in" })}
          size="sm"
          type="button"
          variant="outline"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
