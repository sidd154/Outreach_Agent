"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { 
  Eye, 
  EyeOff, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Server, 
  Mail, 
  Database, 
  Sparkles,
  RefreshCw,
  PlusCircle
} from "lucide-react";

export default function ProductSettingsPage() {
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Connection Test States
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingImap, setTestingImap] = useState(false);
  
  // Password Visibility States
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [showImapPass, setShowImapPass] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Field Inputs (uncontrolled defaultValues, but local state for passwords/keys to send in testing/updating)
  const [smtpPassword, setSmtpPassword] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");

  // Saving states per field for auto-save feedback
  const [savingFields, setSavingFields] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      let key = localStorage.getItem("workspaceApiKey");
      try {
        if (!key) {
          const res = await api.workspace.init("Default Workspace");
          localStorage.setItem("workspaceApiKey", res.api_key);
        }
        const ws = await api.workspace.get();
        setWorkspace(ws);
      } catch (e: any) {
        if (e.status === 401) {
          try {
            const res = await api.workspace.init("Default Workspace");
            localStorage.setItem("workspaceApiKey", res.api_key);
            const ws = await api.workspace.get();
            setWorkspace(ws);
            toast.success("Session restored");
          } catch {
            toast.error("Critical authentication error. Please refresh the page.");
          }
        } else {
          toast.error("Failed to load workspace configuration");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleUpdateField = async (field: string, value: any) => {
    setSavingFields(prev => ({ ...prev, [field]: "saving" }));
    try {
      const updated = await api.workspace.update({ [field]: value });
      setWorkspace(updated);
      setSavingFields(prev => ({ ...prev, [field]: "saved" }));
      setTimeout(() => {
        setSavingFields(prev => {
          const copy = { ...prev };
          delete copy[field];
          return copy;
        });
      }, 2000);
    } catch {
      setSavingFields(prev => ({ ...prev, [field]: "error" }));
      toast.error(`Failed to save ${field.replace('_', ' ')}`);
    }
  };

  const handleUpdatePassword = async (type: "smtp" | "imap") => {
    const pwdValue = type === "smtp" ? smtpPassword : imapPassword;
    if (!pwdValue) return;
    
    const fieldName = type === "smtp" ? "smtp_password" : "imap_password";
    setSavingFields(prev => ({ ...prev, [fieldName]: "saving" }));
    
    try {
      const updated = await api.workspace.update({ [fieldName]: pwdValue });
      setWorkspace(updated);
      if (type === "smtp") setSmtpPassword("");
      else setImapPassword("");
      setSavingFields(prev => ({ ...prev, [fieldName]: "saved" }));
      toast.success(`${type.toUpperCase()} password updated successfully`);
      setTimeout(() => {
        setSavingFields(prev => {
          const copy = { ...prev };
          delete copy[fieldName];
          return copy;
        });
      }, 2000);
    } catch {
      setSavingFields(prev => ({ ...prev, [fieldName]: "error" }));
      toast.error(`Failed to save ${type.toUpperCase()} password`);
    }
  };

  const handleUpdateOpenAI = async () => {
    if (!openaiKey) return;
    setSavingFields(prev => ({ ...prev, "openai_api_key": "saving" }));
    try {
      const updated = await api.workspace.update({ openai_api_key: openaiKey });
      setWorkspace(updated);
      setOpenaiKey("");
      setSavingFields(prev => ({ ...prev, "openai_api_key": "saved" }));
      toast.success("OpenAI Key saved successfully");
      setTimeout(() => {
        setSavingFields(prev => {
          const copy = { ...prev };
          delete copy["openai_api_key"];
          return copy;
        });
      }, 2000);
    } catch {
      setSavingFields(prev => ({ ...prev, "openai_api_key": "error" }));
      toast.error("Failed to save OpenAI API Key");
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    const payload = {
      smtp_host: (document.getElementById("smtp_host") as HTMLInputElement)?.value || workspace?.smtp_host,
      smtp_port: parseInt((document.getElementById("smtp_port") as HTMLInputElement)?.value || "587"),
      smtp_username: (document.getElementById("smtp_username") as HTMLInputElement)?.value || workspace?.smtp_username,
      smtp_password: smtpPassword || undefined
    };
    try {
      const res = await api.workspace.testSmtp(payload);
      if (res.status === "success") {
        toast.success(res.message);
      } else {
        toast.error(`SMTP Test Failed: ${res.message}`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to execute SMTP connection test");
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleTestImap = async () => {
    setTestingImap(true);
    const payload = {
      imap_host: (document.getElementById("imap_host") as HTMLInputElement)?.value || workspace?.imap_host,
      imap_port: parseInt((document.getElementById("imap_port") as HTMLInputElement)?.value || "993"),
      imap_username: (document.getElementById("imap_username") as HTMLInputElement)?.value || workspace?.imap_username,
      imap_password: imapPassword || undefined
    };
    try {
      const res = await api.workspace.testImap(payload);
      if (res.status === "success") {
        toast.success(res.message);
      } else {
        toast.error(`IMAP Test Failed: ${res.message}`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to execute IMAP connection test");
    } finally {
      setTestingImap(false);
    }
  };

  const handleSeedDemoLeads = async () => {
    try {
      const res = await api.workspace.seedDemoLeads();
      if (res.added > 0) {
        toast.success(`Successfully added ${res.added} demo leads!`);
      } else {
        toast.info("Demo leads are already loaded in the workspace.");
      }
    } catch {
      toast.error("Failed to seed demo leads");
    }
  };

  const renderSaveIndicator = (field: string) => {
    const state = savingFields[field];
    if (!state) return null;
    if (state === "saving") return <span className="text-[10px] text-blue-500 animate-pulse ml-2">Saving...</span>;
    if (state === "saved") return <span className="text-[10px] text-green-500 ml-2">Saved ✓</span>;
    if (state === "error") return <span className="text-[10px] text-red-500 ml-2">Error ✗</span>;
    return null;
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto bg-background min-h-screen">
      <div className="flex justify-between items-center border-b pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary">Outreach Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your mail servers, AI keys, and product descriptions</p>
        </div>
        <Button onClick={handleSeedDemoLeads} variant="outline" className="flex items-center gap-2 border-primary/20 hover:border-primary/50 transition-all">
          <PlusCircle className="w-4 h-4 text-primary" /> Load Demo Leads
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Hand: SMTP & IMAP Configuration */}
        <div className="space-y-8">
          {/* SMTP Card */}
          <Card className="border border-muted/80 shadow-md">
            <CardHeader className="space-y-1">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-500" /> Outbound SMTP Server
                </CardTitle>
                {workspace?.smtp_configured ? (
                  <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-[10px]">Configured</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Unconfigured</Badge>
                )}
              </div>
              <CardDescription>Setup details to send marketing/outreach emails</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="smtp_host" className="text-xs">SMTP Host {renderSaveIndicator("smtp_host")}</Label>
                  <Input 
                    id="smtp_host"
                    defaultValue={workspace?.smtp_host || ""}
                    placeholder="smtp.gmail.com"
                    onBlur={(e) => handleUpdateField("smtp_host", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="smtp_port" className="text-xs">Port {renderSaveIndicator("smtp_port")}</Label>
                  <Input 
                    id="smtp_port"
                    defaultValue={workspace?.smtp_port || 587}
                    placeholder="587"
                    type="number"
                    onBlur={(e) => handleUpdateField("smtp_port", parseInt(e.target.value || "587"))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="smtp_username" className="text-xs">SMTP Username {renderSaveIndicator("smtp_username")}</Label>
                <Input 
                  id="smtp_username"
                  defaultValue={workspace?.smtp_username || ""}
                  placeholder="sales@yourdomain.com"
                  onBlur={(e) => handleUpdateField("smtp_username", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex justify-between">
                  <span>SMTP Password {renderSaveIndicator("smtp_password")}</span>
                  {workspace?.smtp_configured && <span className="text-[10px] text-muted-foreground">•••••••• (Saved)</span>}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input 
                      type={showSmtpPass ? "text" : "password"}
                      placeholder="Enter SMTP App Password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowSmtpPass(!showSmtpPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    >
                      {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button variant="secondary" onClick={() => handleUpdatePassword("smtp")} disabled={!smtpPassword}>
                    Save
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-dashed">
                <div className="space-y-1">
                  <Label htmlFor="smtp_from_email" className="text-xs">From Email {renderSaveIndicator("smtp_from_email")}</Label>
                  <Input 
                    id="smtp_from_email"
                    defaultValue={workspace?.smtp_from_email || ""}
                    placeholder="hello@domain.com"
                    onBlur={(e) => handleUpdateField("smtp_from_email", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="smtp_from_name" className="text-xs">From Name {renderSaveIndicator("smtp_from_name")}</Label>
                  <Input 
                    id="smtp_from_name"
                    defaultValue={workspace?.smtp_from_name || ""}
                    placeholder="John Doe"
                    onBlur={(e) => handleUpdateField("smtp_from_name", e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={handleTestSmtp} disabled={testingSmtp} className="w-full mt-2" variant="outline">
                {testingSmtp ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...
                  </>
                ) : (
                  "Test SMTP Connection"
                )}
              </Button>
            </CardContent>
          </Card>

          {/* IMAP Card */}
          <Card className="border border-muted/80 shadow-md">
            <CardHeader className="space-y-1">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Server className="w-5 h-5 text-indigo-500" /> Inbound IMAP Server
                </CardTitle>
                {workspace?.imap_configured ? (
                  <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-[10px]">Configured</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Unconfigured</Badge>
                )}
              </div>
              <CardDescription>Setup details to poll lead replies automatically</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="imap_host" className="text-xs">IMAP Host {renderSaveIndicator("imap_host")}</Label>
                  <Input 
                    id="imap_host"
                    defaultValue={workspace?.imap_host || ""}
                    placeholder="imap.gmail.com"
                    onBlur={(e) => handleUpdateField("imap_host", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="imap_port" className="text-xs">Port {renderSaveIndicator("imap_port")}</Label>
                  <Input 
                    id="imap_port"
                    defaultValue={workspace?.imap_port || 993}
                    placeholder="993"
                    type="number"
                    onBlur={(e) => handleUpdateField("imap_port", parseInt(e.target.value || "993"))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="imap_username" className="text-xs">IMAP Username {renderSaveIndicator("imap_username")}</Label>
                <Input 
                  id="imap_username"
                  defaultValue={workspace?.imap_username || ""}
                  placeholder="inbox@yourdomain.com"
                  onBlur={(e) => handleUpdateField("imap_username", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex justify-between">
                  <span>IMAP Password {renderSaveIndicator("imap_password")}</span>
                  {workspace?.imap_configured && <span className="text-[10px] text-muted-foreground">•••••••• (Saved)</span>}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input 
                      type={showImapPass ? "text" : "password"}
                      placeholder="Enter IMAP App Password"
                      value={imapPassword}
                      onChange={(e) => setImapPassword(e.target.value)}
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowImapPass(!showImapPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    >
                      {showImapPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button variant="secondary" onClick={() => handleUpdatePassword("imap")} disabled={!imapPassword}>
                    Save
                  </Button>
                </div>
              </div>

              <Button onClick={handleTestImap} disabled={testingImap} className="w-full mt-2" variant="outline">
                {testingImap ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...
                  </>
                ) : (
                  "Test IMAP Connection"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Hand: AI Config & Product details */}
        <div className="space-y-8">
          {/* OpenAI AI Card */}
          <Card className="border border-muted/80 shadow-md">
            <CardHeader className="space-y-1">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-500" /> AI Engine Configuration
                </CardTitle>
                {workspace?.openai_configured ? (
                  <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-[10px]">Active</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                )}
              </div>
              <CardDescription>OpenAI API Key settings to generate copywriting and reply drafts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs flex justify-between">
                  <span>OpenAI API Key {renderSaveIndicator("openai_api_key")}</span>
                  {workspace?.openai_configured && <span className="text-[10px] text-muted-foreground">sk-•••••••• (Saved)</span>}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input 
                      type={showOpenaiKey ? "text" : "password"}
                      placeholder="sk-proj-..."
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    >
                      {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button variant="secondary" onClick={handleUpdateOpenAI} disabled={!openaiKey}>
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-1 pt-2 border-t border-dashed">
                <Label htmlFor="openai_model" className="text-xs">
                  AI Model {renderSaveIndicator("openai_model")}
                </Label>
                <select
                  id="openai_model"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                  value={workspace?.openai_model || "gpt-4o-mini"}
                  onChange={(e) => handleUpdateField("openai_model", e.target.value)}
                >
                  <option value="gpt-4o-mini" className="bg-card text-foreground">gpt-4o-mini (Default & Fast)</option>
                  <option value="gpt-4o" className="bg-card text-foreground">gpt-4o (High Quality)</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Product Identity Card */}
          <Card className="border border-muted/80 shadow-md">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-500" /> Product / Service Details
              </CardTitle>
              <CardDescription>Configure the product or service details used by copywriters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="product_name" className="text-xs">Product / Service Name {renderSaveIndicator("product_name")}</Label>
                  <Input 
                    id="product_name"
                    defaultValue={workspace?.product_name || ""}
                    placeholder="SaaS Product or Agency Service"
                    onBlur={(e) => handleUpdateField("product_name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="product_website" className="text-xs">Website {renderSaveIndicator("product_website")}</Label>
                  <Input 
                    id="product_website"
                    defaultValue={workspace?.product_website || ""}
                    placeholder="https://company.com"
                    onBlur={(e) => handleUpdateField("product_website", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="product_phone" className="text-xs">Phone {renderSaveIndicator("product_phone")}</Label>
                  <Input 
                    id="product_phone"
                    defaultValue={workspace?.product_phone || ""}
                    placeholder="+1 (555) 000-0000"
                    onBlur={(e) => handleUpdateField("product_phone", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="product_demo_link" className="text-xs">Calendly / Booking Link {renderSaveIndicator("product_demo_link")}</Label>
                  <Input 
                    id="product_demo_link"
                    defaultValue={workspace?.product_demo_link || ""}
                    placeholder="https://calendly.com/booking"
                    onBlur={(e) => handleUpdateField("product_demo_link", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="product_one_liner" className="text-xs">One Liner Pitch / Value Prop {renderSaveIndicator("product_one_liner")}</Label>
                <Input 
                  id="product_one_liner"
                  defaultValue={workspace?.product_one_liner || ""}
                  placeholder="E.g., Custom development solutions for enterprise operations."
                  onBlur={(e) => handleUpdateField("product_one_liner", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="tone" className="text-xs">Email Tone {renderSaveIndicator("tone")}</Label>
                  <Input 
                    id="tone"
                    defaultValue={workspace?.tone || ""}
                    placeholder="formal and respectful"
                    onBlur={(e) => handleUpdateField("tone", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cta" className="text-xs">Call to Action (CTA) {renderSaveIndicator("cta")}</Label>
                  <Input 
                    id="cta"
                    defaultValue={workspace?.cta || ""}
                    placeholder="Would you be open to a call?"
                    onBlur={(e) => handleUpdateField("cta", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Description & Instructions (Full Width) */}
      <Card className="border border-muted/80 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Context & Instructions</CardTitle>
          <CardDescription>Refined parameters to format emails and provide contextual guidance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="product_description" className="text-xs">Product / Service Description {renderSaveIndicator("product_description")}</Label>
            <Textarea 
              id="product_description"
              className="h-28 leading-relaxed"
              defaultValue={workspace?.product_description || ""}
              placeholder="Describe your service capabilities, target pain points solved, rates/packages, and differentiators..."
              onBlur={(e) => handleUpdateField("product_description", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="custom_instructions" className="text-xs">Custom AI Instructions {renderSaveIndicator("custom_instructions")}</Label>
            <Textarea 
              id="custom_instructions"
              className="h-24 leading-relaxed"
              defaultValue={workspace?.custom_instructions || ""}
              placeholder="E.g., Keep paragraphs under 3 lines, do not use exclamation marks, write in first-person plural..."
              onBlur={(e) => handleUpdateField("custom_instructions", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Badge helper to match shadcn badge
function Badge({ children, variant = "default", className = "" }: { children: React.ReactNode, variant?: "default" | "secondary" | "outline", className?: string }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    outline: "text-foreground border border-input hover:bg-accent hover:text-accent-foreground"
  };
  return (
    <span className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
