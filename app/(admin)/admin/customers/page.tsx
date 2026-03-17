"use client";

import { Loader2, ShieldPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);

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

export default function AdminCustomersPage() {
  const [createAdminDraft, setCreateAdminDraft] = useState<UserDraft>(defaultUserDraft);
  const [createAdminError, setCreateAdminError] = useState<string | null>(null);
  const [isCreateAdminOpen, setIsCreateAdminOpen] = useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState<PasswordDraft>(defaultPasswordDraft);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [passwordTarget, setPasswordTarget] = useState<null | UserRow>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/v2/users");
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as UserRow[];
      setUsers(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load users.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const adminCount = useMemo(
    () => users.filter((user) => user.role === "admin").length,
    [users]
  );
  const customerCount = users.length - adminCount;

  const handleCreateAdmin = async () => {
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

    setIsCreatingAdmin(true);
    try {
      const response = await fetch("/api/v2/users/admins", {
        body: JSON.stringify({
          email: createAdminDraft.email.trim(),
          name: createAdminDraft.name.trim(),
          password: createAdminDraft.password,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      toast.success("Admin user created.");
      setCreateAdminDraft(defaultUserDraft);
      setIsCreateAdminOpen(false);
      await loadUsers();
    } catch (error) {
      setCreateAdminError(
        error instanceof Error ? error.message : "Unable to create admin user."
      );
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleResetAdminPassword = async () => {
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

    setIsResettingPassword(true);
    try {
      const response = await fetch(`/api/v2/users/${passwordTarget.id}/password`, {
        body: JSON.stringify({
          newPassword: passwordDraft.newPassword,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      toast.success(`Password updated for ${passwordTarget.email}.`);
      setPasswordDraft(defaultPasswordDraft);
      setPasswordTarget(null);
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : "Unable to update admin password."
      );
    } finally {
      setIsResettingPassword(false);
    }
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
                Add another admin account with a starting password they can change later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="admin-name">Name</Label>
                <Input
                  id="admin-name"
                  onChange={(event) =>
                    setCreateAdminDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  value={createAdminDraft.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  onChange={(event) =>
                    setCreateAdminDraft((prev) => ({ ...prev, email: event.target.value }))
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
                    setCreateAdminDraft((prev) => ({ ...prev, password: event.target.value }))
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
              <p className="text-xs text-muted-foreground">{passwordRequirements}</p>
              {createAdminError ? (
                <p className="text-sm text-destructive">{createAdminError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                disabled={isCreatingAdmin}
                onClick={() => void handleCreateAdmin()}
                type="button"
              >
                {isCreatingAdmin ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
            <CardDescription>Accounts with dashboard access and management privileges.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{adminCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
            <CardDescription>Storefront customer accounts visible in the directory.</CardDescription>
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
            Admin accounts can have their passwords reset directly from this table.
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
              {users.length > 0 ? (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name ?? (user.role === "admin" ? "Admin" : "Customer")}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "admin" ? "default" : "outline"}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
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
                        <span className="text-xs text-muted-foreground">Customer account</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    {isLoading ? "Loading users..." : "No users found."}
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
                  setPasswordDraft((prev) => ({ ...prev, newPassword: event.target.value }))
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
            <p className="text-xs text-muted-foreground">{passwordRequirements}</p>
            {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
          </div>
          <DialogFooter>
            <Button
              disabled={isResettingPassword}
              onClick={() => void handleResetAdminPassword()}
              type="button"
            >
              {isResettingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
