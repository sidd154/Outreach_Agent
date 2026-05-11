"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

import { useRouter } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const router = useRouter();

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
    return <div className="flex h-screen items-center justify-center">Initializing...</div>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-primary">OutreachAgent</h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <Link href="/dashboard/product" className="block px-3 py-2 rounded-md hover:bg-accent text-sm font-medium">Product / Settings</Link>
          <Link href="/dashboard/templates" className="block px-3 py-2 rounded-md hover:bg-accent text-sm font-medium">Templates</Link>
          <Link href="/dashboard/leads" className="block px-3 py-2 rounded-md hover:bg-accent text-sm font-medium">Leads</Link>
          <Link href="/dashboard/generation" className="block px-3 py-2 rounded-md hover:bg-accent text-sm font-medium">Generation Queue</Link>
          <Link href="/dashboard/inbox" className="block px-3 py-2 rounded-md hover:bg-accent text-sm font-medium">Inbox Replies</Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto bg-background/95">
        {children}
      </main>
    </div>
  );
}
