import Link from "next/link";

import { ImportWizard } from "@/components/admin/import/import-wizard";

export default function AdminProductsImportPage() {
  return (
    <div className="space-y-6 px-4 sm:px-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href="/admin/products"
            className="hover:text-primary hover:underline"
          >
            Products
          </Link>
          <span>/</span>
          <span>Import</span>
        </div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Batch Import
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload a CSV file to import multiple products at once.
        </p>
      </div>

      <ImportWizard />
    </div>
  );
}
