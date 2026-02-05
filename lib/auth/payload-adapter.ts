import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";
import { randomBytes } from "crypto";

import { getPayloadClient } from "@/lib/payload";

const generatePassword = () => randomBytes(32).toString("hex");

const mapUser = (user: any): AdapterUser => ({
  id: user.id,
  email: user.email,
  emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
  name: user.name ?? null,
  image: user.image ?? null,
});

export const PayloadAdapter = (): Adapter => {
  return {
    async createUser(data) {
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
      return mapUser(user);
    },
    async getUser(id) {
      const payload = await getPayloadClient();
      try {
        const user = await payload.findByID({
          collection: "users",
          id,
          overrideAccess: true,
        });
        return user ? mapUser(user) : null;
      } catch {
        return null;
      }
    },
    async getUserByEmail(email) {
      const payload = await getPayloadClient();
      const result = await payload.find({
        collection: "users",
        where: { email: { equals: email } },
        limit: 1,
        overrideAccess: true,
      });
      const user = result.docs[0];
      return user ? mapUser(user) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
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
      const user = await payload.findByID({
        collection: "users",
        id: userId,
        overrideAccess: true,
      });
      return user ? mapUser(user) : null;
    },
    async updateUser(data) {
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
      return mapUser(user);
    },
    async deleteUser(id) {
      const payload = await getPayloadClient();
      await payload.delete({
        collection: "users",
        id,
        overrideAccess: true,
      });
    },
    async linkAccount(account) {
      const payload = await getPayloadClient();
      const created = await payload.create({
        collection: "auth_accounts",
        data: {
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
        },
        overrideAccess: true,
      });
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
      } as AdapterAccount & { id?: string; };
    },
    async unlinkAccount({ provider, providerAccountId }) {
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
    async createSession(session) {
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
    async getSessionAndUser(sessionToken) {
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
      const user = await payload.findByID({
        collection: "users",
        id: userId,
        overrideAccess: true,
      });
      if (!user) return null;
      return {
        session: {
          sessionToken: session.sessionToken,
          userId: userId,
          expires: new Date(session.expires),
        },
        user: mapUser(user),
      };
    },
    async updateSession(data) {
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
    async deleteSession(sessionToken) {
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
    async createVerificationToken(token) {
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
    async useVerificationToken({ identifier, token }) {
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
