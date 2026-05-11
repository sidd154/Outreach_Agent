"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Clock, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function InboxPage() {
  const [replies, setReplies] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [stats, setStats] = useState<any>({ total_count: 0, interested_count: 0 });
  const [polling, setPolling] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      silentLoad();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    setPolling(true);
    await silentLoad();
    setPolling(false);
  }

  async function silentLoad() {
    try {
      const data = await api.replies.get();
      setReplies(data);
      const st = await api.replies.stats();
      setStats(st);
    } catch {
      // Silently fail on background poll to avoid spamming toasts
    }
  }

  async function sendDraft(id: string) {
    try {
      await api.replies.sendDraft(id);
      toast.success("Draft sent");
      setSelected(null);
      load();
    } catch {
      toast.error("Failed to send draft");
    }
  }

  async function ignoreReply(id: string) {
    try {
      await api.replies.ignore(id);
      toast.success("Reply archived");
      setSelected(null);
      load();
    } catch {
      toast.error("Failed to archive");
    }
  }

  const pendingReplies = replies.filter((r) => r.user_action === "pending");
  const historyReplies = replies.filter((r) => r.user_action !== "pending");
  

  const renderReplyList = (list: any[]) => (
    <>
      {list.map((item) => (
        <div 
          key={item.id} 
          onClick={() => setSelected(item)}
          className={`p-4 border-b cursor-pointer hover:bg-accent/50 ${selected?.id === item.id ? 'bg-accent border-l-4 border-l-primary' : ''}`}
        >
          <div className="flex justify-between items-start mb-1">
            <div className="font-semibold truncate pr-2">{item.from_name || item.from_email}</div>
            <Badge variant="secondary" className={`text-[10px] shrink-0 capitalize ${
              item.classification === 'interested' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 hover:bg-green-100' : 
              item.classification === 'not_interested' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 hover:bg-red-100' : 
              'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-100'
            }`}>
              {item.classification?.replace('_', ' ') || 'unclassified'}
            </Badge>
          </div>
          <div className="text-sm font-medium truncate">{item.subject}</div>
          <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.body_text}</div>
        </div>
      ))}
      {list.length === 0 && <div className="p-8 text-center text-muted-foreground">Inbox zero!</div>}
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="w-1/3 border-r bg-background flex flex-col">
        <div className="flex flex-col h-full w-full">
          <div className="p-4 border-b flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  Inbox 
                  <Badge variant="outline" className="text-xs">{pendingReplies.length}</Badge>
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                    <span className="text-xs font-semibold">Interested</span>
                    <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/40 text-xs px-1.5 rounded-sm">{stats.interested_count || 0}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                    <span className="text-xs font-semibold">Not Interested</span>
                    <Badge variant="secondary" className="bg-red-100 dark:bg-red-900/40 text-xs px-1.5 rounded-sm">{stats.not_interested_count || 0}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                    <span className="text-xs font-semibold">Unclassified</span>
                    <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-xs px-1.5 rounded-sm">{stats.unclassified_count || 0}</Badge>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 bg-muted p-1 rounded-md">
              <button 
                onClick={() => setActiveTab("pending")}
                className={`py-1.5 text-sm font-medium rounded-sm transition-all ${activeTab === "pending" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/50"}`}
              >
                Pending
              </button>
              <button 
                onClick={() => setActiveTab("history")}
                className={`py-1.5 text-sm font-medium rounded-sm transition-all ${activeTab === "history" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/50"}`}
              >
                History
              </button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            {activeTab === "pending" ? renderReplyList(pendingReplies) : renderReplyList(historyReplies)}
          </ScrollArea>
        </div>
      </div>
      
      <div className="flex-1 p-8 bg-muted/10 overflow-y-auto">
        {selected ? (
          <div className="max-w-3xl mx-auto space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex justify-between mb-6">
                  <div>
                     <h3 className="text-xl font-bold">{selected.subject}</h3>
                     <div className="text-sm text-muted-foreground mt-1">From: {selected.from_email}</div>
                  </div>
                  <div className="text-right">
                     <Badge variant="secondary" className={`capitalize ${
                        selected.classification === 'interested' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 hover:bg-green-100' : 
                        selected.classification === 'not_interested' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 hover:bg-red-100' : 
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-100'
                      }`}>
                        {selected.classification?.replace('_', ' ') || 'unclassified'} ({((selected.classification_confidence||0) * 100).toFixed(0)}%)
                      </Badge>
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-sm border-l-2 border-muted-foreground/30 pl-4 py-2 bg-muted/30">
                   {selected.body_text}
                </div>
              </CardContent>
            </Card>

            {selected.suggested_reply_body && (
              <Card className="border-primary/50 bg-primary/5 shadow-inner">
                <CardContent className="p-6">
                  <h4 className="font-semibold flex items-center gap-2 mb-4">
                     <Clock className="w-4 h-4 text-primary" /> AI Drafted Response
                  </h4>
                  <div className="text-sm md:text-base border bg-background p-4 rounded-md whitespace-pre-wrap shadow-sm">
                     {selected.suggested_reply_body}
                  </div>
                  {selected.user_action === "pending" && (
                    <div className="flex justify-end gap-3 mt-6">
                       <Button variant="outline" onClick={() => ignoreReply(selected.id)}>Archive</Button>
                       <Button onClick={() => sendDraft(selected.id)}>
                          <Send className="w-4 h-4 mr-2" /> Send Draft
                       </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {selected.user_action !== "pending" && (
              <Card className="border-muted bg-muted/20 mt-6">
                <CardContent className="p-6 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <Badge variant="outline" className="mb-2 text-xs">Status: {selected.user_action.replace('_', ' ')}</Badge>
                  <p className="text-sm">This conversation has already been processed and moved to your history.</p>
                </CardContent>
              </Card>
            )}

          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/5 rounded-xl border border-dashed">
            Select a conversation to view details
          </div>
        )}
      </div>
    </div>
  );
}
