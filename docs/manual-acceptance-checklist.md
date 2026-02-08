# Manual Acceptance Checklist

## Auth and Identity

1. Sign in with Google.
   Expected: exactly one `users` doc and one `auth_accounts` doc linked to that user.
2. Sign in again with Google.
   Expected: existing user/account is reused, no duplicate user.
3. Sign out.
   Expected: `auth_sessions` record is removed.

## Account APIs

4. Call account APIs unauthenticated.
   Expected: `401` with `{ message, code }`.
5. Update profile with valid payload.
   Expected: update succeeds and persisted values round-trip.
6. Attempt to update another user’s address by ID.
   Expected: `403` with `{ message, code }`.
7. Mark an address as default.
   Expected: only one address remains `isDefault: true`.

## Storefront and Content

8. Open `/`.
   Expected: homepage copy comes from `homePage` global.
9. Open `/collection`.
   Expected: products render from Payload.
10. Open `/collection?collection=<slug>`.
    Expected: listing is filtered to that collection.
11. Open `/collection/<product-slug>`.
    Expected: product loads by slug, unknown slug returns 404.
12. Query products anonymously.
    Expected: draft products are not returned.

## Orders

13. Submit checkout with an empty cart payload.
    Expected: request is rejected with `400`.
14. Submit checkout with invalid product IDs.
    Expected: request is rejected with `400` and validation/details payload.
15. Tamper item price/subtotal in client request.
    Expected: server computes canonical item prices and subtotal.
16. Open account orders.
    Expected: user sees only their own orders.

## CMS Preview and Publish

17. Click Preview from product or collection in admin.
    Expected: front-end opens via `/api/draft/enable` and shows draft content.
18. Publish product/global changes.
    Expected: storefront reflects published updates without code changes.
19. Edit `ourStoryPage` / `howItWorksPage` globals.
    Expected: `/our-story` and `/how-it-works` show updated CMS content.

## Build and Quality

20. Run `npm run lint`.
    Expected: no ESLint errors.
21. Run `npm run test`.
    Expected: unit + integration + adapter tests pass.
22. Run `npm run build`.
    Expected: successful production build with no client/server import boundary errors.
