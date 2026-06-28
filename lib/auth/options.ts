import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import TwitterProvider from "next-auth/providers/twitter";

import { getUserByEmail } from "@/db/queries/users";
import { DrizzleAdapter } from "@/lib/auth/drizzle-adapter";

const isProduction = process.env.NODE_ENV === "production";

const adminAuthCookies: NonNullable<NextAuthOptions["cookies"]> = {
  sessionToken: {
    name: `${isProduction ? "__Secure-" : ""}ftt-admin.session-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isProduction,
    },
  },
  callbackUrl: {
    name: `${isProduction ? "__Secure-" : ""}ftt-admin.callback-url`,
    options: {
      sameSite: "lax",
      path: "/",
      secure: isProduction,
    },
  },
  csrfToken: {
    name: `${isProduction ? "__Host-" : ""}ftt-admin.csrf-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isProduction,
    },
  },
  pkceCodeVerifier: {
    name: `${isProduction ? "__Secure-" : ""}ftt-admin.pkce.code_verifier`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isProduction,
      maxAge: 900,
    },
  },
  state: {
    name: `${isProduction ? "__Secure-" : ""}ftt-admin.state`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isProduction,
      maxAge: 900,
    },
  },
  nonce: {
    name: `${isProduction ? "__Secure-" : ""}ftt-admin.nonce`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isProduction,
    },
  },
};

const providers: NonNullable<NextAuthOptions["providers"]> = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      tenantId: process.env.AZURE_AD_TENANT_ID || "common",
    }),
  );
}

if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
  providers.push(
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
    }),
  );
}

providers.push(
  CredentialsProvider({
    id: "credentials",
    name: "Email and Password",
    credentials: {
      email: {
        label: "Email",
        type: "email",
      },
      password: {
        label: "Password",
        type: "password",
      },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password;

      if (!email || !password) {
        return null;
      }

      try {
        const user = await getUserByEmail(email);
        if (!user || !user.passwordHash) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          user.passwordHash,
        );
        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          role: user.role,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      } catch {
        return null;
      }
    },
  }),
);

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(),
  session: {
    strategy: "jwt",
  },
  providers,
  cookies: adminAuthCookies,

  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      if (user && "role" in user && typeof user.role === "string") {
        token.role = user.role;
      }

      return token;
    },
    async session({ session, token, user }) {
      const resolvedId =
        user?.id ?? (typeof token.id === "string" ? token.id : token.sub);

      if (session.user && resolvedId) {
        session.user.id = resolvedId;
        if (typeof token.role === "string") {
          session.user.role = token.role;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/account/sign-in",
  },
};
