"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface DashboardStats {
  total_leads: number;
  emails_sent: number;
  opened_emails: number;
  total_replies: number;
  open_rate: number;
  reply_rate: number;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  status: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      const res = await api.dashboard.getStats();
      setStats(res.stats);
      setActivities(res.activities);
    } catch (e: any) {
      toast.error(e.message || "Failed to load dashboard metrics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSeedLeads = async () => {
    try {
      setIsSeeding(true);
      const res = await api.workspace.seedDemoLeads();
      if (res.status === "success") {
        toast.success(`Successfully seeded ${res.added} demo leads!`);
        fetchStats();
      } else {
        toast.error("Failed to seed demo leads");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to seed demo leads");
    } finally {
      setIsSeeding(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  if (isLoading && !stats) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[80vh]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-muted-foreground text-sm">Loading workspace dashboard...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/75 bg-clip-text text-transparent">
            Workspace Overview
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time analytics and activity for your email campaigns.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchStats}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-accent hover:text-accent-foreground transition-all flex items-center gap-2"
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
              className={isLoading ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            Refresh
          </button>
          {stats && stats.total_leads === 0 && (
            <button
              onClick={handleSeedLeads}
              disabled={isSeeding}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all flex items-center gap-2"
            >
              {isSeeding ? "Seeding..." : "Load Demo Leads"}
            </button>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Leads */}
        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Total Leads</span>
            <h3 className="text-3xl font-extrabold mt-2 tracking-tight text-card-foreground">
              {stats?.total_leads}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Prospects imported in workspace
          </p>
        </div>

        {/* Emails Sent */}
        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </div>
          <div>
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Outreach Sent</span>
            <h3 className="text-3xl font-extrabold mt-2 tracking-tight text-card-foreground">
              {stats?.emails_sent}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Total emails delivered
          </p>
        </div>

        {/* Open Rate */}
        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <div>
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Open Rate</span>
            <h3 className="text-3xl font-extrabold mt-2 tracking-tight text-card-foreground flex items-baseline gap-2">
              {stats?.open_rate}%
              <span className="text-sm font-normal text-muted-foreground">({stats?.opened_emails} opens)</span>
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Tracking pixel success rate
          </p>
        </div>

        {/* Reply Rate */}
        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Reply Rate</span>
            <h3 className="text-3xl font-extrabold mt-2 tracking-tight text-card-foreground flex items-baseline gap-2">
              {stats?.reply_rate}%
              <span className="text-sm font-normal text-muted-foreground">({stats?.total_replies} replies)</span>
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Inbound replies detected via IMAP
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions (1 column) */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-card-foreground tracking-tight px-1">Quick Actions</h2>
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <Link
              href="/dashboard/leads"
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors w-full text-left text-sm font-medium"
            >
              <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              </div>
              <div>
                <div className="font-semibold text-foreground">Import & Seed Leads</div>
                <div className="text-xs text-muted-foreground">Add new target companies or upload CSV</div>
              </div>
            </Link>

            <Link
              href="/dashboard/generation"
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors w-full text-left text-sm font-medium"
            >
              <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.886L5 10.8l5.088 1.914L12 18.6l1.912-5.886L19 10.8l-5.088-1.914z"/></svg>
              </div>
              <div>
                <div className="font-semibold text-foreground">Outreach Generation Queue</div>
                <div className="text-xs text-muted-foreground">Review, edit, and approve outreach drafts</div>
              </div>
            </Link>

            <Link
              href="/dashboard/inbox"
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors w-full text-left text-sm font-medium"
            >
              <div className="p-2 bg-green-500/10 text-green-500 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </div>
              <div>
                <div className="font-semibold text-foreground">Inbox Replies</div>
                <div className="text-xs text-muted-foreground">Classify replies and send AI generated responses</div>
              </div>
            </Link>

            <Link
              href="/dashboard/followup"
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors w-full text-left text-sm font-medium"
            >
              <div className="p-2 bg-yellow-500/10 text-yellow-500 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              </div>
              <div>
                <div className="font-semibold text-foreground">Follow Up Hub</div>
                <div className="text-xs text-muted-foreground">Check reply statuses and schedule follow-ups</div>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent Activity Log (2 columns) */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-card-foreground tracking-tight px-1">Recent Activity</h2>
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            {activities.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">
                No recent activity recorded yet. Get started by adding leads or starting campaigns!
              </div>
            ) : (
              <div className="divide-y">
                {activities.map((activity) => (
                  <div key={activity.id} className="p-4 hover:bg-accent/10 transition-colors flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {activity.type === "email_sent" && (
                        <div className="p-2 mt-0.5 bg-purple-500/10 text-purple-500 rounded-lg">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        </div>
                      )}
                      {activity.type === "reply_received" && (
                        <div className="p-2 mt-0.5 bg-green-500/10 text-green-500 rounded-lg">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </div>
                      )}
                      {activity.type === "lead_created" && (
                        <div className="p-2 mt-0.5 bg-blue-500/10 text-blue-500 rounded-lg">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                        </div>
                      )}

                      <div>
                        <p className="text-sm font-medium text-foreground">{activity.description}</p>
                        <span className="text-xs text-muted-foreground">{formatTime(activity.timestamp)}</span>
                      </div>
                    </div>

                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${
                        activity.status === "success"
                          ? "bg-green-500/10 text-green-500"
                          : activity.status === "info"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {activity.type === "email_sent"
                        ? "Delivered"
                        : activity.type === "reply_received"
                        ? "Replied"
                        : "New"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
