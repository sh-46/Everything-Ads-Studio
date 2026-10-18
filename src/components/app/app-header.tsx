import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { requireSession } from "@/lib/supabase/server";
import { NavLink } from "./nav-link";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/brands", label: "Brands" },
];

async function UserEmail() {
  const { email } = await requireSession();
  return email ? <span className="text-muted-foreground hidden text-xs sm:inline">{email}</span> : null;
}

export function AppHeader() {
  return (
    <header className="border-border bg-background/90 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-6">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
          Everything Ads Studio
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            // Active state depends on the URL, which is only known at request time.
            <Suspense
              key={item.href}
              fallback={
                <Link href={item.href} className="text-muted-foreground rounded-md px-2.5 py-1">
                  {item.label}
                </Link>
              }
            >
              <NavLink href={item.href}>{item.label}</NavLink>
            </Suspense>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Suspense fallback={null}>
            <UserEmail />
          </Suspense>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
              <LogOut /> Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
