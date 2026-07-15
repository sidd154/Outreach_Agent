"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileUp, Play, Trash2, LayoutTemplate, ChevronDown, Sparkles, X } from "lucide-react";
import { Label } from "@/components/ui/label";

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [openTemplateMenu, setOpenTemplateMenu] = useState<string | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-template-menu]")) {
        setOpenTemplateMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function load() {
    try {
      const [leadData, tmplData] = await Promise.all([api.leads.list(), api.templates.list()]);
      setLeads(leadData);
      setTemplates(tmplData);
    } catch {
      toast.error("Failed to load data");
    }
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await api.leads.importCsv(file);
      if (res.imported === 0) {
        toast.warning(`Imported 0 leads. Please check that your CSV columns contain 'email' and 'website' headers.`);
      } else {
        toast.success(`Imported ${res.imported} leads. Skipped ${res.skipped_duplicates} duplicates.`);
      }
      load();
    } catch (err: any) {
      toast.error(err.message || "Import failed. Please check file format.");
    }
    // reset input so same file can be re-imported
    e.target.value = "";
  }

  async function generateForLead(id: string) {
    try {
      await api.generate.forLead(id, 1);
      toast.success("AI generation started — check Generation Queue shortly.");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    }
  }

  async function applyTemplate(templateId: string, leadId: string, templateName: string) {
    setApplyingTemplate(leadId);
    setOpenTemplateMenu(null);
    try {
      await api.templates.apply(templateId, [leadId]);
      toast.success(`"${templateName}" applied — check Generation Queue to review & send.`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to apply template");
    } finally {
      setApplyingTemplate(null);
    }
  }

  async function deleteLead(id: string, name: string) {
    if (!confirm(`Delete lead "${name}"? This cannot be undone.`)) return;
    try {
      await api.leads.delete(id);
      toast.success("Lead deleted");
      load();
    } catch {
      toast.error("Failed to delete lead");
    }
  }

  async function handlePurge() {
    if (!window.confirm("Wipe ALL leads? This cannot be undone.")) return;
    try {
      await api.leads.purge();
      toast.success("Database wiped");
      load();
    } catch {
      toast.error("Failed to reset database");
    }
  }

  const actionable = (status: string) => status === "new" || status === "rejected";

  async function generateForAll() {
    const actionableLeads = leads.filter(l => actionable(l.status)).map(l => l.id);
    if (actionableLeads.length === 0) {
      toast.info("No leads available for generation");
      return;
    }
    if (!confirm(`Are you sure you want to trigger AI generation for ${actionableLeads.length} leads?`)) return;
    
    try {
      await api.generate.batch({ lead_ids: actionableLeads, variations: 1 });
      toast.success(`Bulk AI generation started for ${actionableLeads.length} leads!`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to start bulk generation");
    }
  }

  async function applyTemplateToAll(templateId: string, templateName: string) {
    const actionableLeads = leads.filter(l => actionable(l.status)).map(l => l.id);
    setOpenTemplateMenu(null);
    if (actionableLeads.length === 0) {
      toast.info("No leads available for templating");
      return;
    }
    if (!confirm(`Are you sure you want to apply "${templateName}" to ${actionableLeads.length} leads?`)) return;

    try {
      await api.templates.apply(templateId, actionableLeads);
      toast.success(`"${templateName}" applied to ${actionableLeads.length} leads!`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to apply template in bulk");
    }
  }


  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Leads Database</h1>
        <div className="flex items-center gap-3">
          {templates.length > 0 && (
            <div className="relative inline-block" data-template-menu>
              <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50" onClick={() => setOpenTemplateMenu("global")}>
                <LayoutTemplate className="w-4 h-4 mr-2" /> Template All
              </Button>
              {openTemplateMenu === "global" && (
                <div data-template-menu className="absolute z-50 right-0 mt-1 min-w-[220px] bg-popover border rounded-lg shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/50">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Template all actionable leads</p>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => applyTemplateToAll(t.id, t.name)} className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors">
                        <div className="text-sm font-medium">{t.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={generateForAll}>
            <Sparkles className="w-4 h-4 mr-2" /> Generate All
          </Button>
          <Button variant="destructive" size="sm" onClick={handlePurge}>
            <Trash2 className="w-4 h-4 mr-2" /> Reset All
          </Button>
          <Label htmlFor="csv-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-md font-medium text-sm transition-colors">
              <FileUp className="w-4 h-4" />
              Import CSV
            </div>
          </Label>
          <input id="csv-upload" type="file" accept=".csv" className="hidden" onChange={importCsv} />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              {/* Two clearly labelled action columns */}
              <TableHead className="text-center w-44">
                <div className="flex items-center justify-center gap-1.5 text-blue-600">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Generate
                </div>
              </TableHead>
              <TableHead className="text-center w-52">
                <div className="flex items-center justify-center gap-1.5 text-violet-600">
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  Use Template
                </div>
              </TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map(l => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.contact_name || "—"}</TableCell>
                <TableCell>{l.org_name || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{l.status}</Badge>
                </TableCell>

                {/* ── AI Generate ── */}
                <TableCell className="text-center">
                  {actionable(l.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 text-xs"
                      onClick={() => generateForLead(l.id)}
                    >
                      <Play className="w-3.5 h-3.5 mr-1.5" />
                      Generate
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </TableCell>

                {/* ── Use Template ── */}
                <TableCell className="text-center">
                  {actionable(l.status) ? (
                    templates.length > 0 ? (
                      <div className="relative inline-block" data-template-menu>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400 text-xs"
                          disabled={applyingTemplate === l.id}
                          onClick={() => setOpenTemplateMenu(openTemplateMenu === l.id ? null : l.id)}
                        >
                          <LayoutTemplate className="w-3.5 h-3.5 mr-1.5" />
                          {applyingTemplate === l.id ? "Applying…" : "Pick Template"}
                          <ChevronDown className="w-3 h-3 ml-1.5 opacity-60" />
                        </Button>

                        {/* Dropdown menu */}
                        {openTemplateMenu === l.id && (
                          <div
                            data-template-menu
                            className="absolute z-50 right-0 mt-1 min-w-[220px] bg-popover border rounded-lg shadow-lg overflow-hidden"
                          >
                            <div className="px-3 py-2 border-b bg-muted/50">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Choose a template</p>
                            </div>
                            <div className="max-h-56 overflow-y-auto">
                              {templates.map(t => (
                                <button
                                  key={t.id}
                                  onClick={() => applyTemplate(t.id, l.id, t.name)}
                                  className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors"
                                >
                                  <div className="text-sm font-medium">{t.name}</div>
                                  <div className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/60 italic">No templates</span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </TableCell>

                {/* ── Delete ── */}
                <TableCell>
                  <button
                    onClick={() => deleteLead(l.id, l.contact_name || l.email)}
                    className="p-1.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete lead"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No leads yet — import a CSV to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
