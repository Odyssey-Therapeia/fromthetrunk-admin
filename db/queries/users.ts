import { desc, eq, inArray, InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { addresses, users } from "@/db/schema";

type AddressRecord = InferSelectModel<typeof addresses>;
type UserRecord = InferSelectModel<typeof users>;

export type UserWithDefaultAddress = UserRecord & {
  defaultAddress: AddressRecord | null;
};

export type UpdateUserInput = Partial<
  Omit<InferInsertModel<typeof users>, "createdAt" | "id" | "updatedAt">
>;

export type CheckoutCustomerInput = {
  email: string;
  name?: string | null;
  phone?: string | null;
};

const hydrateUsers = async (rows: UserRecord[]): Promise<UserWithDefaultAddress[]> => {
  if (rows.length === 0) return [];

  const addressIds = Array.from(
    new Set(
      rows.map((row) => row.defaultAddressId).filter((value): value is string => Boolean(value))
    )
  );

  const addressRows =
    addressIds.length > 0
      ? await withRetry(() => db.select().from(addresses).where(inArray(addresses.id, addressIds)))
      : [];
  const addressById = new Map(addressRows.map((row) => [row.id, row]));

  return rows.map((row) => ({
    ...row,
    defaultAddress: row.defaultAddressId ? addressById.get(row.defaultAddressId) ?? null : null,
  }));
};

export const listUsers = async (options?: {
  limit?: number;
  offset?: number;
  role?: UserRecord["role"];
}): Promise<UserWithDefaultAddress[]> => {
  const {
    limit = 100,
    offset = 0,
    role,
  } = options ?? {};

  const whereClause = role ? eq(users.role, role) : undefined;

  const rows = await withRetry(() =>
    db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset)
  );

  return hydrateUsers(rows);
};

export const getUserById = async (id: string): Promise<UserWithDefaultAddress | null> => {
  const [row] = await withRetry(() =>
    db.select().from(users).where(eq(users.id, id)).limit(1)
  );
  if (!row) return null;
  const [hydrated] = await hydrateUsers([row]);
  return hydrated ?? null;
};

export const getUserByEmail = async (email: string): Promise<UserWithDefaultAddress | null> => {
  const [row] = await withRetry(() =>
    db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)
  );

  if (!row) return null;
  const [hydrated] = await hydrateUsers([row]);
  return hydrated ?? null;
};

export const getOrCreateCheckoutCustomer = async ({
  email,
  name,
  phone,
}: CheckoutCustomerInput): Promise<UserWithDefaultAddress | null> => {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    if (existing.passwordHash) return null;
    return existing;
  }

  try {
    const created = requireFirstRow(
      await db
        .insert(users)
        .values({
          email: normalizedEmail,
          metadata: {
            source: "checkout",
          },
          name: name?.trim() || null,
          phone: phone?.trim() || null,
          role: "customer",
          updatedAt: new Date(),
        })
        .returning(),
      "Failed to create checkout customer."
    );

    const [hydrated] = await hydrateUsers([created]);
    if (!hydrated) {
      throw new Error("Failed to load checkout customer.");
    }

    return hydrated;
  } catch (error) {
    const raced = await getUserByEmail(normalizedEmail);
    if (raced) {
      if (raced.passwordHash) return null;
      return raced;
    }
    throw error;
  }
};

export const updateUser = async (
  userId: string,
  input: UpdateUserInput
): Promise<UserWithDefaultAddress | null> => {
  const updated = getFirstRow(
    await db
      .update(users)
      .set({
        ...input,
        email: input.email?.toLowerCase(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning()
  );

  if (!updated) return null;
  const [hydrated] = await hydrateUsers([updated]);
  return hydrated ?? null;
};
