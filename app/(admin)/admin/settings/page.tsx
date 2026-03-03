import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Workspace-level toggles and integrations arrive in the next iteration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin Settings</CardTitle>
          <CardDescription>Placeholder for shipping, tax and integration configuration.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This page is wired and ready for future settings modules.
        </CardContent>
      </Card>
    </div>
  );
}
