import {
  Activity,
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
  Tag,
  Users,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

export const adminNavItems: AdminNavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/control-centre", label: "Control Centre", icon: Activity },
  { href: "/products", label: "Products", icon: Package },
  { href: "/collections", label: "Collections", icon: FolderOpen },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/discounts", label: "Discounts", icon: Tag },
  { href: "/customers", label: "Users", icon: Users },
  { href: "/media", label: "Media", icon: Image },
  { href: "/pages", label: "Pages", icon: FileText },
  { href: "/theme", label: "Theme", icon: Palette },
  { href: "/navigation", label: "Navigation", icon: Menu },
  { href: "/redirects", label: "Redirects", icon: Link2 },
  { href: "/globals", label: "Globals", icon: Globe },
];

export const adminBottomNavItems: AdminNavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];
