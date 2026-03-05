"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Address } from "@/types/domain";

const fetchAddresses = async () => {
  const response = await fetch("/api/v2/addresses");
  if (!response.ok) {
    throw new Error("Unable to load addresses.");
  }
  return (await response.json()) as Address[];
};

const emptyForm = {
  label: "",
  name: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  phone: "",
  isDefault: false,
};

const toAddressForm = (address: Address) => ({
  label: address.label ?? "",
  name: address.name ?? "",
  line1: address.line1 ?? "",
  line2: address.line2 ?? "",
  city: address.city ?? "",
  state: address.state ?? "",
  postalCode: address.postalCode ?? "",
  country: address.country ?? "",
  phone: address.phone ?? "",
  isDefault: Boolean(address.isDefault),
});

export default function AddressesPage() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["addresses"],
    queryFn: fetchAddresses,
    enabled: Boolean(session?.user?.id),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const response = await fetch("/api/v2/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Unable to save address.");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<typeof form>;
    }) => {
      const response = await fetch(`/api/v2/addresses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Unable to update address.");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v2/addresses/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Unable to delete address.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });

  if (status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading session...</p>;
  }

  if (!session?.user?.id) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        Please sign in to manage your addresses.
        <Button asChild variant="link" className="px-0">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  const addresses = data ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-foreground">Addresses</h2>
        <p className="text-sm text-muted-foreground">
          Save delivery locations for faster checkout.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading addresses...</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Unable to load addresses.</p>
      ) : addresses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
          No addresses saved yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <div
              key={address.id}
              className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-soft"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {address.label || "Address"}
                </p>
                {address.isDefault && (
                  <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Default
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {address.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {address.city}, {address.state} {address.postalCode}
              </p>
              <p className="text-sm text-muted-foreground">{address.country}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(address.id);
                    setForm(toAddressForm(address));
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateMutation.mutate({
                      id: address.id,
                      payload: { isDefault: true },
                    })
                  }
                  disabled={updateMutation.isPending}
                >
                  Set default
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(address.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft"
        onSubmit={(event) => {
          event.preventDefault();
          if (editingId) {
            updateMutation.mutate({ id: editingId, payload: form });
          } else {
            createMutation.mutate(form);
          }
        }}
      >
        <h3 className="font-serif text-xl text-foreground">
          {editingId ? "Edit address" : "Add a new address"}
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={form.label}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, label: event.target.value }))
              }
              placeholder="Home, Studio, etc."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Recipient name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Full name"
            />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="line1">Street address</Label>
          <Input
            id="line1"
            value={form.line1}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, line1: event.target.value }))
            }
          />
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="line2">Apartment, suite, etc.</Label>
          <Input
            id="line2"
            value={form.line2}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, line2: event.target.value }))
            }
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={form.city}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, city: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              value={form.state}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, state: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postal">Postal code</Label>
            <Input
              id="postal"
              value={form.postalCode}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, postalCode: event.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={form.country}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, country: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <input
            id="isDefault"
            type="checkbox"
            checked={form.isDefault}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, isDefault: event.target.checked }))
            }
          />
          <Label htmlFor="isDefault">Set as default address</Label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="submit" className="rounded-full">
            {editingId ? "Save changes" : "Add address"}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
