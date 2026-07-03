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
  Loader2, 
  Server, 
  Mail, 
  Database, 
  Sparkles,
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

  // Field Inputs (uncontrolled defaultValues, but local state for passwords/keys to send in testing/updating)
  const [smtpPassword, setSmtpPassword] = useState("");
  const [imapPassword, setImapPassword] = useState("");

  // Microsoft OAuth2 state
  const [msOauthStatus, setMsOauthStatus] = useState<any>(null);
  const [msConnecting, setMsConnecting] = useState(false);
  const [msDeviceCode, setMsDeviceCode] = useState<string | null>(null);
  const [msUserCode, setMsUserCode] = useState<string | null>(null);
  const [msVerifyUrl, setMsVerifyUrl] = useState<string | null>(null);
  const [msPollInterval, setMsPollInterval] = useState<any>(null);

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
        // Load MS OAuth status
        try {
          const ms = await api.msOauth.status();
          setMsOauthStatus(ms);
        } catch {}
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

  const handleFieldChange = (field: string, value: any) => {
    setWorkspace((prev: any) => prev ? { ...prev, [field]: value } : prev);
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

  const handleMsOauthConnect = async () => {
    setMsConnecting(true);
    try {
      const res = await api.msOauth.start();
      setMsDeviceCode(res.device_code);
      setMsUserCode(res.user_code);
      setMsVerifyUrl(res.verification_uri);
      // Open browser tab for user
      window.open(res.verification_uri, "_blank");
      toast.info(`Go to ${res.verification_uri} and enter code: ${res.user_code}`);
      // Start polling
      const interval = setInterval(async () => {
        try {
          const pollRes = await api.msOauth.poll(res.device_code);
          if (pollRes.status === "connected") {
            clearInterval(interval);
            setMsPollInterval(null);
            setMsDeviceCode(null);
            setMsUserCode(null);
            setMsVerifyUrl(null);
            setMsConnecting(false);
            const ms = await api.msOauth.status();
            setMsOauthStatus(ms);
            toast.success("Microsoft OAuth2 connected! IMAP is now active.");
          } else if (pollRes.status === "declined" || pollRes.status === "expired") {
            clearInterval(interval);
            setMsPollInterval(null);
            setMsConnecting(false);
            toast.error(`Authorization ${pollRes.status}. Please try again.`);
          }
        } catch {}
      }, (res.interval || 5) * 1000);
      setMsPollInterval(interval);
    } catch (e: any) {
      setMsConnecting(false);
      toast.error(e.message || "Failed to start Microsoft OAuth2 flow. Make sure Client ID and Tenant ID are saved.");
    }
  };

  const handleMsOauthDisconnect = async () => {
    if (msPollInterval) { clearInterval(msPollInterval); setMsPollInterval(null); }
    try {
      await api.msOauth.disconnect();
      setMsOauthStatus({ connected: false, client_id: msOauthStatus?.client_id || "", tenant_id: msOauthStatus?.tenant_id || "" });
      setMsConnecting(false);
      setMsDeviceCode(null);
      setMsUserCode(null);
      toast.success("Microsoft OAuth2 disconnected.");
    } catch (e: any) {
      toast.error(e.message || "Failed to disconnect");
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
    if (state === "saved") return <span className="text-[10px] text-green-500 ml-2">Saved</span>;
    if (state === "error") return <span className="text-[10px] text-red-500 ml-2">Error</span>;
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

              {/* Microsoft OAuth2 Section */}
              <div className="mt-4 border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Microsoft OAuth2 (XOAUTH2)</p>
                    <p className="text-xs text-muted-foreground">Required for Microsoft 365 work accounts where Basic Auth is blocked</p>
                  </div>
                  {msOauthStatus?.connected && (
                    <span className="text-xs bg-green-500/15 text-green-600 border border-green-500/30 rounded-full px-2 py-0.5">Connected</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Azure Client ID {renderSaveIndicator("ms_client_id")}</Label>
                    <Input
                      id="ms_client_id"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      defaultValue={msOauthStatus?.client_id || workspace?.ms_client_id || ""}
                      onBlur={(e) => handleUpdateField("ms_client_id", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Azure Tenant ID {renderSaveIndicator("ms_tenant_id")}</Label>
                    <Input
                      id="ms_tenant_id"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      defaultValue={msOauthStatus?.tenant_id || workspace?.ms_tenant_id || ""}
                      onBlur={(e) => handleUpdateField("ms_tenant_id", e.target.value)}
                    />
                  </div>
                </div>

                {/* Device Code UI */}
                {msDeviceCode && msUserCode && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                    <p className="text-xs font-medium text-blue-600">Waiting for authorization...</p>
                    <p className="text-xs text-muted-foreground">A browser tab has opened. Sign in with your Microsoft account and enter this code:</p>
                    <div className="flex items-center gap-2">
                      <code className="text-lg font-bold tracking-widest bg-muted px-3 py-1 rounded">{msUserCode}</code>
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => window.open(msVerifyUrl!, "_blank")}>
                        Open Browser
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {msOauthStatus?.connected ? (
                    <Button variant="destructive" size="sm" className="flex-1 text-xs" onClick={handleMsOauthDisconnect}>
                      Disconnect Microsoft OAuth2
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1 text-xs bg-[#0078d4] hover:bg-[#106ebe] text-white"
                      onClick={handleMsOauthConnect}
                      disabled={msConnecting}
                    >
                      {msConnecting ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Waiting...</> : "Connect Microsoft Account"}
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Need help? <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" className="underline text-primary">Register app in Azure Portal</a> → Add IMAP.AccessAsUser.All permission → copy Client ID &amp; Tenant ID above
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Login & Security Card */}
          <Card className="border border-muted/80 shadow-md">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                Workspace Login Settings
              </CardTitle>
              <CardDescription>Configure the login credentials used to access the dashboard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="login_email" className="text-xs">Login Email {renderSaveIndicator("login_email")}</Label>
                <Input 
                  id="login_email"
                  defaultValue={workspace?.login_email || "pixelstudios@gmail.com"}
                  placeholder="admin@domain.com"
                  onBlur={(e) => handleUpdateField("login_email", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="login_password" className="text-xs">Login Password {renderSaveIndicator("login_password")}</Label>
                <Input 
                  id="login_password"
                  type="password"
                  defaultValue={workspace?.login_password || "PixelOutreach!2026"}
                  placeholder="Enter new login password"
                  onBlur={(e) => handleUpdateField("login_password", e.target.value)}
                />
              </div>
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
              </div>
              <CardDescription>Select the AI copywriting and reply generation model</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
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
                  <Label htmlFor="workspace_name" className="text-xs">Workspace / Company Name {renderSaveIndicator("name")}</Label>
                  <Input 
                    id="workspace_name"
                    value={workspace?.name || ""}
                    placeholder="e.g. Pixel Studios"
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    onBlur={(e) => handleUpdateField("name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email_signoff" className="text-xs">Email Sign-off / Salutation {renderSaveIndicator("email_signoff")}</Label>
                  <Input 
                    id="email_signoff"
                    value={workspace?.email_signoff || ""}
                    placeholder="e.g. Best regards, / Warmly,"
                    onChange={(e) => handleFieldChange("email_signoff", e.target.value)}
                    onBlur={(e) => handleUpdateField("email_signoff", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="product_name" className="text-xs">Product / Service Name {renderSaveIndicator("product_name")}</Label>
                  <Input 
                    id="product_name"
                    value={workspace?.product_name || ""}
                    placeholder="SaaS Product or Agency Service"
                    onChange={(e) => handleFieldChange("product_name", e.target.value)}
                    onBlur={(e) => handleUpdateField("product_name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="product_website" className="text-xs">Website {renderSaveIndicator("product_website")}</Label>
                  <Input 
                    id="product_website"
                    value={workspace?.product_website || ""}
                    placeholder="https://company.com"
                    onChange={(e) => handleFieldChange("product_website", e.target.value)}
                    onBlur={(e) => handleUpdateField("product_website", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="product_phone" className="text-xs">Phone {renderSaveIndicator("product_phone")}</Label>
                  <Input 
                    id="product_phone"
                    value={workspace?.product_phone || ""}
                    placeholder="+1 (555) 000-0000"
                    onChange={(e) => handleFieldChange("product_phone", e.target.value)}
                    onBlur={(e) => handleUpdateField("product_phone", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="product_demo_link" className="text-xs">Calendly / Booking Link {renderSaveIndicator("product_demo_link")}</Label>
                  <Input 
                    id="product_demo_link"
                    value={workspace?.product_demo_link || ""}
                    placeholder="https://calendly.com/booking"
                    onChange={(e) => handleFieldChange("product_demo_link", e.target.value)}
                    onBlur={(e) => handleUpdateField("product_demo_link", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="product_one_liner" className="text-xs">One Liner Pitch / Value Prop {renderSaveIndicator("product_one_liner")}</Label>
                <Input 
                  id="product_one_liner"
                  value={workspace?.product_one_liner || ""}
                  placeholder="E.g., Custom development solutions for enterprise operations."
                  onChange={(e) => handleFieldChange("product_one_liner", e.target.value)}
                  onBlur={(e) => handleUpdateField("product_one_liner", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="tone" className="text-xs">Email Tone {renderSaveIndicator("tone")}</Label>
                  <Input 
                    id="tone"
                    value={workspace?.tone || ""}
                    placeholder="formal and respectful"
                    onChange={(e) => handleFieldChange("tone", e.target.value)}
                    onBlur={(e) => handleUpdateField("tone", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cta" className="text-xs">Call to Action (CTA) {renderSaveIndicator("cta")}</Label>
                  <Input 
                    id="cta"
                    value={workspace?.cta || ""}
                    placeholder="Would you be open to a call?"
                    onChange={(e) => handleFieldChange("cta", e.target.value)}
                    onBlur={(e) => handleUpdateField("cta", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Live Email Template structure preview */}
      <Card className="border border-muted/80 shadow-md bg-muted/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-500" /> Live Email Template Structure Preview
            </CardTitle>
            <CardDescription>
              Shows how the AI copywriting engine structures your email signature (without headers like "Website:" or "Phone:")
            </CardDescription>
          </div>
          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-none">
            Live Preview
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-muted bg-card shadow-inner p-6 space-y-4 font-mono text-sm leading-relaxed text-foreground select-none max-w-3xl mx-auto">
            {/* Subject */}
            <div className="border-b pb-2">
              <span className="text-muted-foreground font-semibold">Subject: </span>
              <span className="text-foreground font-sans">
                {workspace?.product_name || "[Product Name]"} - Quick Question
              </span>
            </div>

            {/* Body */}
            <div className="space-y-4 font-sans text-base text-foreground/90">
              <p>Hi [Recipient Name],</p>

              <p className="text-muted-foreground/80 italic bg-muted/20 px-3 py-2 rounded-md border border-dashed text-xs">
                [AI-generated introduction personalized for target website details...]
              </p>

              <p>
                {workspace?.product_one_liner || "[Your One Liner Pitch / Value Proposition will be integrated here]"}
              </p>

              <p className="text-muted-foreground/80 italic bg-muted/20 px-3 py-2 rounded-md border border-dashed text-xs">
                [AI-generated details describing your product capabilities: {workspace?.product_name || "Product Name"}]
              </p>

              {workspace?.product_demo_link && (
                <p>
                  You can check out our calendar here: <span className="text-blue-600 underline cursor-pointer">{workspace.product_demo_link}</span>
                </p>
              )}

              <p className="font-semibold text-foreground mt-4">
                {workspace?.cta || "Would you be open to a brief call?"}
              </p>

              {/* Signature block (Exact direct values, no headers!) */}
              <div className="pt-4 border-t border-dashed mt-4 space-y-0.5 text-sm text-foreground/80 font-sans">
                <div>{workspace?.email_signoff || "Best regards,"}</div>
                <div className="font-semibold text-foreground">{workspace?.resend_from_name || workspace?.name || "[Sender Name]"}</div>
                <div className="text-muted-foreground">{workspace?.name || "[Company Name]"}</div>
                <div className="text-muted-foreground text-xs pt-1 flex items-center gap-1.5">
                  {workspace?.product_website && (
                    <span className="text-blue-600 hover:underline cursor-pointer">{workspace.product_website}</span>
                  )}
                  {workspace?.product_website && workspace?.product_phone && (
                    <span className="text-muted-foreground/50">|</span>
                  )}
                  {workspace?.product_phone && (
                    <span>{workspace.product_phone}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
              value={workspace?.product_description || ""}
              placeholder="Describe your service capabilities, target pain points solved, rates/packages, and differentiators..."
              onChange={(e) => handleFieldChange("product_description", e.target.value)}
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

          <div className="space-y-1">
            <Label htmlFor="followup_instructions" className="text-xs">Custom AI Follow-up Instructions {renderSaveIndicator("followup_instructions")}</Label>
            <Textarea 
              id="followup_instructions"
              className="h-24 leading-relaxed"
              defaultValue={workspace?.followup_instructions || ""}
              placeholder="E.g., Keep follow-up emails under 50 words, reference their lack of response politely, offer Tuesday/Thursday options..."
              onBlur={(e) => handleUpdateField("followup_instructions", e.target.value)}
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
