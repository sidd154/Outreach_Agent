"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SendIcon, RefreshCw, Clock, Sparkles, MessageSquare, MailWarning, TrashIcon, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function FollowUpPage() {
  const [noReplyLeads, setNoReplyLeads] = useState<any[]>([]);
  const [repliedLeads, setRepliedLeads] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  
  // Loading & Action States
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  
  // Editing States
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  // Filtering state
  const [filter, setFilter] = useState<"all" | "read" | "unread">("all");
  const [syncing, setSyncing] = useState(false);

  const handleSyncReplies = async () => {
    setSyncing(true);
    try {
      let count = 0;
      try {
        const gmailRes = await api.workspace.gmailPoll();
        count += gmailRes.polled_count || 0;
      } catch {}
      try {
        const imapRes = await api.workspace.imapPollNow();
        count += imapRes.polled_count || 0;
      } catch {}
      toast.success(`Sync complete! Loaded ${count} new replies/read receipts.`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to sync inbox");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.followup.getStatus();
      setNoReplyLeads(res.no_reply);
      setRepliedLeads(res.replied);
      
      // Update selected reference if it exists
      if (selected) {
        const nrItem = res.no_reply.find(i => i.id === selected.id);
        const rItem = res.replied.find(i => i.id === selected.id);
        const updatedItem = nrItem || rItem;
        if (updatedItem) {
          setSelected(updatedItem);
          // Only update edit controls if we aren't currently editing
          updateEditState(updatedItem);
        } else {
          setSelected(null);
        }
      }
    } catch {
      toast.error("Failed to load follow-up status");
    } finally {
      setLoading(false);
    }
  }

  const updateEditState = (item: any) => {
    if (item.status === "generated") {
      // Find the generated draft for this lead in the queue (or we can pull it from database, but let's check queue)
      api.queue.get().then(queue => {
        const draft = queue.find(q => q.lead_id === item.id && !q.sent_at);
        if (draft) {
          setEditSubject(draft.subject);
          setEditBody(draft.body);
        }
      });
    } else if (item.status === "replied" && item.latest_reply?.suggested_reply) {
      setEditSubject(item.latest_reply.suggested_reply_subject || `Re: ${item.latest_reply.subject}`);
      setEditBody(item.latest_reply.suggested_reply);
    } else {
      setEditSubject("");
      setEditBody("");
    }
  };

  const handleSelectLead = (item: any) => {
    setSelected(item);
    updateEditState(item);
  };

  const handleGenerateDraft = async (leadId: string, group: string) => {
    setGenerating(true);
    try {
      const res = await api.followup.generate({ lead_ids: [leadId] });
      toast.success("AI Draft generated successfully!");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate AI follow-up draft");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateBulk = async (group: "no_reply" | "replied") => {
    setGenerating(true);
    try {
      const res = await api.followup.generate({ group });
      toast.success(`Generated ${res.drafts_generated} drafts successfully!`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Bulk generation failed");
    } finally {
      setGenerating(false);
    }
  };


  const handleSendSingle = async (leadId: string) => {
    setSending(true);
    try {
      // First update the draft body/subject if edited
      const nrItem = noReplyLeads.find(i => i.id === leadId);
      if (nrItem && nrItem.status === "generated") {
        const queue = await api.queue.get();
        const draft = queue.find(q => q.lead_id === leadId && !q.sent_at);
        if (draft) {
          await api.queue.update(draft.id, { subject: editSubject, body: editBody });
        }
      }
      
      const res = await api.followup.sendBatch([leadId]);
      if (res.sent > 0) {
        toast.success("Follow-up email sent successfully!");
        setSelected(null);
        load();
      } else {
        toast.error("Failed to send follow-up");
      }
    } catch (e: any) {
      toast.error(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleSendBulk = async (group: "no_reply" | "replied") => {
    const list = group === "no_reply" ? noReplyLeads : repliedLeads;
    // For no_reply, check which ones are in "generated" state
    const leadsToSend = list.filter(item => item.status === "generated" || (group === "replied" && item.latest_reply?.suggested_reply)).map(item => item.id);
    
    if (leadsToSend.length === 0) {
      toast.info("No generated follow-up drafts ready to send.");
      return;
    }
    
    if (!confirm(`Are you sure you want to send follow-ups to all ${leadsToSend.length} contacts?`)) return;
    
    setSending(true);
    try {
      const res = await api.followup.sendBatch(leadsToSend);
      toast.success(`Sent ${res.sent} follow-ups! Failed: ${res.failed}`);
      setSelected(null);
      load();
    } catch {
      toast.error("Failed to execute bulk sending");
    } finally {
      setSending(false);
    }
  };

  const getTimelineBadge = (lead: any) => {
    if (lead.status === "generated") return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-xs">Draft Ready</Badge>;
    if (lead.status === "sent") return <Badge variant="secondary" className="text-xs">Emailed</Badge>;
    if (lead.status === "replied") return <Badge className="bg-green-500 hover:bg-green-600 text-xs">Replied</Badge>;
    return <Badge variant="outline" className="text-xs capitalize">{lead.status}</Badge>;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left Column: Lists */}
      <div className="w-1/3 border-r flex flex-col h-full bg-card">
        <Tabs defaultValue="no_reply" className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Follow Up Worklists</h2>
              <Button 
                size="sm" 
                variant="outline" 
                className="h-8 text-xs flex items-center gap-1.5 px-2.5"
                onClick={handleSyncReplies}
                disabled={syncing}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Inbox'}
              </Button>
            </div>
            <TabsList className="grid w-full grid-cols-2 bg-muted">
              <TabsTrigger value="no_reply" className="text-xs">No Reply ({noReplyLeads.length})</TabsTrigger>
              <TabsTrigger value="replied" className="text-xs">Replied ({repliedLeads.length})</TabsTrigger>
            </TabsList>
          </div>

          {/* No Reply Tab */}
          <TabsContent value="no_reply" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="p-4 border-b flex flex-col gap-2 bg-muted/20">
              <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                <span>Leads emailed who didn&apos;t respond</span>
                <span className="font-medium text-primary">{noReplyLeads.filter(l => l.status === "generated").length} Drafts</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 text-xs" variant="secondary" onClick={() => handleGenerateBulk("no_reply")} disabled={generating}>
                  {generating ? <RefreshCw className="w-3 h-3 animate-spin mr-1.5" /> : <Sparkles className="w-3 h-3 text-yellow-500 mr-1.5" />}
                  Draft All Followups
                </Button>
                <Button size="sm" className="flex-1 text-xs" onClick={() => handleSendBulk("no_reply")} disabled={sending}>
                  <SendIcon className="w-3 h-3 mr-1.5" /> Send All Drafts
                </Button>
              </div>

              {/* Segmented Filter Toggle */}
              <div className="flex bg-muted/50 rounded-lg p-0.5 mt-2 text-xs">
                <button
                  onClick={() => setFilter("all")}
                  className={`flex-1 py-1 rounded text-center transition-all ${filter === "all" ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter("read")}
                  className={`flex-1 py-1 rounded text-center transition-all ${filter === "read" ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Read
                </button>
                <button
                  onClick={() => setFilter("unread")}
                  className={`flex-1 py-1 rounded text-center transition-all ${filter === "unread" ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Unread
                </button>
              </div>
            </div>
            
            <ScrollArea className="flex-1">
              {noReplyLeads
                .filter(item => {
                  if (filter === "read") return item.last_sent?.is_opened === true;
                  if (filter === "unread") return !item.last_sent?.is_opened;
                  return true;
                })
                .map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => handleSelectLead(item)}
                    className={`p-4 border-b cursor-pointer hover:bg-accent/40 transition-all ${selected?.id === item.id ? 'bg-accent/80 border-l-4 border-l-primary' : ''}`}
                  >
                    <div className="font-medium truncate flex items-center justify-between">
                      <span className="font-semibold text-sm">{item.contact_name || item.org_name || item.email}</span>
                      {getTimelineBadge(item)}
                    </div>
                    {item.last_sent && (
                      <div className="text-xs text-muted-foreground truncate mt-2 flex justify-between items-center">
                        <span className="truncate max-w-[70%]">Last: {item.last_sent.subject}</span>
                        {item.last_sent.is_opened ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-green-700 font-semibold bg-green-500/15 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Read
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-semibold bg-muted px-2 py-0.5 rounded-full">
                            Delivered (Unread)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              {noReplyLeads.filter(item => {
                if (filter === "read") return item.last_sent?.is_opened === true;
                if (filter === "unread") return !item.last_sent?.is_opened;
                return true;
              }).length === 0 && (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  <MailWarning className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No matching leads found.
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Replied Tab */}
          <TabsContent value="replied" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="p-4 border-b flex flex-col gap-2 bg-muted/20">
              <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                <span>Leads who replied to your emails</span>
              </div>
              <Button size="sm" className="w-full text-xs" variant="secondary" onClick={() => handleGenerateBulk("replied")} disabled={generating}>
                {generating ? <RefreshCw className="w-3 h-3 animate-spin mr-1.5" /> : <Sparkles className="w-3 h-3 text-yellow-500 mr-1.5" />}
                Draft All AI Responses
              </Button>
            </div>
            
            <ScrollArea className="flex-1">
              {repliedLeads.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => handleSelectLead(item)}
                  className={`p-4 border-b cursor-pointer hover:bg-accent/40 transition-all ${selected?.id === item.id ? 'bg-accent/80 border-l-4 border-l-primary' : ''}`}
                >
                  <div className="font-medium truncate flex items-center justify-between">
                    <span className="font-semibold text-sm">{item.contact_name || item.org_name || item.email}</span>
                    {getTimelineBadge(item)}
                  </div>
                  {item.latest_reply && (
                    <div className="text-xs text-muted-foreground truncate mt-1.5 flex justify-between items-center">
                      <span className="font-medium text-indigo-500">Reply: {item.latest_reply.body_text}</span>
                      <Badge variant="outline" className="text-[9px] scale-90">{item.latest_reply.classification}</Badge>
                    </div>
                  )}
                </div>
              ))}
              {repliedLeads.length === 0 && (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No lead replies in the system.
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Right Column: Interaction Details */}
      <div className="flex-1 p-8 bg-muted/15 overflow-y-auto">
        {selected ? (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex justify-between items-center pb-4 border-b">
              <div>
                <h3 className="text-xl font-bold">{selected.contact_name || selected.org_name}</h3>
                <p className="text-xs text-muted-foreground">{selected.email} • {selected.org_name}</p>
              </div>
              <div>
                {getTimelineBadge(selected)}
              </div>
            </div>

            {/* Thread History Visualizer */}
            <div className="space-y-4">
              {/* 1. Initial Pitch Emailed (if exists) */}
              {selected.last_sent && (
                <Card className="border border-muted bg-card shadow-sm opacity-90">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Initial Email Sent
                      </div>
                      <span>{new Date(selected.last_sent.sent_at).toLocaleString()}</span>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground mb-0.5">Subject</div>
                      <div className="text-sm font-semibold">{selected.last_sent.subject}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground mb-0.5">Body</div>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed border bg-muted/20 p-3 rounded">{selected.last_sent.body}</div>
                    </div>
                    {selected.last_sent.is_opened && (
                      <div className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-1 rounded w-fit flex items-center gap-1">
                        ✓ Email read on {new Date(selected.last_sent.opened_at).toLocaleString()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 2. Lead's Reply (if exists) */}
              {selected.latest_reply && (
                <Card className="border border-green-500/20 bg-green-500/5 shadow-sm">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex justify-between items-center text-xs text-green-700 font-semibold">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" /> Inbound Lead Reply ({selected.latest_reply.classification})
                      </div>
                      <span>{new Date(selected.latest_reply.received_at).toLocaleString()}</span>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-green-800/80 mb-0.5">Inbound Message</div>
                      <div className="text-sm text-green-900 border border-green-500/10 bg-white dark:bg-slate-900 p-3 rounded whitespace-pre-wrap leading-relaxed shadow-inner">
                        {selected.latest_reply.body_text}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* 3. AI Drafting & Sending Interface */}
            {selected.status === "generated" || (selected.status === "replied" && selected.latest_reply?.suggested_reply) ? (
              <Card className="border-primary/30 bg-primary/5 shadow-inner">
                <CardContent className="p-6 space-y-4">
                  <h4 className="font-bold text-sm flex items-center gap-2 text-primary">
                    <Sparkles className="w-4 h-4 text-yellow-500" /> Pending AI Follow-up Draft
                  </h4>
                  
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Subject</Label>
                      <Input 
                        value={editSubject} 
                        onChange={(e) => setEditSubject(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Follow-up Message</Label>
                      <Textarea 
                        value={editBody} 
                        onChange={(e) => setEditBody(e.target.value)}
                        className="min-h-[200px] resize-y bg-background leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t">
                    <Button variant="outline" onClick={() => handleGenerateDraft(selected.id, selected.status === "sent" ? "no_reply" : "replied")} disabled={generating}>
                      {generating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Regenerate Draft
                    </Button>
                    <Button onClick={() => handleSendSingle(selected.id)} disabled={sending} className="bg-primary hover:bg-primary/95 text-primary-foreground">
                      {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <SendIcon className="w-4 h-4 mr-2" />}
                      Send Follow-up Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="p-6 bg-card border border-dashed rounded-lg text-center space-y-3 shadow-sm">
                <div className="text-sm text-muted-foreground">No pending drafts for this contact. Generate one now!</div>
                <Button onClick={() => handleGenerateDraft(selected.id, selected.status === "sent" ? "no_reply" : "replied")} disabled={generating} className="bg-primary">
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Seeding AI Brain...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 text-yellow-400" /> Generate AI Follow-up Draft
                    </>
                  )}
                </Button>
              </div>
            )}

          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/5 rounded-xl border border-dashed">
            Select a contact to view conversation timeline and manage follow-ups
          </div>
        )}
      </div>
    </div>
  );
}
