export type AdminReleaseHighlight = {
  area: "Admin" | "Images" | "Storefront" | "Quality";
  description: string;
  title: string;
};

export type AdminReleaseChangeGroup = {
  items: [string, ...string[]];
  title: string;
};

export type AdminReleaseNote = {
  changes: AdminReleaseChangeGroup[];
  demoHref: string;
  demoLabel: string;
  highlights: AdminReleaseHighlight[];
  name: string;
  releaseDate: string;
  showAnnouncement: boolean;
  summary: string;
  version: string;
};

export const adminReleases: AdminReleaseNote[] = [
  {
    version: "0.27.0",
    name: "The Control Centre Release",
    releaseDate: "2026-06-28",
    showAnnouncement: true,
    demoHref: "/settings",
    demoLabel: "Open Settings",
    summary:
      "A broad admin refresh with Control Centre analytics, cleaner product and order workflows, stronger CMS media handling, safer password management, and a more responsive admin shell.",
    highlights: [
      {
        area: "Admin",
        title: "Control Centre is now live",
        description:
          "The admin gained a Control Centre analytics dashboard for a clearer operational view of storefront performance.",
      },
      {
        area: "Admin",
        title: "Settings and user security are clearer",
        description:
          "Settings now separates saved-only controls from live actions, supports self-service password changes, generated passwords, and password visibility toggles.",
      },
      {
        area: "Images",
        title: "Media handling is smoother",
        description:
          "The Media Library and CMS page editor now offer cleaner upload and picker flows, with safer handling for image URLs and media IDs.",
      },
      {
        area: "Quality",
        title: "The admin app is cleaner after the split",
        description:
          "Storefront routes were pruned from the admin app, admin-only routing was cleaned up, pnpm hygiene was improved, and sidebar responsiveness was fixed.",
      },
    ],
    changes: [
      {
        title: "Added",
        items: [
          "Control Centre analytics dashboard for admin performance visibility.",
          "Product Types dashboard for managing product-type workflows.",
          "Improved Product Builder support for offline drafts, previews, and AI-assisted tools.",
          "Improved Media Library upload flow.",
          "CMS page-editor media picker and upload handling.",
          "Theme editor controls for color picking and border-radius adjustment.",
          "Generated-password support and password visibility toggles in Settings.",
          "Responsive admin sidebar behavior for shorter laptop screens.",
        ],
      },
      {
        title: "Updated",
        items: [
          "Cleaned the admin app after the storefront/admin repo split.",
          "Pruned storefront routes and unused storefront components from the admin app.",
          "Moved the admin app to cleaner admin-only routes.",
          "Improved Collections editing workflow.",
          "Improved Orders and purchase-slip UX.",
          "Improved Discounts and order-detail UX.",
          "Improved admin password workflow UX.",
          "Improved Settings page UX with clearer Saved only and Live labels.",
          "Updated password policy so existing admins change only their own password from Settings.",
          "Improved CMS media handling so normal image fields store URLs while ID-specific fields store media IDs.",
          "Isolated admin auth cookies to prevent localhost/session collisions with the storefront.",
          "Updated landing-page contact references from hello@fromthetrunk.com to hello@fromthetrunk.shop.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Fixed product adding pipeline issues.",
          "Fixed admin agent-store build error.",
          "Fixed package-manager hygiene by removing stale package-lock.json.",
          "Completed pnpm migration with package-manager pinning, npm guard, and pnpm-native CI.",
          "Updated Lighthouse and CI configuration.",
          "Changed Next config from JavaScript to TypeScript.",
          "Fixed case-sensitive mobile hero filenames for Linux/Vercel.",
          "Fixed silk asset filename casing.",
          "Fixed Commerce Defaults number inputs so 0 can be deleted while typing.",
          "Fixed Hono admin API auth to read the custom admin session cookie.",
          "Hardened CMS block preview handling for empty, draft, and invalid values.",
          "Removed cross-admin password reset from the Users page.",
          "Removed the backend route that allowed one admin to reset another admin password.",
        ],
      },
    ],
  },
  {
    version: "0.26.2",
    name: "The Living Story Preview",
    releaseDate: "2026-04-27",
    showAnnouncement: true,
    demoHref: "/why",
    demoLabel: "Preview Our Why",
    summary:
      "A new interactive Our Why preview, cleaner storefront card language, stronger hero readability, and a clickable admin changelog for release history.",
    highlights: [
      {
        area: "Storefront",
        title: "Our Why is now an interactive preview",
        description:
          "The old static manifesto page has been replaced with a chaptered story experience with slide controls and browser voiceover.",
      },
      {
        area: "Storefront",
        title: "Homepage cards are quieter",
        description:
          "Decorative card icons were removed from the featured and how-it-works sections so the saree imagery and copy carry the experience.",
      },
      {
        area: "Admin",
        title: "Version badges now open a changelog",
        description:
          "Admins can click the version badge from the menu or dashboard to review every release, including detailed fixes and updates.",
      },
      {
        area: "Quality",
        title: "Customer copy was cleaned up",
        description:
          "Customer-facing em dashes, en dashes, and visible dot separators were replaced with calmer punctuation across the storefront pass.",
      },
    ],
    changes: [
      {
        title: "Added",
        items: [
          "New Our Why preview with chapter navigation, image-led storytelling, and voiceover playback.",
          "Admin changelog page at /admin/changelog with all release notes in one place.",
          "Clickable version badges in the admin sidebar, top bar, mobile menu, dashboard, and release announcement.",
        ],
      },
      {
        title: "Updated",
        items: [
          "Homepage hero contrast now keeps the title and calls to action readable on the garden image.",
          "Featured collection and how-it-works cards no longer show decorative overlay icons.",
          "The admin latest-update card now links directly into the full release history.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Removed customer-facing em dashes, en dashes, and visible dot separators from checked storefront surfaces.",
          "Kept the collection filter redesign out of this version so it can be planned as its own pass.",
        ],
      },
    ],
  },
  {
    version: "0.25.0",
    name: "The Showroom Release",
    releaseDate: "2026-04-24",
    showAnnouncement: true,
    demoHref: "/products",
    demoLabel: "Open products",
    summary:
      "A sharper catalog workspace for product operations, cleaner image management, and a more premium storefront presentation.",
    highlights: [
      {
        area: "Admin",
        title: "Products are easier to manage",
        description:
          "Cards, gallery, list, and compact views now support faster scanning, sorting, filtering, and bulk selection.",
      },
      {
        area: "Images",
        title: "Cover-image work is visible",
        description:
          "Product cards now make missing covers obvious and the editor gives clearer controls for choosing, reordering, and removing photos.",
      },
      {
        area: "Storefront",
        title: "Collection pages feel more curated",
        description:
          "The collection experience has a stronger editorial frame, responsive product shelves, and cleaner sort/filter behavior.",
      },
      {
        area: "Quality",
        title: "Release checks are part of the rhythm",
        description:
          "This update was packaged with desktop/mobile QA screenshots and demo flows so the team can review the launch quickly.",
      },
    ],
    changes: [
      {
        title: "Fixed",
        items: [
          "Public draft product access is blocked from anonymous storefront requests.",
          "Unknown product detail URLs return a real HTTP 404.",
          "Empty collection chips were removed from the storefront collection filters.",
          "Product editor autosave no longer PATCHes unchanged records every 30 seconds.",
        ],
      },
      {
        title: "Updated",
        items: [
          "Admin product management gained card, gallery, list, and compact views.",
          "Product image cover controls became clearer across cards and the editor.",
          "The collection page received a stronger editorial frame and responsive product shelves.",
        ],
      },
      {
        title: "Quality",
        items: [
          "Release checks now include desktop and mobile browser QA evidence.",
          "The admin dashboard gained a compact latest-update panel.",
        ],
      },
    ],
  },
];

export const currentAdminRelease = adminReleases[0];
