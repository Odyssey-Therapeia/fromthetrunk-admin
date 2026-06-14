import {
  FileText,
  FolderOpen,
  Globe,
  Image,
  LayoutDashboard,
  Link2,
  Menu,
  Package,
  Palette,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

export const adminNavItems: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/collections", label: "Collections", icon: FolderOpen },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/customers", label: "Users", icon: Users },
  { href: "/admin/media", label: "Media", icon: Image },
  { href: "/admin/pages", label: "Pages", icon: FileText },
  { href: "/admin/theme", label: "Theme", icon: Palette },
  { href: "/admin/navigation", label: "Navigation", icon: Menu },
  { href: "/admin/redirects", label: "Redirects", icon: Link2 },
  { href: "/admin/globals", label: "Globals", icon: Globe },
];

export const adminBottomNavItems: AdminNavItem[] = [
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
