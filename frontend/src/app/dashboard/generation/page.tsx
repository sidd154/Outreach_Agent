"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SendIcon, TrashIcon, Sparkles, CornerDownLeft, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function GenerationQueuePage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);

  // Chatbot state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Live edited subject/body (controlled so chatbot updates are reflected)
  // Live edited subject/body/recipient details
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [editedTo, setEditedTo] = useState("");
  const [editedCc, setEditedCc] = useState("");
  const [activeTab, setActiveTab] = useState<"review" | "sent">("review");
  const [workspace, setWorkspace] = useState<any>(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selected) {
      setEditedSubject(selected.subject || "");
      setEditedBody(selected.body || "");
      setEditedTo(selected.lead?.email || "");
      setEditedCc(selected.cc || "");
      setChatMessages([{
        role: "assistant",
        content: `Hi! I can rewrite this email for you. Just tell me what to change — for example:\n\n• "Make it shorter"\n• "Make it more casual"\n• "Add a question at the end"\n• "Focus more on pricing benefits"`
      }]);
    }
  }, [selected?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function load() {
    try {
      const data = await api.queue.get();
      setQueue(data);
      if (data.length > 0 && !selected) setSelected(data[0]);
      
      const ws = await api.workspace.get();
      setWorkspace(ws);
    } catch {
      toast.error("Failed to load queue");
    }
  }

  useEffect(() => {
    const hasProcessingEmails = queue.some(q => q.approved && !q.sent_at);
    if (!hasProcessingEmails) return;
    const interval = setInterval(() => { load(); }, 3000);
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
      setSelected((prev: any) => {
        if (field === "to_email") {
          return { ...prev, lead: { ...prev.lead, email: val } };
        }
        return { ...prev, [field]: val };
      });
      setQueue(prevQueue => prevQueue.map(item => {
        if (item.id === id) {
          if (field === "to_email") {
            return { ...item, lead: { ...item.lead, email: val } };
          }
          return { ...item, [field]: val };
        }
        return item;
      }));
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
    if (unapproved === 0) { toast.info("No unapproved drafts to send"); return; }
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

  async function handleRegenerate() {
    if (!chatInput.trim() || !selected) return;
    const instruction = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: instruction }]);
    setRegenerating(true);
    try {
      const res = await api.queue.regenerate(selected.id, instruction);
      setEditedSubject(res.subject);
      setEditedBody(res.body);
      setSelected((prev: any) => ({ ...prev, subject: res.subject, body: res.body }));
      
      // Persist changes in the local queue list state immediately
      setQueue(prevQueue => prevQueue.map(item => {
        if (item.id === selected.id) {
          return { ...item, subject: res.subject, body: res.body };
        }
        return item;
      }));

      setChatMessages(prev => [...prev, {
        role: "assistant",
        content: `Done! I've rewritten the email:\n\n**Subject:** ${res.subject}\n\nThe body has been updated. You can edit it further or send it directly.`
      }]);
    } catch (e: any) {
      setChatMessages(prev => [...prev, {
        role: "assistant",
        content: `Sorry, something went wrong: ${e.message || "Failed to regenerate"}. Make sure your OpenAI API key is configured in Settings.`
      }]);
    } finally {
      setRegenerating(false);
    }
  }

  const reviewQueue = queue.filter(q => !q.sent_at);
  const sentHistory = queue.filter(q => q.sent_at);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Email List */}
      <div className="w-[25%] border-r bg-background flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 border-b flex flex-col gap-3 shrink-0">
            <div className="grid w-full grid-cols-2 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setActiveTab("review")}
                className={`py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === "review"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Review ({reviewQueue.length})
              </button>
              <button
                onClick={() => setActiveTab("sent")}
                className={`py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === "sent"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sent ({sentHistory.length})
              </button>
            </div>
          </div>

          {activeTab === "review" ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 border-b flex flex-col gap-3 shrink-0">
                <div className="flex justify-between items-center">
                  <h2 className="font-semibold text-sm">Action Needed</h2>
                  <Button onClick={handleSendAll} size="sm" variant="secondary">Send Approved</Button>
                </div>
                <Button onClick={handleApproveAndSendAll} className="w-full bg-blue-600 hover:bg-blue-700 shadow-sm transition-all text-white font-medium flex items-center justify-center gap-2">
                  <SendIcon className="w-4 h-4" /> Approve all and send
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {reviewQueue.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`p-4 border-b cursor-pointer hover:bg-accent/50 transition-colors ${selected?.id === item.id ? 'bg-accent border-l-4 border-l-primary' : ''}`}
                  >
                    <div className="font-medium truncate flex items-center justify-between">
                      <span>{item.lead?.contact_name || item.lead?.email}</span>
                      {item.approved ? (
                        <Badge className="bg-blue-500 text-xs">Approved</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Review</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-1">{item.subject}</div>
                  </div>
                ))}
                {reviewQueue.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">Queue is empty</div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 border-b flex justify-between items-center bg-muted/20 shrink-0">
                <span className="text-sm text-muted-foreground">Historically sent emails</span>
                <Button onClick={handleClearSent} size="sm" variant="destructive" className="flex gap-2">
                  <TrashIcon className="w-4 h-4" /> Remove All
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {sentHistory.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`p-4 border-b cursor-pointer hover:bg-accent/50 transition-colors ${selected?.id === item.id ? 'bg-accent border-l-4 border-l-primary' : ''}`}
                  >
                    <div className="font-medium truncate flex items-center justify-between">
                      <span>{item.lead?.contact_name || item.lead?.email}</span>
                      {item.is_opened ? (
                        <Badge className="bg-green-500 text-white text-xs hover:bg-green-600">Read</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Sent</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-1">{item.subject}</div>
                  </div>
                ))}
                {sentHistory.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">No sent emails</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Middle: Email Preview & Editor */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-muted/5">
        {selected ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Review Email</h2>
                {selected.sent_at && (
                  <Badge variant="secondary">Sent {new Date(selected.sent_at).toLocaleDateString()}</Badge>
                )}
              </div>
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">To</div>
                      <input
                        className="w-full bg-transparent border-b outline-none focus:border-primary font-medium p-1 transition-colors"
                        value={editedTo}
                        onChange={(e) => setEditedTo(e.target.value)}
                        onBlur={(e) => handleUpdate(selected.id, "to_email", e.target.value)}
                        disabled={!!selected.sent_at}
                      />
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Cc</div>
                      <input
                        className="w-full bg-transparent border-b outline-none focus:border-primary text-sm p-1 transition-colors"
                        placeholder="E.g., manager@company.com, team@company.com"
                        value={editedCc}
                        onChange={(e) => setEditedCc(e.target.value)}
                        onBlur={(e) => handleUpdate(selected.id, "cc", e.target.value)}
                        disabled={!!selected.sent_at}
                      />
                    </div>
                    {selected.sent_at && (
                      <div className="flex gap-4 p-3 rounded-lg bg-muted/50 text-xs mt-2 border">
                        <div>
                          <span className="font-semibold text-muted-foreground block uppercase">Sent At</span>
                          <span className="font-medium">{new Date(selected.sent_at).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-muted-foreground block uppercase">Read Status</span>
                          {selected.is_opened ? (
                            <span className="font-semibold text-green-600">Opened ({new Date(selected.opened_at).toLocaleString()})</span>
                          ) : (
                            <span className="text-muted-foreground">Unread</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Subject</div>
                    <input
                      className="w-full bg-transparent border-b outline-none focus:border-primary font-medium p-1 transition-colors"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      onBlur={(e) => handleUpdate(selected.id, "subject", e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Message</div>
                    <Textarea
                      className="min-h-[300px] resize-y leading-relaxed"
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      onBlur={(e) => handleUpdate(selected.id, "body", e.target.value)}
                    />
                    {workspace?.email_signoff && (
                      <div className="p-4 bg-muted/20 border border-dashed rounded-lg text-sm text-foreground/80 whitespace-pre-wrap font-sans mt-3 select-none">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2">
                          Email Signature (Appended Dynamically on Send)
                        </div>
                        {workspace.email_signoff}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-3 pt-2 border-t">
                    <Button variant="destructive" size="sm" onClick={() => handleReject(selected.id)} disabled={!!selected.sent_at}>Reject</Button>
                    {!selected.sent_at ? (
                      <>
                        {!selected.approved && (
                          <Button variant="outline" size="sm" onClick={() => handleApprove(selected.id)}>Save Approval</Button>
                        )}
                        <Button size="sm" onClick={() => handleSendSingle(selected.id)} className="bg-green-600 hover:bg-green-700">
                          <SendIcon className="w-4 h-4 mr-2" /> Approve & Send Now
                        </Button>
                      </>
                    ) : (
                      <Button disabled variant="secondary" size="sm">Already Sent</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Select an email to review
          </div>
        )}
      </div>

      {/* Right: AI Chatbot Panel */}
      {selected && !selected.sent_at && (
        <div className="w-[30%] border-l bg-background flex flex-col h-full">
          {/* Chat header */}
          <div className="px-4 py-3.5 border-b flex items-center gap-2 bg-muted/20">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <div>
              <p className="text-sm font-semibold">AI Assistant</p>
              <p className="text-[11px] text-muted-foreground">Regenerate email with custom instructions</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <div className="space-y-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {regenerating && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" /> Rewriting...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t bg-muted/5 flex gap-2 items-end">
            <Textarea
              placeholder='e.g., "Make it more casual"'
              className="flex-1 min-h-[44px] max-h-[120px] resize-none text-sm rounded-lg"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleRegenerate();
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleRegenerate}
              disabled={regenerating || !chatInput.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white shrink-0 h-[44px] w-[44px] rounded-lg p-0 flex items-center justify-center"
            >
              {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerDownLeft className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
