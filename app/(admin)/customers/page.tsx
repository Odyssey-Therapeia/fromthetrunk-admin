"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  ShieldPlus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type UserDraft = {
  email: string;
  name: string;
  password: string;
};

type UserRow = {
  createdAt: string;
  email: string;
  id: string;
  name: null | string;
  role: "admin" | "customer";
};

type AdminCredential = {
  email: string;
  name: string;
  password: string | null;
  passwordWasGenerated: boolean;
};

const USERS_QUERY_KEY = ["admin-users"] as const;

const EMPTY_USERS: UserRow[] = [];

const defaultUserDraft: UserDraft = {
  email: "",
  name: "",
  password: "",
};

const passwordRequirements =
  "Use at least 8 characters with uppercase, lowercase, and a number.";

const meetsPasswordRequirements = (value: string) =>
  value.length >= 8 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /[0-9]/.test(value);

const passwordUppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const passwordLowercase = "abcdefghijkmnopqrstuvwxyz";
const passwordNumbers = "23456789";
const passwordSymbols = "!@#$%&*?";
const passwordCharacters = `${passwordUppercase}${passwordLowercase}${passwordNumbers}${passwordSymbols}`;

const randomIndex = (length: number) => {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % length;
  }

  return Math.floor(Math.random() * length);
};

const pickCharacter = (characters: string) =>
  characters.charAt(randomIndex(characters.length));

const shuffleCharacters = (characters: string[]) => {
  const copy = [...characters];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy.join("");
};

const generateTemporaryPassword = () => {
  const requiredCharacters = [
    pickCharacter(passwordUppercase),
    pickCharacter(passwordLowercase),
    pickCharacter(passwordNumbers),
    pickCharacter(passwordSymbols),
  ];

  const remainingCharacters = Array.from({ length: 10 }, () =>
    pickCharacter(passwordCharacters),
  );

  return shuffleCharacters([...requiredCharacters, ...remainingCharacters]);
};

const readErrorMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string };
    if (typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
  } catch {
    // fall through to generic status message
  }

  return `Request failed with ${response.status}`;
};

const fetchUsers = async (): Promise<UserRow[]> => {
  const response = await fetch("/api/v2/users");
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as UserRow[];
};

