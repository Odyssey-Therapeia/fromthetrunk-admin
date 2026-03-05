# Schema and Data Migration Guide

This project now uses Drizzle-managed schema + query modules.

## 1) Current migration path

For legacy data import from the old platform schema into the current Drizzle schema, use:

```bash
npm run migrate:payload-to-drizzle
```

See full details in:
- [`docs/rebuild-data-migration.md`](./rebuild-data-migration.md)

## 2) Safe execution checklist

1. Run against staging first.
2. Keep source/target databases different.
3. Start with dry-run mode when available.
4. Validate row counts for high-value tables:
   - products
   - orders/order_items
   - users
   - collections
   - media_assets
5. Run app smoke tests after import.

## 3) Post-migration verification

- Open `/admin/products` and `/admin/orders`
- Verify storefront product listing and detail pages
- Verify account pages (orders, addresses, wishlist)
- Validate checkout creates + verifies payment order
- Confirm cron endpoint path is configured as:
  - `/api/v2/cron/release-reservations`

## 4) Rollback strategy

- Keep pre-migration backups/snapshots
- Restore DB snapshot if critical issues are detected
- Re-run migration only after fixing source mapping issues
