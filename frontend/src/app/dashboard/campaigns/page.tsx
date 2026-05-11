"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await api.campaigns.list();
      setCampaigns(data);
    } catch {
      toast.error("Failed to load campaigns");
    }
  }

  async function create() {
    if (!newName) return;
    try {
      await api.campaigns.create({ name: newName });
      setNewName("");
      toast.success("Campaign created");
      load();
    } catch {
      toast.error("Failed to create campaign");
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Campaigns</h1>
        <div className="flex gap-2">
          <Input 
            placeholder="New campaign name" 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
          />
          <Button onClick={create}>Create</Button>
        </div>
      </div>
      
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Replies</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.status}</TableCell>
                <TableCell>{c.total_leads}</TableCell>
                <TableCell>{c.emails_sent}</TableCell>
                <TableCell>{c.replies_received}</TableCell>
                <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">No campaigns found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
