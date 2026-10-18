"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authenticate, type AuthFormState } from "@/features/auth/actions";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(authenticate, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-muted-foreground text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        {mode === "signIn" ? "New to the studio?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="text-foreground font-medium underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
        >
          {mode === "signIn" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </form>
  );
}
