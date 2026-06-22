"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldPlus } from "lucide-react";
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
  DialogTrigger,
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

type PasswordDraft = {
  confirmPassword: string;
  newPassword: string;
};

type UserDraft = {
  confirmPassword: string;
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

const USERS_QUERY_KEY = ["admin-users"] as const;

const EMPTY_USERS: UserRow[] = [];

const defaultPasswordDraft: PasswordDraft = {
  confirmPassword: "",
  newPassword: "",
};

const defaultUserDraft: UserDraft = {
  confirmPassword: "",
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

export default function AdminCustomersPage() {
  const queryClient = useQueryClient();

  const [createAdminDraft, setCreateAdminDraft] =
    useState<UserDraft>(defaultUserDraft);
  const [createAdminError, setCreateAdminError] = useState<string | null>(null);
  const [isCreateAdminOpen, setIsCreateAdminOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] =
    useState<PasswordDraft>(defaultPasswordDraft);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<null | UserRow>(null);

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

  const createAdminMutation = useMutation({
    mutationFn: async (input: {
      email: string;
      name: string;
      password: string;
    }) => {
      const response = await fetch("/api/v2/users/admins", {
        body: JSON.stringify(input),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
    },
    onError: (error) => {
      setCreateAdminError(
        error instanceof Error ? error.message : "Unable to create admin user.",
      );
    },
    onSuccess: async () => {
      toast.success("Admin user created.");
      setCreateAdminDraft(defaultUserDraft);
      setIsCreateAdminOpen(false);
      await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (input: {
      email: string;
      newPassword: string;
      userId: string;
    }) => {
      const response = await fetch(`/api/v2/users/${input.userId}/password`, {
        body: JSON.stringify({
          newPassword: input.newPassword,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
    },
    onError: (error) => {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "Unable to update admin password.",
      );
    },
    onSuccess: (_data, variables) => {
      toast.success(`Password updated for ${variables.email}.`);
      setPasswordDraft(defaultPasswordDraft);
      setPasswordTarget(null);
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

    if (createAdminDraft.password !== createAdminDraft.confirmPassword) {
      setCreateAdminError("Password and confirmation must match.");
      return;
    }

    createAdminMutation.mutate({
      email: createAdminDraft.email.trim(),
      name: createAdminDraft.name.trim(),
      password: createAdminDraft.password,
    });
  };

  const handleResetAdminPassword = () => {
    if (!passwordTarget) return;

    setPasswordError(null);

    if (!meetsPasswordRequirements(passwordDraft.newPassword)) {
      setPasswordError(passwordRequirements);
      return;
    }

    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
      setPasswordError("Password and confirmation must match.");
      return;
    }

    resetPasswordMutation.mutate({
      email: passwordTarget.email,
      newPassword: passwordDraft.newPassword,
      userId: passwordTarget.id,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Users</h2>
          <p className="text-sm text-muted-foreground">
            Manage customer accounts, create admins, and reset admin passwords.
          </p>
        </div>

        <Dialog
          open={isCreateAdminOpen}
          onOpenChange={(open) => {
            setIsCreateAdminOpen(open);
            if (!open) {
              setCreateAdminDraft(defaultUserDraft);
              setCreateAdminError(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2" type="button">
              <ShieldPlus className="h-4 w-4" />
              Add Admin User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Admin User</DialogTitle>
              <DialogDescription>
                Add another admin account with a starting password they can
                change later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
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
                  type="email"
                  value={createAdminDraft.email}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Temporary Password</Label>
                <Input
                  id="admin-password"
                  onChange={(event) =>
                    setCreateAdminDraft((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                  type="password"
                  value={createAdminDraft.password}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password-confirm">Confirm Password</Label>
                <Input
                  id="admin-password-confirm"
                  onChange={(event) =>
                    setCreateAdminDraft((prev) => ({
                      ...prev,
                      confirmPassword: event.target.value,
                    }))
                  }
                  type="password"
                  value={createAdminDraft.confirmPassword}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {passwordRequirements}
              </p>
              {createAdminError ? (
                <p className="text-sm text-destructive">{createAdminError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                disabled={createAdminMutation.isPending}
                onClick={handleCreateAdmin}
                type="button"
              >
                {createAdminMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Create Admin
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
            Admin accounts can have their passwords reset directly from this
            table.
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
                <TableHead className="text-right">Actions</TableHead>
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
                        <Button
                          onClick={() => {
                            setPasswordDraft(defaultPasswordDraft);
                            setPasswordError(null);
                            setPasswordTarget(user);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Set Password
                        </Button>
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
        open={Boolean(passwordTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordDraft(defaultPasswordDraft);
            setPasswordError(null);
            setPasswordTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Admin Password</DialogTitle>
            <DialogDescription>
              {passwordTarget
                ? `Update the password for ${passwordTarget.name ?? passwordTarget.email}.`
                : "Update an admin password."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="reset-password">New Password</Label>
              <Input
                id="reset-password"
                onChange={(event) =>
                  setPasswordDraft((prev) => ({
                    ...prev,
                    newPassword: event.target.value,
                  }))
                }
                type="password"
                value={passwordDraft.newPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-password-confirm">Confirm Password</Label>
              <Input
                id="reset-password-confirm"
                onChange={(event) =>
                  setPasswordDraft((prev) => ({
                    ...prev,
                    confirmPassword: event.target.value,
                  }))
                }
                type="password"
                value={passwordDraft.confirmPassword}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {passwordRequirements}
            </p>
            {passwordError ? (
              <p className="text-sm text-destructive">{passwordError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              disabled={resetPasswordMutation.isPending}
              onClick={handleResetAdminPassword}
              type="button"
            >
              {resetPasswordMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
