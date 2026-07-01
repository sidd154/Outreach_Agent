const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

type RequestOptions = RequestInit & {
  apiKey?: string;
  isMultipart?: boolean;
};

export async function fetchApi<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { apiKey, isMultipart, headers, ...rest } = options;
  let key = apiKey;
  if (!key && typeof window !== 'undefined') {
      key = localStorage.getItem("workspaceApiKey") || undefined;
  }
  
  const customHeaders = new Headers(headers as HeadersInit);
  if (key) {
    customHeaders.set("x-api-key", key);
  }
  if (!isMultipart) {
    customHeaders.set("Content-Type", "application/json");
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...rest,
    headers: customHeaders,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const error: any = new Error(errData.detail || "API request failed");
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export const api = {
  workspace: {
    init: async (name: string) => fetchApi<{ api_key: string; workspace_id: string }>("/workspace/init", {
      method: "POST",
      body: JSON.stringify({ name })
    }),
    login: async (data: any) => fetchApi<{ api_key: string; workspace_id: string }>("/workspace/login", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    get: async () => fetchApi<any>("/workspace", { method: "GET" }),
    update: async (data: any) => fetchApi<any>("/workspace", {
      method: "PUT",
      body: JSON.stringify(data)
    }),
    uploadPdf: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetchApi<any>("/workspace/pdf-upload", {
        method: "POST",
        body: formData,
        isMultipart: true
      });
    },
    verifyResend: async (apiKey: string) => fetchApi<{ valid: boolean }>("/workspace/resend/verify", {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey })
    }),
    gmailConnectUrl: async () => fetchApi<{ oauth_url: string }>("/workspace/gmail/connect", { method: "GET" }),
    gmailStatus: async () => fetchApi<{ connected: boolean; email: string }>("/workspace/gmail/status", { method: "GET" }),
    gmailPoll: async () => fetchApi<{ polled_count: number }>("/workspace/gmail/poll-now", { method: "POST" }),
    gmailDisconnect: async () => fetchApi<{ status: string }>("/workspace/gmail/disconnect", { method: "POST" }),
    testSmtp: async (data: any) => fetchApi<{ status: string; message: string }>("/workspace/smtp/test", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    testImap: async (data: any) => fetchApi<{ status: string; message: string }>("/workspace/imap/test", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    imapPollNow: async () => fetchApi<{ polled_count: number }>("/workspace/imap/poll-now", { method: "POST" }),
    seedDemoLeads: async () => fetchApi<{ status: string; added: number }>("/workspace/demo-leads", {
      method: "POST"
    })
  },
  msOauth: {
    status: async () => fetchApi<{ connected: boolean; client_id: string; tenant_id: string; token_expiry: string | null }>("/workspace/ms-oauth/status", { method: "GET" }),
    start: async () => fetchApi<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number; message: string }>("/workspace/ms-oauth/start", { method: "POST" }),
    poll: async (device_code: string) => fetchApi<{ status: string }>("/workspace/ms-oauth/poll", { method: "POST", body: JSON.stringify({ device_code }) }),
    disconnect: async () => fetchApi<{ status: string }>("/workspace/ms-oauth/disconnect", { method: "POST" }),
  },
  campaigns: {
    list: async () => fetchApi<any[]>("/campaigns", { method: "GET" }),
    create: async (data: any) => fetchApi<any>("/campaigns", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    get: async (id: string) => fetchApi<any>(`/campaigns/${id}`, { method: "GET" }),
    update: async (id: string, data: any) => fetchApi<any>(`/campaigns/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    })
  },
  leads: {
    list: async (campaignId?: string) => fetchApi<any[]>(`/leads${campaignId ? `?campaign_id=${campaignId}` : ''}`, { method: "GET" }),
    create: async (data: any) => fetchApi<any>("/leads", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    update: async (id: string, data: any) => fetchApi<any>(`/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    }),
    delete: async (id: string) => fetchApi<{status: string}>(`/leads/${id}`, { method: "DELETE" }),
    importCsv: async (file: File, campaignId?: string) => {
      const formData = new FormData();
      formData.append("file", file);
      let url = "/leads/import";
      if (campaignId) url += `?campaign_id=${campaignId}`;
      return fetchApi<any>(url, {
        method: "POST",
        body: formData,
        isMultipart: true
      });
    },
    purge: async () => fetchApi<{status: string}>("/leads/purge", { method: "DELETE" })
  },
  generate: {
    forLead: async (leadId: string, variations: number = 1, useStyleSample: boolean = false) => fetchApi<any[]>(`/generate/${leadId}?variations=${variations}&use_style_sample=${useStyleSample}`, { method: "POST" }),
    batch: async (data: { lead_ids: string[], variations: number }) => fetchApi<any>("/generate/batch", { method: "POST", body: JSON.stringify(data) }),
    selectVariation: async (emailId: string) => fetchApi<any>(`/generate/${emailId}/select-variation`, { method: "POST" })
  },
  queue: {
    get: async () => fetchApi<any[]>("/queue", { method: "GET" }),
    approve: async (id: string) => fetchApi<{status: string}>(`/queue/${id}/approve`, { method: "POST" }),
    reject: async (id: string) => fetchApi<{status: string}>(`/queue/${id}/reject`, { method: "POST" }),
    update: async (id: string, data: {subject?: string, body?: string}) => fetchApi<{status: string}>(`/queue/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    sendAll: async () => fetchApi<any>("/queue/send-all", { method: "POST" }),
    approveAndSendAll: async () => fetchApi<any>("/queue/approve-and-send-all", { method: "POST" }),
    sendSingle: async (id: string) => fetchApi<{status: string}>(`/queue/${id}/send`, { method: "POST" }),
    regenerate: async (id: string, instruction: string) => fetchApi<{ subject: string; body: string }>(`/queue/${id}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ instruction })
    }),
    clearSent: async () => fetchApi<any>("/queue/sent", { method: "DELETE" })
  },
  replies: {
    get: async () => fetchApi<any[]>("/replies", { method: "GET" }),
    stats: async () => fetchApi<any>("/replies/stats", { method: "GET" }),
    sendDraft: async (id: string) => fetchApi<any>(`/replies/${id}/send-draft`, { method: "POST" }),
    sendManual: async (id: string, data: {subject: string, body: string}) => fetchApi<any>(`/replies/${id}/send-manual`, { method: "POST", body: JSON.stringify(data) }),
    suppress: async (id: string) => fetchApi<any>(`/replies/${id}/suppress`, { method: "POST" }),
    snooze: async (id: string, days: number = 7) => fetchApi<any>(`/replies/${id}/snooze`, { method: "POST" , body: JSON.stringify({ days }) }),
    ignore: async (id: string) => fetchApi<any>(`/replies/${id}/ignore`, { method: "POST" }),
    regenerateDraft: async (id: string, tone: string) => fetchApi<any>(`/replies/${id}/regenerate-draft`, { method: "POST", body: JSON.stringify({ tone }) })
  },
  templates: {
    list: async () => fetchApi<any[]>("/templates", { method: "GET" }),
    create: async (data: { name: string; subject: string; body: string }) =>
      fetchApi<any>("/templates", { method: "POST", body: JSON.stringify(data) }),
    update: async (id: string, data: Partial<{ name: string; subject: string; body: string }>) =>
      fetchApi<any>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: async (id: string) => fetchApi<any>(`/templates/${id}`, { method: "DELETE" }),
    apply: async (templateId: string, leadIds: string[]) =>
      fetchApi<{ applied: number }>(`/templates/${templateId}/apply`, {
        method: "POST",
        body: JSON.stringify({ lead_ids: leadIds }),
      }),
  },
  followup: {
    getStatus: async () => fetchApi<{ no_reply: any[]; replied: any[] }>("/followup/status", { method: "GET" }),
    generate: async (data: { lead_ids?: string[]; group?: string }) => fetchApi<any>("/followup/generate", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    sendBatch: async (leadIds: string[]) => fetchApi<{ status: string; sent: number; failed: number }>("/followup/send-batch", {
      method: "POST",
      body: JSON.stringify({ lead_ids: leadIds })
    })
  },
  dashboard: {
    getStats: async () => fetchApi<{
      stats: {
        total_leads: number;
        emails_sent: number;
        opened_emails: number;
        total_replies: number;
        open_rate: number;
        reply_rate: number;
      };
      activities: Array<{
        id: string;
        type: string;
        description: string;
        timestamp: string;
        status: string;
      }>;
    }>("/dashboard/stats", { method: "GET" })
  }
};
