"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="border-destructive/30 bg-destructive/5 rounded-xl border p-6">
      <h1 className="text-sm font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground mt-1 text-sm">{error.message}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
