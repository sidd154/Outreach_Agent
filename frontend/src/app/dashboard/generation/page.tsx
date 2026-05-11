"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SendIcon, TrashIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function GenerationQueuePage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await api.queue.get();
      setQueue(data);
      if (data.length > 0 && !selected) setSelected(data[0]);
    } catch {
      toast.error("Failed to load queue");
    }
  }

  // Only poll if we have un-sent approved emails that might be processing in the background
  useEffect(() => {
    const hasProcessingEmails = queue.some(q => q.approved && !q.sent_at);
    if (!hasProcessingEmails) return;

    const interval = setInterval(() => {
      load();
    }, 3000);
    return () => clearInterval(interval);
  }, [queue]);

  async function handleApprove(id: string) {
    try {
      await api.queue.approve(id);
      toast.success("Approved email draft");
      load();
    } catch {
      toast.error("Failed to approve");
    }
  }

  async function handleSendSingle(id: string) {
    try {
      await api.queue.sendSingle(id);
      toast.success("Approved and sent successfully!");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to send email");
    }
  }

  async function handleReject(id: string) {
    try {
      await api.queue.reject(id);
      toast.success("Rejected email");
      load();
      if (selected?.id === id) setSelected(null);
    } catch {
      toast.error("Failed to reject");
    }
  }

  async function handleUpdate(id: string, field: string, val: string) {
    try {
      await api.queue.update(id, { [field]: val });
      setSelected((prev: any) => ({ ...prev, [field]: val }));
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleSendAll() {
    try {
      const res = await api.queue.sendAll();
      toast.success(`Sent ${res.sent} emails! Failed: ${res.failed}. Skipped: ${res.skipped_warmup_limit}`);
      load();
    } catch {
      toast.error("Failed to send batch");
    }
  }

  async function handleApproveAndSendAll() {
    const unapproved = queue.filter(q => !q.approved && !q.sent_at).length;
    if (unapproved === 0) {
      toast.info("No unapproved drafts to send");
      return;
    }
    if (!confirm(`Are you sure you want to approve and send ${unapproved} emails at once?`)) return;
    
    try {
      await api.queue.approveAndSendAll();
      toast.success("Bulk sending started in the background!");
      load();
    } catch {
      toast.error("Failed to start bulk send");
    }
  }

  async function handleClearSent() {
    if (!confirm("Are you sure you want to permanently delete all sent emails?")) return;
    try {
      await api.queue.clearSent();
      toast.success("Sent history cleared");
      load();
    } catch {
      toast.error("Failed to clear sent history");
    }
  }

  const reviewQueue = queue.filter(q => !q.sent_at);
  const sentHistory = queue.filter(q => q.sent_at);

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="w-1/3 border-r bg-background flex flex-col">
        <Tabs defaultValue="review" className="flex-1 flex flex-col">
          <div className="p-4 border-b flex flex-col gap-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="review">Review ({reviewQueue.length})</TabsTrigger>
              <TabsTrigger value="sent">Sent ({sentHistory.length})</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="review" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="p-4 border-b flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-sm">Action Needed</h2>
                <Button onClick={handleSendAll} size="sm" variant="secondary">Send All Approved</Button>
              </div>
              <Button onClick={handleApproveAndSendAll} className="w-full bg-blue-600 hover:bg-blue-700 shadow-sm transition-all text-white font-medium flex items-center justify-center gap-2">
                <SendIcon className="w-4 h-4" /> Approve all and send them
              </Button>
            </div>
            <ScrollArea className="flex-1">
              {reviewQueue.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => setSelected(item)}
                  className={`p-4 border-b cursor-pointer hover:bg-accent/50 ${selected?.id === item.id ? 'bg-accent border-l-4 border-l-primary' : ''}`}
                >
                  <div className="font-medium truncate flex items-center justify-between">
                    <span>{item.lead?.contact_name || item.lead?.email}</span>
                    {item.approved ? (
                        <Badge className="bg-blue-500 text-xs">Approved</Badge>
                    ) : (
                        <Badge variant="outline" className="text-xs">Review Needed</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground truncate mt-1">{item.subject}</div>
                </div>
              ))}
              {reviewQueue.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">Queue is empty</div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sent" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-muted/20">
              <span className="text-sm text-muted-foreground">Historically sent emails</span>
              <Button onClick={handleClearSent} size="sm" variant="destructive" className="flex gap-2">
                <TrashIcon className="w-4 h-4" /> Remove All
              </Button>
            </div>
            <ScrollArea className="flex-1">
              {sentHistory.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => setSelected(item)}
                  className={`p-4 border-b cursor-pointer hover:bg-accent/50 ${selected?.id === item.id ? 'bg-accent border-l-4 border-l-primary' : ''}`}
                >
                  <div className="font-medium truncate flex items-center justify-between">
                    <span>{item.lead?.contact_name || item.lead?.email}</span>
                    <Badge variant="secondary" className="text-xs">Sent</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground truncate mt-1">{item.subject}</div>
                </div>
              ))}
              {sentHistory.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">No sent emails</div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
      
      <div className="flex-1 p-8 bg-muted/20">
        {selected ? (
          <div key={selected.id} className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold">Review Email</h2>
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">To</div>
                  <div className="font-medium">{selected.lead?.email}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Subject</div>
                  <input 
                    className="w-full bg-transparent border-b outline-none focus:border-primary font-medium p-1"
                    defaultValue={selected.subject}
                    onBlur={(e) => handleUpdate(selected.id, "subject", e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Message</div>
                  <Textarea 
                    className="min-h-[300px] resize-y leading-relaxed"
                    defaultValue={selected.body}
                    onBlur={(e) => handleUpdate(selected.id, "body", e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button variant="destructive" onClick={() => handleReject(selected.id)} disabled={!!selected.sent_at}>Reject Draft</Button>
                  
                  {!selected.sent_at ? (
                    <>
                      {!selected.approved && (
                        <Button variant="outline" onClick={() => handleApprove(selected.id)}>Save Approval</Button>
                      )}
                      <Button onClick={() => handleSendSingle(selected.id)} className="bg-green-600 hover:bg-green-700">
                        <SendIcon className="w-4 h-4 mr-2" /> Approve & Send Now
                      </Button>
                    </>
                  ) : (
                    <Button disabled variant="secondary">Already Sent</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Select an email to review
          </div>
        )}
      </div>
    </div>
  );
}
