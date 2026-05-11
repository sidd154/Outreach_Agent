"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Check, X, Send, ChevronRight, Info } from "lucide-react";

type Template = { id: string; name: string; subject: string; body: string; created_at: string };
type Lead = { id: string; contact_name: string; org_name: string; email: string; status: string };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", subject: "", body: "" });

  // Apply panel state
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [tmplData, leadData] = await Promise.all([api.templates.list(), api.leads.list()]);
      setTemplates(tmplData);
      setLeads(leadData);
    } catch {
      toast.error("Failed to load data");
    }
  }

  async function handleCreate() {
    if (!newForm.name || !newForm.subject || !newForm.body) {
      toast.error("All fields are required");
      return;
    }
    try {
      await api.templates.create(newForm);
      toast.success("Template created!");
      setCreating(false);
      setNewForm({ name: "", subject: "", body: "" });
      load();
    } catch {
      toast.error("Failed to create template");
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    try {
      await api.templates.update(editing.id, { name: editing.name, subject: editing.subject, body: editing.body });
      toast.success("Template saved");
      setEditing(null);
      setSelected(editing);
      load();
    } catch {
      toast.error("Failed to update template");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await api.templates.delete(id);
      toast.success("Template deleted");
      if (selected?.id === id) setSelected(null);
      load();
    } catch {
      toast.error("Failed to delete template");
    }
  }

  async function handleApply() {
    if (!selected || selectedLeadIds.length === 0) return;
    setApplying(true);
    try {
      const res = await api.templates.apply(selected.id, selectedLeadIds);
      toast.success(`Template applied to ${res.applied} lead(s)! Check the Generation Queue to review & send.`);
      setSelectedLeadIds([]);
      setApplyOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to apply template");
    } finally {
      setApplying(false);
    }
  }

  function toggleLead(id: string) {
    setSelectedLeadIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleAllLeads() {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(l => l.id));
    }
  }

  const previewSubject = (tmpl: Template, lead?: Lead) =>
    tmpl.subject
      .replace("{{contact_name}}", lead?.contact_name || "{{contact_name}}")
      .replace("{{org_name}}", lead?.org_name || "{{org_name}}");

  const previewBody = (tmpl: Template, lead?: Lead) =>
    tmpl.body
      .replace("{{contact_name}}", lead?.contact_name || "{{contact_name}}")
      .replace("{{org_name}}", lead?.org_name || "{{org_name}}");

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── LEFT PANEL: template list ── */}
      <div className="w-72 border-r bg-card flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-sm">Email Templates ({templates.length})</h2>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(true); setSelected(null); setEditing(null); setApplyOpen(false); }}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {templates.map(t => (
            <div
              key={t.id}
              onClick={() => { setSelected(t); setEditing(null); setCreating(false); setApplyOpen(false); setSelectedLeadIds([]); }}
              className={`p-4 border-b cursor-pointer hover:bg-accent/50 group transition-colors ${selected?.id === t.id ? "bg-accent border-l-4 border-l-primary" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm truncate">{t.name}</div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setEditing({ ...t }); setSelected(t); setCreating(false); setApplyOpen(false); }}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                    className="p-1 rounded hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</div>
            </div>
          ))}

          {templates.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No templates yet.<br />
              <button onClick={() => setCreating(true)} className="mt-2 text-primary underline underline-offset-2">Create your first →</button>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 p-8 bg-muted/20 overflow-y-auto">

        {/* Create form */}
        {creating && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold">New Template</h2>
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Template Name</label>
                  <Input placeholder="e.g. University Outreach" value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Subject Line</label>
                  <Input placeholder="e.g. Quick question for {{contact_name}}" value={newForm.subject} onChange={e => setNewForm(p => ({ ...p, subject: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Body</label>
                  <Textarea
                    className="min-h-[240px] resize-y font-mono text-sm"
                    placeholder={"Hi {{contact_name}},\n\nI noticed that {{org_name}} might benefit from..."}
                    value={newForm.body}
                    onChange={e => setNewForm(p => ({ ...p, body: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Use <code className="mx-1 px-1 bg-background rounded">{"{{contact_name}}"}</code> and <code className="mx-1 px-1 bg-background rounded">{"{{org_name}}"}</code> as placeholders — they will be swapped per lead when applied.
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreating(false)}><X className="w-4 h-4 mr-1" /> Cancel</Button>
                  <Button onClick={handleCreate}><Check className="w-4 h-4 mr-1" /> Create Template</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Edit form */}
        {editing && !creating && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold">Edit Template</h2>
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Template Name</label>
                  <Input value={editing.name} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Subject Line</label>
                  <Input value={editing.subject} onChange={e => setEditing(p => p ? { ...p, subject: e.target.value } : p)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Body</label>
                  <Textarea
                    className="min-h-[240px] resize-y font-mono text-sm"
                    value={editing.body}
                    onChange={e => setEditing(p => p ? { ...p, body: e.target.value } : p)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditing(null)}><X className="w-4 h-4 mr-1" /> Cancel</Button>
                  <Button onClick={handleUpdate}><Check className="w-4 h-4 mr-1" /> Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Template view + apply panel */}
        {selected && !editing && !creating && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">{selected.name}</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...selected }); setApplyOpen(false); }}>
                  <Edit2 className="w-4 h-4 mr-1.5" /> Edit
                </Button>
                <Button size="sm" onClick={() => setApplyOpen(o => !o)} className="bg-green-600 hover:bg-green-700">
                  <Send className="w-4 h-4 mr-1.5" />
                  {applyOpen ? "Hide Lead Selector" : "Apply to Leads"}
                  <ChevronRight className={`w-4 h-4 ml-1 transition-transform ${applyOpen ? "rotate-90" : ""}`} />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Preview pane */}
              <Card>
                <CardHeader><CardTitle className="text-base">Template Preview</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Subject</div>
                    <div className="font-medium text-sm bg-muted/50 rounded px-3 py-2">{previewSubject(selected)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Body</div>
                    <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded px-3 py-3 min-h-[160px] font-mono leading-relaxed">{previewBody(selected)}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Apply / lead selector pane */}
              {applyOpen && (
                <Card className="border-primary/40">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Select Leads to Apply To</CardTitle>
                      <button onClick={toggleAllLeads} className="text-xs text-primary underline underline-offset-2">
                        {selectedLeadIds.length === leads.length ? "Deselect All" : "Select All"}
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[360px] overflow-y-auto pr-2">
                    {leads.map(lead => (
                      <div
                        key={lead.id}
                        onClick={() => toggleLead(lead.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedLeadIds.includes(lead.id) ? "bg-primary/10 border-primary/40" : "hover:bg-accent/50"}`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selectedLeadIds.includes(lead.id) ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                          {selectedLeadIds.includes(lead.id) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{lead.contact_name || lead.email}</div>
                          <div className="text-xs text-muted-foreground truncate">{lead.org_name} · {lead.email}</div>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{lead.status}</Badge>
                      </div>
                    ))}
                    {leads.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No leads found</div>}
                  </CardContent>
                  <div className="px-6 pb-5 pt-2 border-t">
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700"
                      disabled={selectedLeadIds.length === 0 || applying}
                      onClick={handleApply}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {applying ? "Applying…" : `Apply to ${selectedLeadIds.length} lead${selectedLeadIds.length !== 1 ? "s" : ""}`}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Emails will appear in the <strong>Generation Queue</strong> for review before sending.
                    </p>
                  </div>
                </Card>
              )}
            </div>

            {/* Live preview with first lead */}
            {leads.length > 0 && (
              <Card className="border-dashed">
                <CardHeader><CardTitle className="text-sm text-muted-foreground">Live Preview (using first lead: {leads[0].contact_name})</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm font-semibold">{previewSubject(selected, leads[0])}</div>
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed">{previewBody(selected, leads[0])}</div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Empty state */}
        {!selected && !creating && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
            <div className="text-5xl">📝</div>
            <div className="text-center">
              <div className="font-semibold text-lg text-foreground">No template selected</div>
              <div className="text-sm mt-1">Pick a template from the left, or create a new one.</div>
            </div>
            <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" /> New Template</Button>
          </div>
        )}
      </div>
    </div>
  );
}
