import {
  and,
  eq,
} from "drizzle-orm";
import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";
import { randomBytes } from "crypto";

import { db } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import {
  authAccounts,
  authSessions,
  authVerificationTokens,
  users,
} from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";

const generatePassword = () => randomBytes(32).toString("hex");

const mapUser = (user: typeof users.$inferSelect): AdapterUser => ({
  email: user.email,
  emailVerified: user.emailVerified,
  id: user.id,
  image: user.image,
  name: user.name,
});

const mapSession = (session: typeof authSessions.$inferSelect): AdapterSession => ({
  expires: session.expires,
  sessionToken: session.sessionToken,
  userId: session.userId,
});

export const DrizzleAdapter = (): Adapter => {
  return {
    async createUser(data: Omit<AdapterUser, "id">) {
      if (!data.email) {
        throw new Error("Email is required to create a user.");
      }

      const created = requireFirstRow(
        await db
          .insert(users)
          .values({
            email: data.email.toLowerCase(),
            emailVerified: data.emailVerified ?? null,
            image: data.image ?? null,
            name: data.name ?? null,
            passwordHash: generatePassword(),
            role: "customer",
            updatedAt: new Date(),
          })
          .returning(),
        "Failed to create user."
      );

      const emailTemplate = welcomeEmail(data.name ?? "");
      sendEmail({
        html: emailTemplate.html,
        subject: emailTemplate.subject,
        to: data.email,
      }).catch(() => undefined);

      return mapUser(created);
    },

    async getUser(id: string) {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return user ? mapUser(user) : null;
    },

    async getUserByEmail(email: string) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      return user ? mapUser(user) : null;
    },

    async getUserByAccount({
      provider,
      providerAccountId,
    }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      const [result] = await db
        .select({
          user: users,
        })
        .from(authAccounts)
        .innerJoin(users, eq(authAccounts.userId, users.id))
        .where(
          and(
            eq(authAccounts.provider, provider),
            eq(authAccounts.providerAccountId, providerAccountId)
          )
        )
        .limit(1);

      return result ? mapUser(result.user) : null;
    },

    async updateUser(data: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
      if (!data.id) {
        throw new Error("User id is required");
      }

      const updated = getFirstRow(
        await db
          .update(users)
          .set({
            email: data.email?.toLowerCase(),
            emailVerified: data.emailVerified ?? undefined,
            image: data.image,
            name: data.name,
            updatedAt: new Date(),
          })
          .where(eq(users.id, data.id))
          .returning()
      );

      if (!updated) {
        throw new Error("Failed to update user.");
      }

      return mapUser(updated);
    },

    async deleteUser(id: string) {
      await db.delete(users).where(eq(users.id, id));
    },

    async linkAccount(account: AdapterAccount) {
      const values = {
        access_token: account.access_token ?? null,
        expires_at: account.expires_at ?? null,
        id_token: account.id_token ?? null,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refresh_token: account.refresh_token ?? null,
        scope: account.scope ?? null,
        session_state: account.session_state?.toString() ?? null,
        token_type: account.token_type?.toLowerCase() ?? null,
        type: account.type,
        updatedAt: new Date(),
        userId: account.userId,
      };

      await db
        .insert(authAccounts)
        .values(values)
        .onConflictDoUpdate({
          set: values,
          target: [authAccounts.provider, authAccounts.providerAccountId],
        });

      return {
        ...account,
        token_type: account.token_type?.toLowerCase() as Lowercase<string> | undefined,
      };
    },

    async unlinkAccount({
      provider,
      providerAccountId,
    }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      await db
        .delete(authAccounts)
        .where(
          and(
            eq(authAccounts.provider, provider),
            eq(authAccounts.providerAccountId, providerAccountId)
          )
        );
    },

    async createSession(session: AdapterSession) {
      const created = requireFirstRow(
        await db
          .insert(authSessions)
          .values({
            expires: session.expires,
            sessionToken: session.sessionToken,
            userId: session.userId,
          })
          .returning(),
        "Failed to create session."
      );

      return mapSession(created);
    },

    async getSessionAndUser(sessionToken: string) {
      const [result] = await db
        .select({
          session: authSessions,
          user: users,
        })
        .from(authSessions)
        .innerJoin(users, eq(authSessions.userId, users.id))
        .where(eq(authSessions.sessionToken, sessionToken))
        .limit(1);

      if (!result) return null;

      return {
        session: mapSession(result.session),
        user: mapUser(result.user),
      };
    },

    async updateSession(
      data: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">
    ) {
      const updated = getFirstRow(
        await db
          .update(authSessions)
          .set({
            expires: data.expires,
            userId: data.userId,
          })
          .where(eq(authSessions.sessionToken, data.sessionToken))
          .returning()
      );

      return updated ? mapSession(updated) : null;
    },

    async deleteSession(sessionToken: string) {
      await db.delete(authSessions).where(eq(authSessions.sessionToken, sessionToken));
    },

    async createVerificationToken(token: VerificationToken) {
      const created = requireFirstRow(
        await db
          .insert(authVerificationTokens)
          .values({
            expires: token.expires,
            identifier: token.identifier,
            token: token.token,
          })
          .returning(),
        "Failed to create verification token."
      );

      return {
        expires: created.expires,
        identifier: created.identifier,
        token: created.token,
      };
    },

    async useVerificationToken({
      identifier,
      token,
    }: Pick<VerificationToken, "identifier" | "token">) {
      const [existing] = await db
        .select()
        .from(authVerificationTokens)
        .where(
          and(
            eq(authVerificationTokens.identifier, identifier),
            eq(authVerificationTokens.token, token)
          )
        )
        .limit(1);

      if (!existing) return null;

      await db
        .delete(authVerificationTokens)
        .where(
          and(
            eq(authVerificationTokens.identifier, identifier),
            eq(authVerificationTokens.token, token)
          )
        );

      return {
        expires: existing.expires,
        identifier: existing.identifier,
        token: existing.token,
      };
    },
  };
};
