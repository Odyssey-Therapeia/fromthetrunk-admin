"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fetchProfile = async () => {
  const response = await fetch("/api/v2/users/me");
  if (!response.ok) {
    throw new Error("Unable to load profile.");
  }
  return response.json();
};

const updateProfile = async (payload: { name: string; phone: string }) => {
  const response = await fetch("/api/v2/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to update profile.");
  }
  return response.json();
};

const requestEmailChange = async (payload: { newEmail: string }) => {
  const response = await fetch("/api/v2/users/me/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(json?.message ?? "Unable to request email change.");
  }
  return response.json();
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ name: null | string; phone: null | string }>({
    name: null,
    phone: null,
  });
  const [emailChangeForm, setEmailChangeForm] = useState<{ newEmail: string }>({ newEmail: "" });
  const [emailChangeSent, setEmailChangeSent] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    enabled: Boolean(session?.user?.id),
  });

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const emailChangeMutation = useMutation({
    mutationFn: requestEmailChange,
    onSuccess: () => {
      setEmailChangeSent(true);
      setEmailChangeForm({ newEmail: "" });
    },
  });

  if (status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading session...</p>;
  }

  if (!session?.user?.id) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        Please sign in to manage your profile.
        <Button asChild variant="link" className="px-0">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  const resolvedName = form.name ?? data?.name ?? "";
  const resolvedPhone = form.phone ?? data?.phone ?? "";

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-foreground">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Keep your contact details up to date.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Unable to load your profile.</p>
      ) : (
        <>
          <form
            className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate({
                name: resolvedName,
                phone: resolvedPhone,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={resolvedName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                value={resolvedPhone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Email address</Label>
              <Input value={data?.email ?? session.user.email ?? ""} disabled />
            </div>
            <Button type="submit" className="rounded-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save changes"}
            </Button>
            {mutation.isError && (
              <p className="text-sm text-destructive">
                Unable to save changes. Please try again.
              </p>
            )}
          </form>

          {/* P6-01: Email change with verification */}
          <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Change email address</h3>
              <p className="text-xs text-muted-foreground">
                A verification link will be sent to your new email address. Your email
                will only change after you confirm it.
              </p>
            </div>

            {emailChangeSent ? (
              <p className="text-sm text-foreground">
                Check your new inbox — a verification link has been sent.
              </p>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (emailChangeForm.newEmail) {
                    emailChangeMutation.mutate({ newEmail: emailChangeForm.newEmail });
                  }
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="newEmail">New email address</Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={emailChangeForm.newEmail}
                    onChange={(e) =>
                      setEmailChangeForm({ newEmail: e.target.value })
                    }
                    required
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="rounded-full"
                  disabled={emailChangeMutation.isPending}
                >
                  {emailChangeMutation.isPending ? "Sending..." : "Send verification link"}
                </Button>
                {emailChangeMutation.isError && (
                  <p className="text-sm text-destructive">
                    {emailChangeMutation.error instanceof Error
                      ? emailChangeMutation.error.message
                      : "Unable to request email change."}
                  </p>
                )}
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
