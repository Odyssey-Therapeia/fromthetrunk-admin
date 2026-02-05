"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fetchProfile = async () => {
  const response = await fetch("/api/account/profile");
  if (!response.ok) {
    throw new Error("Unable to load profile.");
  }
  return response.json();
};

const updateProfile = async (payload: { name: string; phone: string }) => {
  const response = await fetch("/api/account/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to update profile.");
  }
  return response.json();
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", phone: "" });

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

  useEffect(() => {
    if (data) {
      setForm({ name: data.name ?? "", phone: data.phone ?? "" });
    }
  }, [data]);

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
        <form
          className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(form);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              value={form.phone}
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
      )}
    </div>
  );
}
