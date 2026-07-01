"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useRouter, usePathname } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function initAuth() {
      const isAuth = localStorage.getItem("isAuthenticated");
      if (!isAuth) {
        router.push("/login");
        return;
      }
      
      let key = localStorage.getItem("workspaceApiKey");
      try {
        if (!key) {
          const res = await api.workspace.init("Default Workspace");
          localStorage.setItem("workspaceApiKey", res.api_key);
        } else {
          // Verify current key works
          await api.workspace.get();
        }
      } catch (e: any) {
        if (e.status === 401) {
          try {
            const res = await api.workspace.init("Default Workspace");
            localStorage.setItem("workspaceApiKey", res.api_key);
            toast.success("Session restored");
          } catch {
            toast.error("Authentication failed. Please refresh.");
          }
        }
      } finally {
        setIsInitializing(false);
      }
    }
    initAuth();
  }, []);

  if (isInitializing) {
    return <div className="flex h-screen items-center justify-center bg-background text-foreground">Initializing...</div>;
  }

  const isActive = (path: string) => pathname === path;

  const navLinkClass = (path: string) => {
    return `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive(path)
        ? "bg-accent text-accent-foreground font-semibold"
        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
    }`;
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-card flex flex-col h-screen sticky top-0 justify-between">
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="p-6">
            <h1 className="text-xl font-bold tracking-tight text-primary">OutreachAgent</h1>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            <Link href="/dashboard" className={navLinkClass("/dashboard")}>
              Dashboard
            </Link>
            <Link href="/dashboard/leads" className={navLinkClass("/dashboard/leads")}>
              Leads
            </Link>
            <Link href="/dashboard/generation" className={navLinkClass("/dashboard/generation")}>
              Generation Queue
            </Link>
            <Link href="/dashboard/followup" className={navLinkClass("/dashboard/followup")}>
              Inbox & Follow-ups
            </Link>
            <Link href="/dashboard/templates" className={navLinkClass("/dashboard/templates")}>
              Templates
            </Link>
          </nav>
        </div>
        <div className="p-4 border-t">
          <Link
            href="/dashboard/product"
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive("/dashboard/product")
                ? "bg-accent text-accent-foreground font-semibold"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-settings"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-background/95">
        {children}
      </main>
    </div>
  );
}
