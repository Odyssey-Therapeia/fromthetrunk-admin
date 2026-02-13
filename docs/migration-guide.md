# Schema Migration Guide

This document lists all schema changes introduced during production finalization.
Before deploying, run `npm run payload:migrate:create` to generate the migration
file, then `npm run payload:migrate` to apply it.

## New Fields on Existing Collections

### Products Collection

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `stockStatus` | select (available/reserved/sold) | `available` | Inventory tracking for 1-of-1 items |
| `reservedUntil` | date | null | Auto-set by cart reservation API |
| `soldAt` | date | null | Auto-set by payment verification |

### Orders Collection

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `shippingCost` | number | 0 | Calculated server-side |
| `shippingMethod` | select (standard/express) | null | Selected at checkout |
| `taxRate` | number | null | Currently 0.12 (12% GST) |
| `taxAmount` | number | null | subtotal × taxRate |
| `total` | number | null | subtotal + shippingCost + taxAmount |
| `paymentGateway` | text | null | "razorpay" |
| `razorpayOrderId` | text | null | Razorpay order reference |
| `paymentId` | text | null | Razorpay payment reference |
| `paymentStatus` | select (pending/paid/failed/refunded) | `pending` | Payment lifecycle |
| `paymentMethod` | text | null | e.g. "card", "upi" |

### Users Collection

| Field | Type | Notes |
|-------|------|-------|
| `wishlist` | relationship (products, hasMany) | User's saved/favorited products |

## New Collections

### `newsletter_subscribers`

| Field | Type | Notes |
|-------|------|-------|
| `email` | email (required, unique) | Subscriber email |
| `status` | select (pending/confirmed/unsubscribed) | Double opt-in state |
| `confirmToken` | text (hidden) | One-time confirmation token |
| `confirmedAt` | date | When email was confirmed |

## Migration Steps

```bash
# 1. Generate migration for all changes
npm run payload:migrate:create -- production-finalization

# 2. Review the generated migration file in /migrations/

# 3. Apply migration
npm run payload:migrate

# 4. Re-seed products with stock_status column
npm run seed:payload
```

## Rollback

If you need to rollback, the Payload migration system tracks applied
migrations. Run `npm run payload:migrate -- --rollback` to undo the
last migration.
