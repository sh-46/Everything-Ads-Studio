import { AppHeader } from "@/components/app/app-header";

// Auth is enforced by the proxy and by requireSession() in each page; the shell itself
// renders without runtime data so it can be prerendered (Cache Components).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
