"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "../lib/use-account";

const LINKS = [
  { href: "/", label: "Build a bid" },
  { href: "/pairings", label: "Import data" },
];

export function SiteNav({ apiUrl }: { apiUrl: string }) {
  const path = usePathname();
  const { account, loading } = useAccount(apiUrl);
  const links = [
    ...LINKS,
    ...(account
      ? [
          { href: "/bids", label: "My bids" },
          { href: "/account", label: "Account" },
        ]
      : loading
        ? []
        : [{ href: "/login", label: "Sign in" }]),
  ];
  return (
    <nav className="nav" aria-label="Main">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
