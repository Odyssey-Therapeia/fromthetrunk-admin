# Manual Acceptance Checklist

## Auth and Identity

1. Sign in with Google (or configured OAuth provider).
   Expected: exactly one `users` doc and one `auth_accounts` doc linked to that user. Welcome email sent.
2. Sign in again with Google.
   Expected: existing user/account is reused, no duplicate user.
3. Sign out via account page or header.
   Expected: `auth_sessions` record is removed. Redirected to homepage.
4. Access `/account/profile` while signed out.
   Expected: middleware redirects to `/account/sign-in?callbackUrl=...`.

## Account APIs

5. Call account APIs unauthenticated.
   Expected: `401` with `{ message, code }`.
6. Update profile with valid payload.
   Expected: update succeeds and persisted values round-trip.
7. Attempt to update another user's address by ID.
   Expected: `403` with `{ message, code }`.
8. Mark an address as default.
   Expected: only one address remains `isDefault: true`.

## Wishlist

9. Add a product to wishlist via heart icon on product card.
   Expected: heart fills red, toast confirms, persisted in user's wishlist.
10. Remove from wishlist via filled heart icon.
    Expected: heart unfills, toast confirms, removed from wishlist.
11. Visit `/account/wishlist`.
    Expected: shows all wishlisted products as a grid.

## Storefront and Content

12. Open `/`.
    Expected: homepage copy comes from `homePage` global. Recently viewed section hidden (no history).
13. Open `/collection`.
    Expected: products render from Payload. Pagination shows 12 per page.
14. Open `/collection?collection=<slug>`.
    Expected: listing is filtered to that collection.
15. Open `/collection?page=2`.
    Expected: second page of products, different from page 1.
16. Open `/collection/<product-slug>`.
    Expected: product loads by slug, unknown slug returns branded 404.
17. Query products anonymously.
    Expected: draft products are not returned.
18. View a product detail page then navigate to another.
    Expected: "Recently Viewed" section shows the first product.

## Search

19. Type 2+ characters in the search bar.
    Expected: dropdown shows matching products with images.
20. Click "View all results" in search dropdown.
    Expected: navigates to `/search?q=...` with full results grid.
21. Use mobile menu search.
    Expected: navigates to search results page.

## Cart and Inventory

22. Add a product to cart.
    Expected: item added, toast shown, cart badge updates.
23. Try to add the same product again.
    Expected: no-op — "Already in your bag" shown on detail page.
24. Remove item from cart.
    Expected: item removed, toast shown. Server reservation released.
25. Verify sold products cannot be added to cart.
    Expected: "Sold" button disabled, sold overlay on card.

## Checkout and Payment

26. Navigate to `/checkout` with items in cart.
    Expected: checkout form with shipping method selection, tax breakdown.
27. Select a saved address from dropdown.
    Expected: form fields pre-filled, toast confirms.
28. Submit checkout with empty required fields.
    Expected: inline validation errors shown, no API call.
29. Submit valid checkout.
    Expected: Razorpay modal opens. After payment, order confirmed.
30. After successful payment.
    Expected: redirected to confirmation page with order details, items,
    totals, shipping address. Confirmation email sent.

## Order Lifecycle

31. Open `/account/orders`.
    Expected: user sees only their own orders. Orders are clickable.
32. Open `/account/orders/<id>`.
    Expected: order detail with status timeline, items, totals, payment info.
33. Admin updates order to "shipped" via API.
    Expected: shipping notification email sent to customer.

## Pricing Integrity

34. Tamper item price/subtotal in client request.
    Expected: server computes canonical item prices, GST (12%), and shipping.
35. Order total = subtotal + shipping + GST.
    Expected: matches Razorpay charge amount.
36. Orders above ₹25,000 get free shipping.
    Expected: shipping cost shows as "Free".

## Newsletter

37. Submit newsletter email.
    Expected: confirmation email sent with verification link.
38. Click verification link.
    Expected: subscriber status changes to "confirmed", redirected to homepage.

## CMS Preview and Publish

39. Click Preview from product or collection in admin.
    Expected: front-end opens via `/api/draft/enable` and shows draft content.
40. Publish product/global changes.
    Expected: storefront reflects published updates without code changes.

## SEO

41. Check `/robots.txt`.
    Expected: allows public pages, blocks /admin, /account, /api.
42. Check `/sitemap.xml`.
    Expected: lists all products, collections, and static pages.
43. Check product detail page source.
    Expected: JSON-LD structured data with Product schema.
44. Check page titles.
    Expected: each page has a unique `<title>` with "| From the Trunk" suffix.

## Security

45. Hit `/api/payments/create-order` more than 5 times in 60 seconds.
    Expected: 429 Too Many Requests with Retry-After header.
46. Hit `/api/newsletter/subscribe` more than 3 times in 60 seconds.
    Expected: 429 Too Many Requests.
47. Check response headers.
    Expected: X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy present.

## Dark Mode

48. Click moon icon in header.
    Expected: site switches to dark theme, preference saved.
49. Reload page.
    Expected: dark mode persisted from localStorage.

## Build and Quality

50. Run `npm run lint`.
    Expected: no ESLint errors.
51. Run `npm run test`.
    Expected: 68 tests pass across 17 files.
52. Run `npm run build`.
    Expected: successful production build with no TypeScript errors.