function GeneratedPasswordBox({
  description,
  onChange,
  onCopy,
  onRegenerate,
  password,
  title,
}: {
  description: string;
  onChange?: (value: string) => void;
  onCopy: () => void;
  onRegenerate?: () => void;
  password: string;
  title: string;
}) {
  const inputId = `${title.toLowerCase().replace(/\s+/g, "-")}-input`;

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {onRegenerate ? (
            <Button
              className="gap-2"
              onClick={onRegenerate}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
          ) : null}

          <Button
            className="gap-2"
            onClick={onCopy}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy className="h-4 w-4" />
            Copy
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor={inputId}>Password</Label>
        <Input
          className="font-mono"
          id={inputId}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder="Use generated password or type your own"
          readOnly={!onChange}
          type="text"
          value={password}
        />
        {onChange ? (
          <p className="text-xs text-muted-foreground">
            You can edit this field directly, paste your own password, or
            regenerate a secure one.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CustomPasswordSetNotice({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function AdminCustomersPage() {
  const queryClient = useQueryClient();

  const [createAdminDraft, setCreateAdminDraft] =
    useState<UserDraft>(defaultUserDraft);
  const [createAdminError, setCreateAdminError] = useState<string | null>(null);
  const [createdAdminCredential, setCreatedAdminCredential] =
    useState<AdminCredential | null>(null);
  const [isCreateAdminOpen, setIsCreateAdminOpen] = useState(false);
  const [createPasswordWasGenerated, setCreatePasswordWasGenerated] =
    useState(true);

  const usersQuery = useQuery({
    queryFn: fetchUsers,
    queryKey: USERS_QUERY_KEY,
  });

  const users = usersQuery.data ?? EMPTY_USERS;

  const adminCount = useMemo(
    () => users.filter((user) => user.role === "admin").length,
    [users],
  );

  const customerCount = users.length - adminCount;

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Unable to copy. Please copy it manually.");
    }
  };

  const resetCreateAdminDialog = () => {
    setCreateAdminDraft(defaultUserDraft);
    setCreateAdminError(null);
    setCreatedAdminCredential(null);
    setCreatePasswordWasGenerated(true);
  };

  const openCreateAdminDialog = () => {
    setCreateAdminDraft({
      email: "",
      name: "",
      password: generateTemporaryPassword(),
    });
    setCreatePasswordWasGenerated(true);
    setCreateAdminError(null);
    setCreatedAdminCredential(null);
    setIsCreateAdminOpen(true);
  };

  const createAdminMutation = useMutation({
    mutationFn: async (input: {
      email: string;
      name: string;
      password: string;
      passwordWasGenerated: boolean;
    }) => {
      const response = await fetch("/api/v2/users/admins", {
        body: JSON.stringify({
          email: input.email,
          name: input.name,
          password: input.password,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      return (await response.json()) as UserRow;
    },
    onError: (error) => {
      setCreateAdminError(
        error instanceof Error ? error.message : "Unable to create admin user.",
      );
    },
    onSuccess: async (_createdUser, variables) => {
      toast.success("Admin user created.");
      setCreatedAdminCredential({
        email: variables.email,
        name: variables.name,
        password: variables.passwordWasGenerated ? variables.password : null,
        passwordWasGenerated: variables.passwordWasGenerated,
      });
      await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });

  const handleCreateAdmin = () => {
    setCreateAdminError(null);

    if (!createAdminDraft.name.trim() || !createAdminDraft.email.trim()) {
      setCreateAdminError("Name and email are required.");
      return;
    }

    if (!meetsPasswordRequirements(createAdminDraft.password)) {
      setCreateAdminError(passwordRequirements);
      return;
    }

    createAdminMutation.mutate({
      email: createAdminDraft.email.trim(),
      name: createAdminDraft.name.trim(),
      password: createAdminDraft.password,
      passwordWasGenerated: createPasswordWasGenerated,
    });
  };

  const createPasswordLabel = createdAdminCredential
    ? `Temporary password for ${createdAdminCredential.email}`
    : "Generated temporary password";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Users</h2>
          <p className="text-sm text-muted-foreground">
            View customer accounts and create admin accounts. Existing admins
            change their own passwords from Settings.
          </p>
        </div>

        <Button className="gap-2" onClick={openCreateAdminDialog} type="button">
          <ShieldPlus className="h-4 w-4" />
          Add Admin User
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Admins</CardTitle>
            <CardDescription>
              Accounts with dashboard access and management privileges.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{adminCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
            <CardDescription>
              Storefront customer accounts visible in the directory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{customerCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
          <CardDescription>
            Existing admin password changes are self-service only. Use Settings
            → Change my password from the logged-in account.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Notes</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {usersQuery.isError ? (
                <TableRow>
                  <TableCell className="text-destructive" colSpan={5}>
                    {usersQuery.error instanceof Error
                      ? usersQuery.error.message
                      : "Failed to load users."}
                  </TableCell>
                </TableRow>
              ) : users.length > 0 ? (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      {user.name ??
                        (user.role === "admin" ? "Admin" : "Customer")}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={user.role === "admin" ? "default" : "outline"}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.role === "admin" ? (
                        <span className="text-xs text-muted-foreground">
                          Password is changed from Settings
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Customer account
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    {usersQuery.isPending
                      ? "Loading users..."
                      : "No users found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={isCreateAdminOpen}
        onOpenChange={(open) => {
          setIsCreateAdminOpen(open);
          if (!open) {
            resetCreateAdminDialog();
          }
        }}
      >
        <DialogContent className="border-border/70 bg-card sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {createdAdminCredential
                ? "Admin User Created"
                : "Create Admin User"}
            </DialogTitle>
            <DialogDescription>
              {createdAdminCredential
                ? createdAdminCredential.password
                  ? "Copy the generated temporary password now and share it securely with the admin."
                  : "The admin account was created with the custom password you entered."
                : "Add another admin account. A secure temporary password is generated automatically, but you can type your own."}
            </DialogDescription>
          </DialogHeader>

          {createdAdminCredential ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Admin account created.</p>
                  <p className="mt-1 text-sm">
                    {createdAdminCredential.name} can sign in with{" "}
                    {createdAdminCredential.email}.
                  </p>
                </div>
              </div>

              {createdAdminCredential.password ? (
                <GeneratedPasswordBox
                  description="This generated password is shown here so you can copy it once and send it securely."
                  onCopy={() =>
                    void copyToClipboard(
                      createdAdminCredential.password ?? "",
                      createPasswordLabel,
                    )
                  }
                  password={createdAdminCredential.password}
                  title="Generated temporary password"
                />
              ) : (
                <CustomPasswordSetNotice
                  description="You typed the admin password manually, so it will not be shown again here. Share the password using your own secure channel."
                  title="Custom password set"
                />
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Name</Label>
                  <Input
                    id="admin-name"
                    onChange={(event) =>
                      setCreateAdminDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Priya Shah"
                    value={createAdminDraft.name}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    onChange={(event) =>
                      setCreateAdminDraft((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    placeholder="admin@example.com"
                    type="email"
                    value={createAdminDraft.email}
                  />
                </div>
              </div>

              <GeneratedPasswordBox
                description="A secure password is generated by default, but you can type your own below."
                onChange={(value) => {
                  setCreatePasswordWasGenerated(false);
                  setCreateAdminDraft((prev) => ({
                    ...prev,
                    password: value,
                  }));
                }}
                onCopy={() =>
                  void copyToClipboard(
                    createAdminDraft.password,
                    "Temporary password",
                  )
                }
                onRegenerate={() => {
                  setCreatePasswordWasGenerated(true);
                  setCreateAdminDraft((prev) => ({
                    ...prev,
                    password: generateTemporaryPassword(),
                  }));
                }}
                password={createAdminDraft.password}
                title="Password"
              />

              <p className="text-xs text-muted-foreground">
                {passwordRequirements}
              </p>

              {createAdminError ? (
                <p className="text-sm text-destructive">{createAdminError}</p>
              ) : null}
            </div>
          )}

          <DialogFooter>
            {createdAdminCredential ? (
              <Button
                onClick={() => {
                  resetCreateAdminDialog();
                  setIsCreateAdminOpen(false);
                }}
                type="button"
              >
                Done
              </Button>
            ) : (
              <Button
                disabled={createAdminMutation.isPending}
                onClick={handleCreateAdmin}
                type="button"
              >
                {createAdminMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Create Admin
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
