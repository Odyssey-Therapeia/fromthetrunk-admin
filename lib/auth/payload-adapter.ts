import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";
import { randomBytes } from "crypto";

import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";
import { getPayloadClient } from "@/lib/payload/server";

const generatePassword = () => randomBytes(32).toString("hex");

const mapUser = (user: Record<string, unknown>): AdapterUser => ({
  id: user.id as string,
  email: user.email as string,
  emailVerified: user.emailVerified ? new Date(user.emailVerified as string) : null,
  name: (user.name as string) ?? null,
  image: (user.image as string) ?? null,
});

export const PayloadAdapter = (): Adapter => {
  return {
    async createUser(data: Omit<AdapterUser, "id">) {
      if (!data.email) {
        throw new Error("Email is required to create a user.");
      }

      const payload = await getPayloadClient();
      const user = await payload.create({
        collection: "users",
        data: {
          email: data.email,
          name: data.name,
          image: data.image,
          emailVerified: data.emailVerified ?? null,
          role: "customer",
          password: generatePassword(),
        },
        overrideAccess: true,
      });

      // Send welcome email (non-blocking)
      if (data.email) {
        const email = welcomeEmail((data.name as string) ?? "");
        sendEmail({ to: data.email, subject: email.subject, html: email.html }).catch(() => {
          console.error("[AUTH] Failed to send welcome email to", data.email);
        });
      }

      return mapUser(user as Record<string, unknown>);
    },
    async getUser(id: string) {
      const payload = await getPayloadClient();
      try {
        const user = await payload.findByID({
          collection: "users",
          id,
          overrideAccess: true,
        });
        return user ? mapUser(user as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    },
    async getUserByEmail(email: string) {
      const payload = await getPayloadClient();
      const result = await payload.find({
        collection: "users",
        where: { email: { equals: email } },
        limit: 1,
        overrideAccess: true,
      });
      const user = result.docs[0];
      return user ? mapUser(user as Record<string, unknown>) : null;
    },
    async getUserByAccount({
      provider,
      providerAccountId,
    }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      const payload = await getPayloadClient();
      const result = await payload.find({
        collection: "auth_accounts",
        where: {
          and: [
            { provider: { equals: provider } },
            { providerAccountId: { equals: providerAccountId } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      });
      const account = result.docs[0];
      if (!account) return null;
      const userId = typeof account.user === "object" ? account.user.id : account.user;
      if (!userId) return null;

      try {
        const user = await payload.findByID({
          collection: "users",
          id: userId,
          overrideAccess: true,
        });
        return user ? mapUser(user as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    },
    async updateUser(data: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
      const payload = await getPayloadClient();
      if (!data.id) throw new Error("User id is required");
      const user = await payload.update({
        collection: "users",
        id: data.id,
        data: {
          email: data.email,
          name: data.name,
          image: data.image,
          emailVerified: data.emailVerified ?? null,
        },
        overrideAccess: true,
      });
      return mapUser(user as Record<string, unknown>);
    },
    async deleteUser(id: string) {
      const payload = await getPayloadClient();
      await payload.delete({
        collection: "users",
        id,
        overrideAccess: true,
      });
    },
    async linkAccount(account: AdapterAccount) {
      const payload = await getPayloadClient();
      const existing = await payload.find({
        collection: "auth_accounts",
        where: {
          and: [
            { provider: { equals: account.provider } },
            { providerAccountId: { equals: account.providerAccountId } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      });

      const existingDoc = existing.docs[0];
      const accountData = {
        user: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
        id_token: account.id_token,
        session_state: account.session_state,
      };

      if (existingDoc) {
        await payload.update({
          collection: "auth_accounts",
          id: existingDoc.id,
          data: accountData,
          overrideAccess: true,
        });
      } else {
        await payload.create({
          collection: "auth_accounts",
          data: accountData,
          overrideAccess: true,
        });
      }

      return {
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
        id_token: account.id_token,
        session_state: account.session_state,
      } as AdapterAccount;
    },
    async unlinkAccount({
      provider,
      providerAccountId,
    }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      const payload = await getPayloadClient();
      const result = await payload.find({
        collection: "auth_accounts",
        where: {
          and: [
            { provider: { equals: provider } },
            { providerAccountId: { equals: providerAccountId } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      });
      const account = result.docs[0];
      if (!account) return;
      await payload.delete({
        collection: "auth_accounts",
        id: account.id,
        overrideAccess: true,
      });
    },
    async createSession(session: AdapterSession) {
      const payload = await getPayloadClient();
      const created = await payload.create({
        collection: "auth_sessions",
        data: {
          sessionToken: session.sessionToken,
          user: session.userId,
          expires: session.expires,
        },
        overrideAccess: true,
      });
      return {
        sessionToken: created.sessionToken,
        userId: typeof created.user === "object" ? created.user.id : created.user,
        expires: new Date(created.expires),
      } as AdapterSession;
    },
    async getSessionAndUser(sessionToken: string) {
      const payload = await getPayloadClient();
      const result = await payload.find({
        collection: "auth_sessions",
        where: { sessionToken: { equals: sessionToken } },
        limit: 1,
        overrideAccess: true,
      });
      const session = result.docs[0];
      if (!session) return null;
      const userId = typeof session.user === "object" ? session.user.id : session.user;
      if (!userId) return null;

      let user: Record<string, unknown> | null = null;
      try {
        user = await payload.findByID({
          collection: "users",
          id: userId,
          overrideAccess: true,
        }) as Record<string, unknown>;
      } catch {
        return null;
      }

      if (!user) return null;
      return {
        session: {
          sessionToken: session.sessionToken,
          userId: userId,
          expires: new Date(session.expires),
        },
        user: mapUser(user as Record<string, unknown>),
      };
    },
    async updateSession(
      data: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">
    ) {
      const payload = await getPayloadClient();
      const result = await payload.find({
        collection: "auth_sessions",
        where: { sessionToken: { equals: data.sessionToken } },
        limit: 1,
        overrideAccess: true,
      });
      const session = result.docs[0];
      if (!session) return null;
      const updated = await payload.update({
        collection: "auth_sessions",
        id: session.id,
        data: {
          expires: data.expires ?? session.expires,
          sessionToken: data.sessionToken ?? session.sessionToken,
        },
        overrideAccess: true,
      });
      return {
        sessionToken: updated.sessionToken,
        userId: typeof updated.user === "object" ? updated.user.id : updated.user,
        expires: new Date(updated.expires),
      } as AdapterSession;
    },
    async deleteSession(sessionToken: string) {
      const payload = await getPayloadClient();
      const result = await payload.find({
        collection: "auth_sessions",
        where: { sessionToken: { equals: sessionToken } },
        limit: 1,
        overrideAccess: true,
      });
      const session = result.docs[0];
      if (!session) return;
      await payload.delete({
        collection: "auth_sessions",
        id: session.id,
        overrideAccess: true,
      });
    },
    async createVerificationToken(token: VerificationToken) {
      const payload = await getPayloadClient();
      await payload.create({
        collection: "auth_verification_tokens",
        data: {
          identifier: token.identifier,
          token: token.token,
          expires: token.expires,
        },
        overrideAccess: true,
      });
      return token;
    },
    async useVerificationToken({
      identifier,
      token,
    }: Pick<VerificationToken, "identifier" | "token">) {
      const payload = await getPayloadClient();
      const result = await payload.find({
        collection: "auth_verification_tokens",
        where: {
          and: [
            { identifier: { equals: identifier } },
            { token: { equals: token } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      });
      const verification = result.docs[0];
      if (!verification) return null;
      await payload.delete({
        collection: "auth_verification_tokens",
        id: verification.id,
        overrideAccess: true,
      });
      return {
        identifier: verification.identifier,
        token: verification.token,
        expires: new Date(verification.expires),
      } as VerificationToken;
    },
  };
};
