export type Product = "homes" | "experiences" | "services";

export const NAV_TABS: { id: Product; label: string; href: string; isNew?: boolean }[] = [
  { id: "homes", label: "Homes", href: "/" },
  { id: "experiences", label: "Experiences", href: "/experiences", isNew: true },
  { id: "services", label: "Services", href: "/services", isNew: true },
];
