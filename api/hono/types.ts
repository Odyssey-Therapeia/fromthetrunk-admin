export type AuthUser = {
  email?: string | null;
  id: string;
  role?: string | null;
};

export type HonoVariables = {
  authUser: AuthUser | null;
};

export type HonoBindings = {
  Variables: HonoVariables;
};
