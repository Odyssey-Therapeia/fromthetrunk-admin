"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-6 py-16">
      <div className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Create Account
        </p>
        <h1 className="font-serif text-3xl text-foreground">
          Join From the Trunk
        </h1>
        <p className="text-sm text-muted-foreground">
          Create your account to save favourites, track orders, and checkout faster.
        </p>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-5 shadow-soft"
        onSubmit={async (event) => {
          event.preventDefault();
          if (isSubmitting) return;

          setErrorMessage(null);

          if (password !== confirmPassword) {
            setErrorMessage("Passwords do not match.");
            return;
          }

          setIsSubmitting(true);

          try {
            const response = await fetch("/api/account/sign-up", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                email: email.trim(),
                password,
              }),
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
              setErrorMessage(
                data?.message || "Unable to create your account. Please try again."
              );
              return;
            }

            const result = await signIn("credentials", {
              redirect: false,
              email: email.trim(),
              password,
              callbackUrl: "/account/profile",
            });

            if (!result || result.error) {
              router.push(`/account/sign-in?email=${encodeURIComponent(email.trim())}`);
              return;
            }

            router.push(result.url || "/account/profile");
            router.refresh();
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            Minimum 8 characters, with uppercase, lowercase, and a number.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" className="w-full rounded-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/account/sign-in"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
