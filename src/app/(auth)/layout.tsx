import { AppHeader } from "@/components/layout/AppHeader";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-brand-gradient">
      <AppHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-3 pb-12">
        {children}
      </main>
    </div>
  );
}
