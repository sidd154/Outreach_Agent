"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";

export default function ProductSettingsPage() {
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      let key = localStorage.getItem("workspaceApiKey");
      try {
        if (!key) {
          const res = await api.workspace.init("Default Workspace");
          localStorage.setItem("workspaceApiKey", res.api_key);
          key = res.api_key;
        }
        const ws = await api.workspace.get();
        setWorkspace(ws);
      } catch (e: any) {
        if (e.status === 401) {
          // Stale key, try to re-init
          try {
            const res = await api.workspace.init("Default Workspace");
            localStorage.setItem("workspaceApiKey", res.api_key);
            const ws = await api.workspace.get();
            setWorkspace(ws);
            toast.success("Session restored");
          } catch {
            toast.error("Critical authentication error. Please clear your site data.");
          }
        } else {
          toast.error("Failed to load workspace");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleUpdate = async (field: string, value: string) => {
    try {
      const updated = await api.workspace.update({ [field]: value });
      setWorkspace(updated);
      toast.success("Saved");
    } catch {
      toast.error("Update failed");
    }
  };

  const [resendKeyInput, setResendKeyInput] = useState("");
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");

  const verifyResend = async () => {
    if (!resendKeyInput) return;
    try {
      const res = await api.workspace.verifyResend(resendKeyInput);
      if (res.valid) {
        toast.success("Resend configured successfully!");
        setWorkspace((w: any) => ({ ...w, resend_configured: true }));
        setResendKeyInput("");
      } else {
        toast.error("Invalid API key or network error");
      }
    } catch {
      toast.error("Error verifying key with API");
    }
  };

  const updateOpenAI = async () => {
    if (!openaiKeyInput) return;
    try {
      await api.workspace.update({ openai_api_key: openaiKeyInput });
      toast.success("OpenAI Key saved successfully!");
      setWorkspace((w: any) => ({ ...w, openai_configured: true }));
      setOpenaiKeyInput("");
    } catch {
      toast.error("Failed to save OpenAI key");
    }
  };

  const connectGmail = async () => {
    try {
      const res = await api.workspace.gmailConnectUrl();
      window.location.href = res.oauth_url;
    } catch {
      toast.error("Failed to start Gmail auth");
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">Workspace Configuration <span className="text-sm font-normal text-muted-foreground ml-2">v1.1 - Cleaned</span></h1>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Integrations</CardTitle>
              {(workspace?.resend_configured || workspace?.global_resend_active) && (
                <div className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Connect Active
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 mt-2">
              <Label className="flex justify-between">
                <span>Resend API Key</span>
                {workspace?.resend_configured && (
                  <span className="text-xs text-muted-foreground">re_•••••••• (Private)</span>
                )}
                {!workspace?.resend_configured && workspace?.global_resend_active && (
                  <span className="text-xs text-blue-600">Using Global Default</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input 
                  type="password"
                  placeholder={workspace?.resend_configured ? "••••••••••••••••" : "re_..."}
                  value={resendKeyInput}
                  onChange={(e) => setResendKeyInput(e.target.value)}
                />
                <Button variant={workspace?.resend_configured ? "outline" : "default"} onClick={verifyResend}>
                  {workspace?.resend_configured ? "Update" : "Connect"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Get your key from <a href="https://resend.com/api-keys" target="_blank" className="underline">resend.com</a>
              </p>
            </div>
            
            <div className="space-y-2 mt-4 pt-4 border-t border-dashed">
              <Label className="flex justify-between">
                <span>OpenAI API Key (GPT-4o)</span>
                {workspace?.openai_configured && (
                  <span className="text-xs text-muted-foreground">sk-•••••••• (Private)</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input 
                  type="password"
                  placeholder={workspace?.openai_configured ? "••••••••••••••••" : "sk-..."}
                  value={openaiKeyInput}
                  onChange={(e) => setOpenaiKeyInput(e.target.value)}
                />
                <Button variant={workspace?.openai_configured ? "outline" : "default"} onClick={updateOpenAI}>
                  {workspace?.openai_configured ? "Update" : "Save"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Required for generation. Get your key from <a href="https://platform.openai.com/api-keys" target="_blank" className="underline">platform.openai.com</a>
              </p>
            </div>
            
            <div className="space-y-2 mt-4">
              <Label>From Email Address</Label>
              <Input 
                defaultValue={workspace?.resend_from_email || ""}
                onBlur={(e) => handleUpdate("resend_from_email", e.target.value)}
                placeholder="sales@yourdomain.com"
              />
              <p className="text-[10px] text-muted-foreground">
                Must be a verified domain in Resend.
              </p>
            </div>

            <div className="space-y-2 mt-4">
              <Label>Sender Name (Freedom Mode)</Label>
              <Input 
                defaultValue={workspace?.resend_from_name || ""}
                onBlur={(e) => handleUpdate("resend_from_name", e.target.value)}
                placeholder="John Doe @ Company"
              />
              <p className="text-[10px] text-muted-foreground">
                The name recipients will see in their inbox.
              </p>
            </div>

            <div className="pt-4 border-t border-dashed">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Gmail Inbox</Label>
                  <div className="text-sm text-muted-foreground">
                    {workspace?.gmail_email || "No inbox connected"}
                  </div>
                </div>
                <Button 
                  size="sm"
                  variant={workspace?.gmail_connected ? "outline" : "default"} 
                  onClick={connectGmail}
                >
                  {workspace?.gmail_connected ? "Reconnect" : "Connect Gmail"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Product Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
             <div className="space-y-2">
              <Label>Workspace Name</Label>
              <Input 
                defaultValue={workspace?.name || ""}
                onBlur={(e) => handleUpdate("name", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Internal identifier for your workspace.</p>
            </div>
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input 
                defaultValue={workspace?.product_name || ""}
                onBlur={(e) => handleUpdate("product_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input 
                defaultValue={workspace?.product_website || ""}
                onBlur={(e) => handleUpdate("product_website", e.target.value)}
                placeholder="https://yourwebsite.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number (Optional)</Label>
              <Input 
                defaultValue={workspace?.product_phone || ""}
                onBlur={(e) => handleUpdate("product_phone", e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label>Demo Link (Optional)</Label>
              <Input 
                defaultValue={workspace?.product_demo_link || ""}
                onBlur={(e) => handleUpdate("product_demo_link", e.target.value)}
                placeholder="https://calendly.com/your-demo"
              />
            </div>
            <div className="space-y-2">
              <Label>One Liner</Label>
              <Input 
                defaultValue={workspace?.product_one_liner || ""}
                onBlur={(e) => handleUpdate("product_one_liner", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Input 
                defaultValue={workspace?.tone || ""}
                onBlur={(e) => handleUpdate("tone", e.target.value)}
                placeholder="Friendly but professional"
              />
            </div>
            <div className="space-y-2">
              <Label>Call to Action (CTA)</Label>
              <Input 
                defaultValue={workspace?.cta || ""}
                onBlur={(e) => handleUpdate("cta", e.target.value)}
                placeholder="Are you open to a brief call next week?"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Context & Instructions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
           <div className="space-y-2">
              <Label>Full Description (Optional)</Label>
              <Textarea 
                className="h-32"
                defaultValue={workspace?.product_description || ""}
                onBlur={(e) => handleUpdate("product_description", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Custom Instructions (Optional)</Label>
              <Textarea 
                className="h-32"
                defaultValue={workspace?.custom_instructions || ""}
                onBlur={(e) => handleUpdate("custom_instructions", e.target.value)}
                placeholder="E.g., Do not use emojis, keep paragraphs under 3 lines."
              />
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
