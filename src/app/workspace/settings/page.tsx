"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2, Upload, Globe } from "lucide-react";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";

const TABS = ["knowledge", "brand", "agents", "permissions", "spend", "communication"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  knowledge: "Business Knowledge",
  brand: "Brand",
  agents: "Agent Configuration",
  permissions: "Permission Center",
  spend: "Spend Controls",
  communication: "Communication Safety",
};

export default function SettingsPage() {
  const user = useRequireAuth();
  const [tab, setTab] = useState<Tab>("knowledge");
  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/workspace" className="inline-flex items-center gap-2 text-sm text-kwacha-gray-400 mb-7">
          <ArrowLeft size={15} /> Workspace
        </Link>
        <div className="mb-7">
          <div className="text-xs uppercase tracking-[.22em] gold-text">Settings</div>
          <h1 className="text-2xl font-semibold mt-1">Teach and configure your AI workforce</h1>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 border-b border-kwacha-gray-800 pb-3">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm px-3 py-1.5 rounded-full ${tab === t ? "bg-kwacha-gold text-black font-semibold" : "text-kwacha-gray-400 border border-kwacha-gray-800"}`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === "knowledge" && <KnowledgeTab />}
        {tab === "brand" && <BrandTab />}
        {tab === "agents" && <AgentsTab />}
        {tab === "permissions" && <PermissionsTab />}
        {tab === "spend" && <SpendTab />}
        {tab === "communication" && <CommunicationTab />}
      </div>
    </main>
  );
}

/* ---------------------------- Knowledge tab ---------------------------- */

const CATEGORIES = ["about", "products", "services", "prices", "faqs", "policies", "hours", "locations", "delivery", "refund", "contact", "promotions", "brand_voice", "other"];

function KnowledgeTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState({ category: "about", title: "", content: "" });
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileCategory, setFileCategory] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    authedFetch("/api/knowledge")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manual.title || !manual.content) return;
    setSaving(true);
    setError("");
    try {
      const res = await authedFetch("/api/knowledge", { method: "POST", body: JSON.stringify(manual) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setManual({ category: "about", title: "", content: "" });
      load();
    } catch (e: any) {
      setError(e.message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  async function importWebsite(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setImporting(true);
    setError("");
    try {
      const res = await authedFetch("/api/knowledge/website-import", { method: "POST", body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUrl("");
      load();
    } catch (e: any) {
      setError(e.message || "Unable to import that website.");
    } finally {
      setImporting(false);
    }
  }

  async function uploadDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", fileCategory);
      const res = await authedFetch("/api/knowledge/document-upload", { method: "POST", body: form as any });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFile(null);
      load();
    } catch (e: any) {
      setError(e.message || "Unable to process that document.");
    } finally {
      setUploading(false);
    }
  }

  async function approve(id: string) {
    await authedFetch(`/api/knowledge/${id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
    load();
  }
  async function remove(id: string) {
    await authedFetch(`/api/knowledge/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      {error && <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}

      <section className="kwacha-card p-5">
        <h2 className="text-sm font-medium mb-3">Import your website</h2>
        <form onSubmit={importWebsite} className="flex gap-2">
          <input className="kwacha-input flex-1" placeholder="https://yourbusiness.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button disabled={importing} className="kwacha-btn-primary flex items-center gap-2 whitespace-nowrap">
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />} Import
          </button>
        </form>
        <p className="text-xs text-kwacha-gray-500 mt-2">Imports one page at a time for review — not a full site crawl.</p>
      </section>

      <section className="kwacha-card p-5">
        <h2 className="text-sm font-medium mb-3">Upload a document</h2>
        <form onSubmit={uploadDoc} className="flex flex-wrap gap-2 items-center">
          <input type="file" accept=".txt,.csv,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm text-kwacha-gray-300" />
          <select className="kwacha-input" value={fileCategory} onChange={(e) => setFileCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button disabled={uploading || !file} className="kwacha-btn-primary flex items-center gap-2">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
          </button>
        </form>
        <p className="text-xs text-kwacha-gray-500 mt-2">Supported: .txt, .csv, .docx. PDF isn't supported yet — paste content manually below instead.</p>
      </section>

      <section className="kwacha-card p-5">
        <h2 className="text-sm font-medium mb-3">Add information manually</h2>
        <form onSubmit={addManual} className="space-y-2">
          <div className="flex gap-2">
            <select className="kwacha-input" value={manual.category} onChange={(e) => setManual((m) => ({ ...m, category: e.target.value }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="kwacha-input flex-1" placeholder="Title" value={manual.title} onChange={(e) => setManual((m) => ({ ...m, title: e.target.value }))} />
          </div>
          <textarea className="kwacha-input w-full" placeholder="Content" rows={3} value={manual.content} onChange={(e) => setManual((m) => ({ ...m, content: e.target.value }))} />
          <button disabled={saving} className="kwacha-btn-primary">{saving ? "Saving…" : "Add"}</button>
        </form>
      </section>

      <section className="kwacha-card p-5">
        <h2 className="text-sm font-medium mb-3">Knowledge base ({items.length})</h2>
        {loading ? (
          <p className="text-sm text-kwacha-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-kwacha-gray-500">Nothing added yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="border border-kwacha-gray-800 p-3 flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-kwacha-gray-500 mb-1">{item.category} · {item.source}{item.status === "pending_review" ? " · pending review" : ""}</div>
                  <div className="text-xs text-kwacha-gray-400 line-clamp-2">{item.content}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {item.status === "pending_review" && (
                    <button onClick={() => approve(item.id)} className="text-xs text-emerald-400 border border-emerald-900 px-2 py-1">Approve</button>
                  )}
                  <button onClick={() => remove(item.id)} className="text-xs text-red-400 border border-red-900 px-2 py-1"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------ Brand tab ------------------------------ */

function BrandTab() {
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authedFetch("/api/brand").then((r) => r.json()).then((d) => setProfile(d.profile));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await authedFetch("/api/brand", { method: "PATCH", body: JSON.stringify(profile) });
      const data = await res.json();
      setProfile(data.profile);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-sm text-kwacha-gray-500">Loading…</p>;

  return (
    <section className="kwacha-card p-5 space-y-3">
      <p className="text-xs text-kwacha-gray-500 mb-2">This controls the Content and Communication agents' actual writing style — it's fed into their real instructions, not just stored.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <input className="kwacha-input" placeholder="Brand name" value={profile.brandName || ""} onChange={(e) => setProfile({ ...profile, brandName: e.target.value })} />
        <input className="kwacha-input" placeholder="Tone (e.g. Professional but friendly)" value={profile.tone || ""} onChange={(e) => setProfile({ ...profile, tone: e.target.value })} />
        <input className="kwacha-input" placeholder="Language" value={profile.language || ""} onChange={(e) => setProfile({ ...profile, language: e.target.value })} />
        <select className="kwacha-input" value={profile.style} onChange={(e) => setProfile({ ...profile, style: e.target.value })}>
          <option value="short_and_clear">Short and clear</option>
          <option value="detailed">Detailed</option>
          <option value="formal">Formal</option>
          <option value="casual">Casual</option>
        </select>
        <select className="kwacha-input" value={profile.emojiPreference} onChange={(e) => setProfile({ ...profile, emojiPreference: e.target.value })}>
          <option value="none">No emoji</option>
          <option value="minimal">Minimal emoji</option>
          <option value="frequent">Frequent emoji</option>
        </select>
        <input className="kwacha-input" placeholder="Call-to-action style" value={profile.ctaStyle || ""} onChange={(e) => setProfile({ ...profile, ctaStyle: e.target.value })} />
      </div>
      <textarea className="kwacha-input w-full" placeholder="Words to use (comma-separated)" value={profile.wordsToUse || ""} onChange={(e) => setProfile({ ...profile, wordsToUse: e.target.value })} />
      <textarea className="kwacha-input w-full" placeholder="Words to avoid (comma-separated)" value={profile.wordsToAvoid || ""} onChange={(e) => setProfile({ ...profile, wordsToAvoid: e.target.value })} />
      <button onClick={save} disabled={saving} className="kwacha-btn-primary">{saving ? "Saving…" : "Save brand profile"}</button>
    </section>
  );
}

/* ------------------------------ Agents tab ------------------------------ */

const AGENT_FIELDS: Record<string, { key: string; label: string; type: "text" | "checkbox" | "select"; options?: string[] }[]> = {
  research: [
    { key: "researchTopics", label: "Research topics", type: "text" },
    { key: "approvedSources", label: "Approved sources", type: "text" },
    { key: "researchFrequency", label: "Research frequency", type: "select", options: ["daily", "weekly", "monthly", "on_demand"] },
    { key: "reportFormat", label: "Report format", type: "select", options: ["brief", "detailed"] },
  ],
  content: [
    { key: "contentTypes", label: "Content types", type: "text" },
    { key: "postingFrequency", label: "Posting frequency", type: "select", options: ["daily", "weekly", "monthly", "on_demand"] },
    { key: "platforms", label: "Platforms", type: "text" },
    { key: "approvalRequired", label: "Approval required before publishing", type: "checkbox" },
  ],
  communication: [
    { key: "channels", label: "Channels", type: "text" },
    { key: "responseStyle", label: "Response style", type: "text" },
    { key: "businessHours", label: "Business hours", type: "text" },
    { key: "escalationRules", label: "Escalation rules", type: "text" },
    { key: "humanHandoff", label: "Allow human handoff", type: "checkbox" },
  ],
  marketing: [
    { key: "marketingGoals", label: "Marketing goals", type: "text" },
    { key: "targetAudience", label: "Target audience", type: "text" },
    { key: "campaignBudgetLimits", label: "Campaign budget limit (guidance only — Spend Controls enforces the real cap)", type: "text" },
    { key: "approvalRules", label: "Approval rules", type: "text" },
  ],
  crm: [
    { key: "leadStages", label: "Lead stages", type: "text" },
    { key: "assignmentRules", label: "Assignment rules", type: "text" },
    { key: "requiredFields", label: "Required fields", type: "text" },
    { key: "followUpRules", label: "Follow-up rules", type: "text" },
  ],
  analytics: [
    { key: "metrics", label: "Metrics", type: "text" },
    { key: "reportFrequency", label: "Report frequency", type: "select", options: ["daily", "weekly", "monthly"] },
    { key: "recipients", label: "Recipients", type: "text" },
    { key: "alertThresholds", label: "Alert thresholds", type: "text" },
  ],
};

function AgentsTab() {
  const [openAgent, setOpenAgent] = useState<string | null>("research");
  return (
    <div className="space-y-3">
      <p className="text-xs text-kwacha-gray-500">These preferences are fed into each agent's real instructions. Hard limits (spend caps, publishing/messaging approval) live under Spend Controls and Permission Center — this tab is guidance, not a hard block.</p>
      {Object.keys(AGENT_FIELDS).map((key) => (
        <AgentConfigCard key={key} agentKey={key} open={openAgent === key} onToggle={() => setOpenAgent(openAgent === key ? null : key)} />
      ))}
    </div>
  );
}

function AgentConfigCard({ agentKey, open, onToggle }: { agentKey: string; open: boolean; onToggle: () => void }) {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    authedFetch(`/api/settings/agents/${agentKey}`).then((r) => r.json()).then((d) => { setSettings(d.settings || {}); setLoaded(true); });
  }, [open, loaded, agentKey]);

  async function save() {
    setSaving(true);
    try {
      await authedFetch(`/api/settings/agents/${agentKey}`, { method: "PATCH", body: JSON.stringify(settings) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="kwacha-card">
      <button onClick={onToggle} className="w-full text-left p-4 text-sm font-medium capitalize">{agentKey} Agent</button>
      {open && (
        <div className="p-4 pt-0 space-y-2">
          {AGENT_FIELDS[agentKey].map((f) => (
            <div key={f.key}>
              {f.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm text-kwacha-gray-300">
                  <input type="checkbox" checked={Boolean(settings[f.key])} onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.checked }))} />
                  {f.label}
                </label>
              ) : f.type === "select" ? (
                <div>
                  <label className="text-xs text-kwacha-gray-500 block mb-1">{f.label}</label>
                  <select className="kwacha-input" value={settings[f.key] || ""} onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}>
                    <option value="">—</option>
                    {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-kwacha-gray-500 block mb-1">{f.label}</label>
                  <input className="kwacha-input w-full" value={settings[f.key] || ""} onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))} />
                </div>
              )}
            </div>
          ))}
          <button onClick={save} disabled={saving} className="kwacha-btn-primary text-sm mt-2">{saving ? "Saving…" : "Save"}</button>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Permissions tab --------------------------- */

function PermissionsTab() {
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    authedFetch("/api/settings/permissions").then((r) => r.json()).then((d) => setTools(d.tools || [])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setMode(toolKey: string, mode: string) {
    await authedFetch("/api/settings/permissions", { method: "PATCH", body: JSON.stringify({ toolKey, mode: mode || null }) });
    load();
  }

  if (loading) return <p className="text-sm text-kwacha-gray-500">Loading…</p>;

  return (
    <section className="kwacha-card p-5">
      <p className="text-xs text-kwacha-gray-500 mb-4">What can your AI do automatically, what needs your approval, and what's blocked entirely. sendWhatsAppMessage and campaign spend tools are also shaped by Communication Safety and Spend Controls.</p>
      <div className="space-y-2">
        {tools.map((t) => (
          <div key={t.toolKey} className="flex items-center justify-between gap-3 border-b border-kwacha-gray-800 pb-2">
            <div className="min-w-0">
              <div className="text-sm font-mono">{t.toolKey}</div>
              <div className="text-xs text-kwacha-gray-500">{t.description}</div>
            </div>
            <select className="kwacha-input flex-shrink-0" value={t.mode} onChange={(e) => setMode(t.toolKey, e.target.value)}>
              <option value="auto">Automatic</option>
              <option value="approval">Needs approval</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Spend tab ------------------------------ */

function SpendTab() {
  const [controls, setControls] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authedFetch("/api/settings/spend-controls").then((r) => r.json()).then((d) => setControls(d.controls));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await authedFetch("/api/settings/spend-controls", { method: "PATCH", body: JSON.stringify(controls) });
      const data = await res.json();
      setControls(data.controls);
    } finally {
      setSaving(false);
    }
  }

  if (!controls) return <p className="text-sm text-kwacha-gray-500">Loading…</p>;

  return (
    <section className="kwacha-card p-5 space-y-3">
      <p className="text-xs text-kwacha-gray-500 mb-2">Enforced for real before any simulated campaign spend — exceeding these caps blocks the action outright, not just a warning.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-kwacha-gray-500 block mb-1">Maximum daily advertising spend ($)</label>
          <input type="number" className="kwacha-input w-full" value={controls.maxDailySpend} onChange={(e) => setControls({ ...controls, maxDailySpend: Number(e.target.value) })} />
        </div>
        <div>
          <label className="text-xs text-kwacha-gray-500 block mb-1">Maximum campaign spend ($)</label>
          <input type="number" className="kwacha-input w-full" value={controls.maxCampaignSpend} onChange={(e) => setControls({ ...controls, maxCampaignSpend: Number(e.target.value) })} />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        {[
          ["requireApprovalNewCampaign", "Require approval before a new campaign"],
          ["requireApprovalBudgetIncrease", "Require approval before a budget increase"],
          ["requireApprovalNewAudience", "Require approval before a new audience"],
          ["requireApprovalCampaignRestart", "Require approval before a campaign restart"],
          ["allowAutoOptimizationWithinBudget", "Allow automatic optimization within budget"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-kwacha-gray-300">
            <input type="checkbox" checked={Boolean(controls[key])} onChange={(e) => setControls({ ...controls, [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      <button onClick={save} disabled={saving} className="kwacha-btn-primary">{saving ? "Saving…" : "Save spend controls"}</button>
    </section>
  );
}

/* --------------------------- Communication tab --------------------------- */

function CommunicationTab() {
  const [policy, setPolicy] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authedFetch("/api/settings/communication-policy").then((r) => r.json()).then((d) => setPolicy(d.policy));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await authedFetch("/api/settings/communication-policy", { method: "PATCH", body: JSON.stringify(policy) });
      const data = await res.json();
      setPolicy(data.policy);
    } finally {
      setSaving(false);
    }
  }

  if (!policy) return <p className="text-sm text-kwacha-gray-500">Loading…</p>;

  const MODES = [
    ["draft_only", "Draft replies only"],
    ["auto_simple", "Automatically answer simple questions"],
    ["auto_simple_and_qualify", "Automatically answer + qualify leads"],
    ["full_auto_with_escalation", "Full customer communication with human escalation"],
  ];

  return (
    <section className="kwacha-card p-5 space-y-4">
      <p className="text-xs text-kwacha-gray-500">This is enforced for real in front of the Communication Agent's WhatsApp sending — not just a label.</p>
      <div className="space-y-2">
        {MODES.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm text-kwacha-gray-300">
            <input type="radio" name="mode" checked={policy.mode === value} onChange={() => setPolicy({ ...policy, mode: value })} />
            {label}
          </label>
        ))}
      </div>
      <div className="space-y-2 pt-2 border-t border-kwacha-gray-800">
        <div className="text-xs text-kwacha-gray-500 uppercase tracking-wider mb-1">Always escalate to a human</div>
        {[
          ["escalateComplex", "Complex questions"],
          ["escalateRefund", "Refund requests"],
          ["escalateLegal", "Legal questions"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-kwacha-gray-300">
            <input type="checkbox" checked={Boolean(policy[key])} onChange={(e) => setPolicy({ ...policy, [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      <input className="kwacha-input w-full" placeholder="Business hours (e.g. Mon-Fri 8am-5pm CAT)" value={policy.businessHours || ""} onChange={(e) => setPolicy({ ...policy, businessHours: e.target.value })} />
      <button onClick={save} disabled={saving} className="kwacha-btn-primary">{saving ? "Saving…" : "Save communication policy"}</button>
    </section>
  );
}
