import { desc, eq, inArray, InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db } from "@/db";
import { addresses, users } from "@/db/schema";

type AddressRecord = InferSelectModel<typeof addresses>;
type UserRecord = InferSelectModel<typeof users>;

export type UserWithDefaultAddress = UserRecord & {
  defaultAddress: AddressRecord | null;
};

export type UpdateUserInput = Partial<
  Omit<InferInsertModel<typeof users>, "createdAt" | "id" | "updatedAt">
>;

const hydrateUsers = async (rows: UserRecord[]): Promise<UserWithDefaultAddress[]> => {
  if (rows.length === 0) return [];

  const addressIds = Array.from(
    new Set(
      rows.map((row) => row.defaultAddressId).filter((value): value is string => Boolean(value))
    )
  );

  const addressRows =
    addressIds.length > 0
      ? await db.select().from(addresses).where(inArray(addresses.id, addressIds))
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

  const rows = await db
    .select()
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return hydrateUsers(rows);
};

export const getUserById = async (id: string): Promise<UserWithDefaultAddress | null> => {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!row) return null;
  const [hydrated] = await hydrateUsers([row]);
  return hydrated ?? null;
};

export const getUserByEmail = async (email: string): Promise<UserWithDefaultAddress | null> => {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!row) return null;
  const [hydrated] = await hydrateUsers([row]);
  return hydrated ?? null;
};

export const updateUser = async (
  userId: string,
  input: UpdateUserInput
): Promise<UserWithDefaultAddress | null> => {
  const [updated] = await db
    .update(users)
    .set({
      ...input,
      email: input.email?.toLowerCase(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) return null;
  const [hydrated] = await hydrateUsers([updated]);
  return hydrated ?? null;
};
