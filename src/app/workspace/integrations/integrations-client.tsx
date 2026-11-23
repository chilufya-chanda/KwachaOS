"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Link2,
  Loader2,
  Unlink,
  XCircle,
} from "lucide-react";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";

type IntegrationRow = {
  key: string;
  label: string;
  kind: "oauth" | "manual";
  status: string;
  configured?: boolean;
  note?: string;
  externalAccountName?: string | null;
  connectedAt?: string | null;
  hasContext?: boolean;
};

const PURPOSE_OPTIONS: { key: string; label: string }[] = [
  { key: "marketing", label: "Marketing" },
  { key: "organicSocial", label: "Organic social publishing" },
  { key: "customerComms", label: "Customer communication" },
  { key: "leadGen", label: "Lead generation" },
  { key: "paidAds", label: "Paid advertising" },
  { key: "customerSupport", label: "Customer support" },
  { key: "brandOnly", label: "Brand presence only" },
];

export default function IntegrationsPage() {
  const user = useRequireAuth();
  const router = useRouter();

  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingKey, setConnectingKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [contextProvider, setContextProvider] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;

    setLoading(true);

    authedFetch("/api/integrations")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load integrations.");
        }

        return response.json();
      })
      .then((data) => {
        setIntegrations(data.integrations || []);
      })
      .catch((error) => {
        console.error("Failed to load integrations:", error);

        setBanner({
          type: "error",
          text: error.message || "Unable to load integrations.",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Handle the redirect back from an OAuth callback.
   *
   * We intentionally use window.location.search instead of
   * useSearchParams(). This prevents Next.js from attempting to
   * prerender useSearchParams() and failing the production build.
   */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);

    const connected = params.get("connected");
    const error = params.get("error");
    const providerWithError = params.get("provider");

    if (connected) {
      setBanner({
        type: "success",
        text: "Connected successfully.",
      });

      setContextProvider(connected);

      router.replace("/workspace/integrations");
    } else if (error) {
      setBanner({
        type: "error",
        text: `Couldn't connect${
          providerWithError ? ` ${providerWithError}` : ""
        }: ${error}`,
      });

      router.replace("/workspace/integrations");
    }
  }, [router]);

  const oauthRows = useMemo(
    () => integrations.filter((integration) => integration.kind === "oauth"),
    [integrations]
  );

  const manualRows = useMemo(
    () => integrations.filter((integration) => integration.kind === "manual"),
    [integrations]
  );

  async function connect(key: string) {
    setConnectingKey(key);
    setBanner(null);

    try {
      const response = await authedFetch(
        `/api/integrations/${key}/connect`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to start the connection."
        );
      }

      if (!data.authUrl) {
        throw new Error(
          "The integration did not return an authorization URL."
        );
      }

      window.location.href = data.authUrl;
    } catch (error: any) {
      console.error("Integration connection error:", error);

      setBanner({
        type: "error",
        text:
          error?.message ||
          "Unable to start the connection.",
      });

      setConnectingKey(null);
    }
  }

  async function disconnect(key: string) {
    setConnectingKey(key);
    setBanner(null);

    try {
      const response = await authedFetch(
        `/api/integrations/${key}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        throw new Error(
          data?.error || "Unable to disconnect the integration."
        );
      }

      load();
    } catch (error: any) {
      console.error("Integration disconnect error:", error);

      setBanner({
        type: "error",
        text:
          error?.message ||
          "Unable to disconnect the integration.",
      });
    } finally {
      setConnectingKey(null);
    }
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/workspace"
          className="inline-flex items-center gap-2 text-sm text-kwacha-gray-400 mb-7"
        >
          <ArrowLeft size={15} />
          Workspace
        </Link>

        <div className="mb-7">
          <div className="text-xs uppercase tracking-[.22em] gold-text">
            Integrations
          </div>

          <h1 className="text-3xl font-semibold mt-2">
            Connect the tools your business already uses
          </h1>

          <p className="text-sm text-kwacha-gray-400 mt-2 max-w-2xl">
            Kwacha never asks for your platform password. Connecting an
            account uses that platform&apos;s own sign-in (OAuth) —
            Kwacha only ever receives a permission-scoped token,
            stored encrypted.
          </p>
        </div>

        {banner && (
          <div
            className={`mb-6 border p-3 text-sm flex items-center gap-2 ${
              banner.type === "success"
                ? "border-emerald-900 bg-emerald-950/30 text-emerald-300"
                : "border-red-900 bg-red-950/30 text-red-300"
            }`}
          >
            {banner.type === "success" ? (
              <CheckCircle2 size={15} />
            ) : (
              <XCircle size={15} />
            )}

            {banner.text}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-kwacha-gray-500">
            Loading…
          </p>
        ) : (
          <>
            <section className="kwacha-card p-5 mb-6">
              <h2 className="text-sm uppercase tracking-wider text-kwacha-gray-400 mb-4">
                Platforms
              </h2>

              <div className="grid md:grid-cols-2 gap-3">
                {oauthRows.map((row) => (
                  <div
                    key={row.key}
                    className="border border-kwacha-gray-800 p-4 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {row.label}

                        {row.status === "connected" && (
                          <CheckCircle2
                            size={14}
                            className="text-emerald-400"
                          />
                        )}

                        {row.status === "error" && (
                          <XCircle
                            size={14}
                            className="text-red-400"
                          />
                        )}
                      </div>

                      <div className="text-xs text-kwacha-gray-500 mt-1">
                        {row.status === "connected" &&
                        row.externalAccountName
                          ? `Connected as ${row.externalAccountName}`
                          : null}

                        {row.status === "connected" &&
                        !row.externalAccountName
                          ? "Connected"
                          : null}

                        {row.status === "disconnected" &&
                        !row.configured
                          ? "Not configured yet"
                          : null}

                        {row.status === "disconnected" &&
                        row.configured
                          ? "Not connected"
                          : null}

                        {row.status === "error"
                          ? "Connection error — try reconnecting"
                          : null}
                      </div>

                      {row.status === "connected" &&
                        !row.hasContext && (
                          <button
                            className="text-xs text-kwacha-gold underline mt-1"
                            onClick={() =>
                              setContextProvider(row.key)
                            }
                          >
                            Add business context
                          </button>
                        )}
                    </div>

                    {row.status === "connected" ? (
                      <button
                        onClick={() => disconnect(row.key)}
                        disabled={
                          connectingKey === row.key
                        }
                        className="text-xs border border-kwacha-gray-700 px-3 py-2 flex items-center gap-1.5 hover:border-red-800 hover:text-red-300 disabled:opacity-50"
                      >
                        {connectingKey === row.key ? (
                          <Loader2
                            size={13}
                            className="animate-spin"
                          />
                        ) : (
                          <Unlink size={13} />
                        )}

                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connect(row.key)}
                        disabled={
                          !row.configured ||
                          connectingKey === row.key
                        }
                        title={
                          !row.configured
                            ? "Add API credentials to your environment first"
                            : undefined
                        }
                        className="text-xs bg-kwacha-gold text-black font-semibold px-3 py-2 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {connectingKey === row.key ? (
                          <Loader2
                            size={13}
                            className="animate-spin"
                          />
                        ) : (
                          <Link2 size={13} />
                        )}

                        Connect
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="kwacha-card p-5">
              <h2 className="text-sm uppercase tracking-wider text-kwacha-gray-400 mb-4">
                More integrations
              </h2>

              <div className="grid md:grid-cols-2 gap-3">
                {manualRows.map((row) => (
                  <div
                    key={row.key}
                    className="border border-kwacha-gray-800 p-4"
                  >
                    <div className="font-medium">
                      {row.label}
                    </div>

                    <div className="text-xs text-kwacha-gray-500 mt-1">
                      {row.note}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {contextProvider && (
          <ContextModal
            providerKey={contextProvider}
            label={
              integrations.find(
                (integration) =>
                  integration.key === contextProvider
              )?.label || contextProvider
            }
            onClose={() => setContextProvider(null)}
            onSaved={() => {
              setContextProvider(null);
              load();
            }}
          />
        )}
      </div>
    </main>
  );
}

function ContextModal({
  providerKey,
  label,
  onClose,
  onSaved,
}: {
  providerKey: string;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    businessName: "",
    industry: "",
    category: "",
    country: "",
    region: "",
    city: "",
    website: "",
    phone: "",
    email: "",
    description: "",
    products: "",
    targetCustomers: "",
    language: "",
    hours: "",
  });

  const [purposes, setPurposes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(
    key: K,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function togglePurpose(key: string) {
    setPurposes((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  async function save() {
    setSaving(true);
    setError("");

    try {
      const response = await authedFetch(
        `/api/integrations/${providerKey}/context`,
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            purposes,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to save business context."
        );
      }

      onSaved();
    } catch (error: any) {
      console.error(
        "Business context save error:",
        error
      );

      setError(
        error?.message ||
          "Unable to save business context."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="kwacha-card p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-1">
          Help Kwacha understand this {label} account
        </h3>

        <p className="text-sm text-kwacha-gray-400 mb-5">
          This attaches business context to the connection so
          agents personalize research, marketing, content and
          communication around it. You can edit this later in
          Settings → Business Profile.
        </p>

        {error && (
          <div className="mb-4 border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <input
            className="kwacha-input"
            placeholder="Business name"
            value={form.businessName}
            onChange={(event) =>
              set("businessName", event.target.value)
            }
          />

          <input
            className="kwacha-input"
            placeholder="Industry"
            value={form.industry}
            onChange={(event) =>
              set("industry", event.target.value)
            }
          />

          <input
            className="kwacha-input"
            placeholder="Business category"
            value={form.category}
            onChange={(event) =>
              set("category", event.target.value)
            }
          />

          <input
            className="kwacha-input"
            placeholder="Country"
            value={form.country}
            onChange={(event) =>
              set("country", event.target.value)
            }
          />

          <input
            className="kwacha-input"
            placeholder="Province / State"
            value={form.region}
            onChange={(event) =>
              set("region", event.target.value)
            }
          />

          <input
            className="kwacha-input"
            placeholder="City / Town"
            value={form.city}
            onChange={(event) =>
              set("city", event.target.value)
            }
          />

          <input
            className="kwacha-input"
            placeholder="Website"
            value={form.website}
            onChange={(event) =>
              set("website", event.target.value)
            }
          />

          <input
            className="kwacha-input"
            placeholder="Business phone"
            value={form.phone}
            onChange={(event) =>
              set("phone", event.target.value)
            }
          />

          <input
            className="kwacha-input"
            placeholder="Business email"
            value={form.email}
            onChange={(event) =>
              set("email", event.target.value)
            }
          />

          <input
            className="kwacha-input"
            placeholder="Preferred language"
            value={form.language}
            onChange={(event) =>
              set("language", event.target.value)
            }
          />

          <input
            className="kwacha-input md:col-span-2"
            placeholder="Business hours"
            value={form.hours}
            onChange={(event) =>
              set("hours", event.target.value)
            }
          />

          <input
            className="kwacha-input md:col-span-2"
            placeholder="Target customers"
            value={form.targetCustomers}
            onChange={(event) =>
              set(
                "targetCustomers",
                event.target.value
              )
            }
          />
        </div>

        <textarea
          className="kwacha-input w-full mb-3"
          placeholder="Short business description"
          value={form.description}
          onChange={(event) =>
            set("description", event.target.value)
          }
        />

        <textarea
          className="kwacha-input w-full mb-4"
          placeholder="Main products / services"
          value={form.products}
          onChange={(event) =>
            set("products", event.target.value)
          }
        />

        <div className="mb-5">
          <div className="text-xs uppercase tracking-wider text-kwacha-gray-500 mb-2">
            Account purpose
          </div>

          <div className="grid md:grid-cols-2 gap-2">
            {PURPOSE_OPTIONS.map((option) => (
              <label
                key={option.key}
                className="flex items-center gap-2 text-sm text-kwacha-gray-300"
              >
                <input
                  type="checkbox"
                  checked={purposes.includes(option.key)}
                  onChange={() =>
                    togglePurpose(option.key)
                  }
                />

                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm border border-kwacha-gray-700 px-4 py-2"
          >
            Skip for now
          </button>

          <button
            onClick={save}
            disabled={saving}
            className="text-sm bg-kwacha-gold text-black font-semibold px-4 py-2 disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : "Save business context"}
          </button>
        </div>
      </div>
    </div>
  );
}