import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function LoginCard({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next, error } = await searchParams;
  return (
    <div className="border-border bg-background rounded-xl border p-6 shadow-sm">
      {typeof error === "string" && (
        <p role="alert" className="text-destructive mb-4 text-sm">
          {error}
        </p>
      )}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </div>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="bg-muted/40 flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">Everything Ads Studio</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Sign in to your workspace</h1>
        </div>
        <Suspense fallback={<div className="border-border bg-background h-72 rounded-xl border" />}>
          <LoginCard searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
