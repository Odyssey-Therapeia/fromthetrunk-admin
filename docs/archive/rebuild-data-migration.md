# Legacy Payload -> Rebuild Drizzle migration

This project now includes a repeatable migration script to copy legacy Payload data into the new Drizzle schema.

## Safety model

- Source database: `LEGACY_DATABASE_URL` (falls back to `DATABASE_URL`)
- Target database: `CUSTOM_DATABASE_URL` (falls back to `TARGET_DATABASE_URL`)
- The script aborts if source and target URLs are identical.
- Use `--dry-run` first to verify source counts before writing data.
- Use `--truncate-target` only when you intentionally want a full reset of rebuild tables.

## Command

Dry-run:

`LEGACY_DATABASE_URL="postgres://..." CUSTOM_DATABASE_URL="postgres://..." npm run migrate:payload-to-drizzle -- --dry-run`

Execute migration:

`LEGACY_DATABASE_URL="postgres://..." CUSTOM_DATABASE_URL="postgres://..." npm run migrate:payload-to-drizzle`

Reset rebuild tables, then migrate from scratch:

`LEGACY_DATABASE_URL="postgres://..." CUSTOM_DATABASE_URL="postgres://..." npm run migrate:payload-to-drizzle -- --truncate-target`

## What is migrated

- `users`, `addresses`, `wishlist_items`
- `media_assets`, `collections`
- `products`, `product_images`
- `tags` + `product_tags` (from legacy product occasions)
- `orders`, `order_items`, `order_events`
- `newsletter_subscribers`
- `auth_accounts`, `auth_sessions`, `auth_verification_tokens`
- `site_config` globals (`homePage`, `collectionPage`, `ourStoryPage`, `howItWorksPage`)

## Notes

- Prices are converted from rupees to paise during migration.
- Product/image and product/tag links are restored in rebuild tables.
- Migration is idempotent through upserts and can be rerun safely.
