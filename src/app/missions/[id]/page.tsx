"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";
import {
  ArrowLeft,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  Circle,
  History,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  XCircle,
  Loader2,
} from "lucide-react";

function statusClass(status: string) {
  if (status === "active") return "text-kwacha-gold";
  if (status === "completed") return "text-green-400";
  if (status === "failed") return "text-red-400";
  if (status === "paused") return "text-yellow-400";
  return "text-kwacha-gray-400";
}

function taskStatusClass(status: string) {
  if (status === "running") return "text-kwacha-gold";
  if (status === "done" || status === "completed") return "text-green-400";
  if (status === "failed") return "text-red-400";
  return "text-kwacha-gray-500";
}

export default function MissionControlPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [mission, setMission] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [heartbeatBusy, setHeartbeatBusy] = useState(false);

  const [decisions, setDecisions] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);

  const heartbeatRunning = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;

    try {
      const r = await authedFetch(`/api/missions/${params.id}`);
      const d = await r.json();

      if (r.ok) {
        setMission(d.mission);
        setError("");
      } else {
        setError(d.error || "Unable to load mission.");
      }
    } catch (e: any) {
      setError(e.message || "Unable to load mission.");
    }
  }, [user, params.id]);

  const loadAnalytics = useCallback(async () => {
    if (!user) return;

    try {
      const r = await authedFetch(
        `/api/missions/${params.id}/analytics`
      );

      const d = await r.json();

      if (r.ok) {
        setAnalytics(d.analytics || null);
      }
    } catch (e) {
      console.error("Analytics refresh failed:", e);
    }
  }, [user, params.id]);

  const loadDecisions = useCallback(async () => {
    if (!user) return;

    try {
      const r = await authedFetch(
        `/api/missions/${params.id}/decisions`
      );

      const d = await r.json();

      if (r.ok) {
        setDecisions(d.decisions || []);
      }
    } catch (e) {
      console.error("Decision refresh failed:", e);
    }
  }, [user, params.id]);

  const loadApprovals = useCallback(async () => {
    if (!user) return;

    try {
      const r = await authedFetch(
        `/api/missions/${params.id}/approvals`
      );

      const d = await r.json();

      if (r.ok) {
        setApprovals(d.approvals || []);
      }
    } catch (e) {
      console.error("Approval refresh failed:", e);
    }
  }, [user, params.id]);

  const refreshEverything = useCallback(async () => {
    await Promise.all([
      load(),
      loadAnalytics(),
      loadDecisions(),
      loadApprovals(),
    ]);
  }, [
    load,
    loadAnalytics,
    loadDecisions,
    loadApprovals,
  ]);

  /*
   * Initial mission load.
   */
  useEffect(() => {
    if (!user) return;

    refreshEverything();
  }, [user, refreshEverything]);

  /*
   * REAL AUTONOMOUS HEARTBEAT
   *
   * This is the important fix.
   *
   * The previous page only performed GET requests every few
   * seconds. It never actually called /tick.
   *
   * This worker now:
   *
   * 1. Calls POST /tick.
   * 2. Waits for the AI agent task to execute.
   * 3. Refreshes mission state.
   * 4. Refreshes analytics.
   * 5. Refreshes decisions.
   * 6. Refreshes approvals.
   * 7. Repeats while the mission is active.
   */
  useEffect(() => {
    if (!user) return;
    if (!mission) return;
    if (mission.status !== "active") return;

    let cancelled = false;

    const runHeartbeat = async () => {
      if (cancelled) return;
      if (heartbeatRunning.current) return;

      heartbeatRunning.current = true;
      setHeartbeatBusy(true);

      try {
        const response = await authedFetch(
          `/api/missions/${params.id}/tick`,
          {
            method: "POST",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error(
            "[KWACHA] Heartbeat failed:",
            data
          );

          if (data?.error) {
            setError(data.error);
          }

          return;
        }

        console.log(
          "[KWACHA] Heartbeat completed:",
          data
        );

        if (!cancelled) {
          await Promise.all([
            load(),
            loadAnalytics(),
            loadDecisions(),
            loadApprovals(),
          ]);
        }
      } catch (e: any) {
        console.error(
          "[KWACHA] Heartbeat error:",
          e
        );

        if (!cancelled) {
          setError(
            e.message ||
              "The mission heartbeat encountered an error."
          );
        }
      } finally {
        heartbeatRunning.current = false;

        if (!cancelled) {
          setHeartbeatBusy(false);
        }
      }
    };

    /*
     * Execute immediately when mission becomes active.
     */
    runHeartbeat();

    /*
     * Continue automatically every 5 seconds.
     */
    const interval = window.setInterval(
      runHeartbeat,
      5000
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    user,
    mission?.status,
    params.id,
    load,
    loadAnalytics,
    loadDecisions,
    loadApprovals,
  ]);

  /*
   * Extra lightweight refresh.
   *
   * This keeps the UI updated even between heartbeat cycles.
   * It DOES NOT execute an AI task.
   */
  useEffect(() => {
    if (!user) return;
    if (!mission) return;
    if (mission.status !== "active") return;

    const interval = window.setInterval(() => {
      load();
    }, 2500);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    user,
    mission?.status,
    load,
  ]);

  const progress = useMemo(() => {
    if (!mission?.stages?.length) return 0;

    return Math.round(
      (mission.stages.filter(
        (s: any) => s.status === "complete"
      ).length /
        mission.stages.length) *
        100
    );
  }, [mission]);

  async function action(path: string) {
    setBusy(true);
    setError("");

    try {
      const r = await authedFetch(
        `/api/missions/${params.id}/${path}`,
        {
          method: "POST",
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error || "Action failed."
        );
      }

      await refreshEverything();
    } catch (e: any) {
      setError(
        e.message || "Action failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    setBusy(true);
    setError("");

    try {
      const r = await authedFetch(
        `/api/missions/${params.id}/simulate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seed: 42,
          }),
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error || "Simulation failed."
        );
      }

      setAnalytics(d.analytics);

      await refreshEverything();
    } catch (e: any) {
      setError(
        e.message || "Simulation failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval() {
    setApprovalBusy(true);
    setError("");

    try {
      const r = await authedFetch(
        `/api/missions/${params.id}/approvals`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title:
              "Approve next simulated campaign action",
            description:
              "Allow the autonomous Marketing Agent to continue the next simulated campaign action within the mission budget.",
          }),
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error ||
            "Unable to request approval."
        );
      }

      await load();
      await loadApprovals();
      await loadDecisions();
    } catch (e: any) {
      setError(
        e.message ||
          "Unable to request approval."
      );
    } finally {
      setApprovalBusy(false);
    }
  }

  async function decideApproval(
    approvalId: string,
    status: string
  ) {
    setApprovalBusy(true);
    setError("");

    try {
      const r = await authedFetch(
        `/api/missions/${params.id}/approvals`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            approvalId,
            status,
          }),
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error ||
            "Unable to update approval."
        );
      }

      await load();
      await loadApprovals();
      await loadDecisions();
    } catch (e: any) {
      setError(
        e.message ||
          "Unable to update approval."
      );
    } finally {
      setApprovalBusy(false);
    }
  }

  async function generatePlan() {
    setPlanBusy(true);
    setError("");

    try {
      const r = await authedFetch(
        `/api/missions/${params.id}/plan`,
        {
          method: "POST",
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error ||
            "Gemini planning failed."
        );
      }

      await refreshEverything();
    } catch (e: any) {
      setError(
        e.message ||
          "Gemini planning failed."
      );
    } finally {
      setPlanBusy(false);
    }
  }

  if (!user || !mission) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto text-kwacha-gray-400">
          Loading Mission Control…
        </div>
      </main>
    );
  }

  const planMemory =
    mission.memories?.find(
      (m: any) =>
        m.key === "orchestrator.plan"
    );

  let plan: any = null;

  try {
    plan = planMemory
      ? JSON.parse(planMemory.value)
      : null;
  } catch {}

  const runningTasks =
    mission.agents?.filter(
      (t: any) => t.status === "running"
    ) || [];

  const completedTasks =
    mission.agents?.filter(
      (t: any) =>
        t.status === "done" ||
        t.status === "completed"
    ) || [];

  const failedTasks =
    mission.agents?.filter(
      (t: any) => t.status === "failed"
    ) || [];

  const currentTask =
    runningTasks[0] || null;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
          <button
            onClick={() =>
              router.push("/workspace")
            }
            className="text-sm text-kwacha-gray-400 flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Workspace
          </button>

          <div className="flex flex-wrap gap-2">
            <button
              className="kwacha-btn-secondary flex items-center gap-2"
              onClick={refreshEverything}
            >
              <RefreshCw size={15} />
              Refresh
            </button>

            {!plan && (
              <button
                className="kwacha-btn-secondary flex items-center gap-2"
                disabled={planBusy}
                onClick={generatePlan}
              >
                <Sparkles size={15} />
                {planBusy
                  ? "Planning…"
                  : "Generate with Gemini"}
              </button>
            )}

            {(mission.status === "draft" ||
              mission.status === "paused") && (
              <button
                className="kwacha-btn-primary flex items-center gap-2"
                disabled={busy}
                onClick={() =>
                  action("start")
                }
              >
                <Play size={15} />
                Start mission
              </button>
            )}

            {mission.status === "active" && (
              <button
                className="kwacha-btn-secondary flex items-center gap-2"
                disabled={busy}
                onClick={() =>
                  action("pause")
                }
              >
                <Pause size={15} />
                Pause
              </button>
            )}
          </div>
        </div>

        {/* MAIN MISSION HEADER */}
        <section className="kwacha-card p-6 mb-5">
          <div className="flex flex-wrap justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[.22em] text-kwacha-gold mb-3">
                <Radio size={14} />
                Mission Control
              </div>

              <h1 className="text-2xl md:text-3xl font-semibold max-w-3xl">
                {mission.objective}
              </h1>

              <p className="text-sm text-kwacha-gray-400 mt-3">
                {mission.business.name} ·{" "}
                {mission.targetAudience ||
                  "Target audience not specified"}
              </p>
            </div>

            <div className="min-w-44">
              <div
                className={`text-xs uppercase tracking-widest ${statusClass(
                  mission.status
                )}`}
              >
                {mission.status.replace(
                  "_",
                  " "
                )}
              </div>

              <div className="text-3xl font-semibold mt-2">
                {progress}%
              </div>

              <div className="h-1 bg-kwacha-gray-800 mt-3">
                <div
                  className="h-full bg-kwacha-gold transition-all duration-500"
                  style={{
                    width: `${progress}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* LIVE EXECUTION STATUS */}
        {mission.status === "active" && (
          <section className="kwacha-card p-5 mb-5 border border-kwacha-gold/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-kwacha-gold animate-pulse" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-kwacha-gold animate-ping opacity-40" />
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[.18em] text-kwacha-gold">
                    Mission running
                  </div>

                  <div className="text-sm mt-1">
                    {currentTask
                      ? `${currentTask.agent?.name || "AI Agent"} is working`
                      : heartbeatBusy
                      ? "AI heartbeat is processing the next task"
                      : "Waiting for the next AI task"}
                  </div>
                </div>
              </div>

              <div className="text-xs text-kwacha-gray-500">
                Autonomous execution · 5s cycle
              </div>
            </div>

            {currentTask && (
              <div className="mt-5 border-t border-kwacha-gray-800 pt-4">
                <div className="flex items-start gap-3">
                  <Loader2
                    size={17}
                    className="text-kwacha-gold animate-spin mt-0.5"
                  />

                  <div>
                    <div className="text-xs uppercase tracking-wider text-kwacha-gray-500">
                      Current task
                    </div>

                    <div className="text-sm mt-1">
                      {currentTask.title}
                    </div>

                    <div className="text-xs text-kwacha-gray-500 mt-1">
                      {currentTask.agent?.name ||
                        "AI Agent"}{" "}
                      · executing
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mt-5">
              <div className="border border-kwacha-gray-800 p-3">
                <div className="text-xs text-kwacha-gray-500">
                  Completed
                </div>
                <div className="text-xl mt-1 text-green-400">
                  {completedTasks.length}
                </div>
              </div>

              <div className="border border-kwacha-gray-800 p-3">
                <div className="text-xs text-kwacha-gray-500">
                  Working
                </div>
                <div className="text-xl mt-1 text-kwacha-gold">
                  {runningTasks.length}
                </div>
              </div>

              <div className="border border-kwacha-gray-800 p-3">
                <div className="text-xs text-kwacha-gray-500">
                  Failed
                </div>
                <div className="text-xl mt-1 text-red-400">
                  {failedTasks.length}
                </div>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="mb-5 border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ORCHESTRATOR PLAN */}
        {plan && (
          <section className="kwacha-card p-5 mb-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[.18em] text-kwacha-gold mb-3">
              <Sparkles size={14} />
              Gemini Orchestrator Plan
            </div>

            <h2 className="text-lg font-medium">
              {plan.summary}
            </h2>

            <p className="text-sm text-kwacha-gray-400 mt-2 leading-6">
              {plan.strategy}
            </p>

            {plan.assumptions?.length > 0 && (
              <div className="mt-4 text-xs text-kwacha-gray-500">
                Assumptions:{" "}
                {plan.assumptions.join(" · ")}
              </div>
            )}
          </section>
        )}

        <div className="grid lg:grid-cols-3 gap-5">

          {/* TIMELINE */}
          <section className="lg:col-span-2 kwacha-card p-5">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-medium">
                Execution Timeline
              </h2>

              <span className="text-xs text-kwacha-gray-500">
                {mission.stages.length} stages
              </span>
            </div>

            <div className="space-y-1">
              {mission.stages.map(
                (s: any) => (
                  <div
                    key={s.id}
                    className="flex gap-4 p-3 border-b border-kwacha-gray-800 last:border-0"
                  >
                    <div className="pt-0.5">
                      {s.status ===
                      "complete" ? (
                        <Check
                          size={17}
                          className="text-green-400"
                        />
                      ) : s.status ===
                        "active" ? (
                        <div className="w-4 h-4 border-2 border-kwacha-gold rounded-full animate-pulse" />
                      ) : (
                        <Circle
                          size={17}
                          className="text-kwacha-gray-600"
                        />
                      )}
                    </div>

                    <div className="flex-1">
                      <div
                        className={
                          s.status === "active"
                            ? "font-medium"
                            : "text-kwacha-gray-300"
                        }
                      >
                        {s.name}
                      </div>

                      <div className="text-xs uppercase tracking-wider text-kwacha-gray-500 mt-1">
                        {s.status}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {mission.status === "active" && (
              <div className="mt-5 grid md:grid-cols-2 gap-2">
                <button
                  className="kwacha-btn-secondary flex justify-center items-center gap-2"
                  disabled={
                    busy || heartbeatBusy
                  }
                  onClick={() =>
                    action("tick")
                  }
                >
                  <Timer size={15} />
                  Run next AI agent step
                </button>

                <button
                  className="kwacha-btn-secondary flex justify-center items-center gap-2"
                  disabled={busy}
                  onClick={simulate}
                >
                  <Radio size={15} />
                  Run simulation cycle
                </button>
              </div>
            )}
          </section>

          {/* RIGHT SIDE */}
          <div className="space-y-5">

            {/* RESOURCES */}
            <section className="kwacha-card p-5">
              <h2 className="font-medium mb-4">
                Mission Resources
              </h2>

              <div className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-kwacha-gray-400">
                    Budget
                  </span>

                  <span>
                    {mission.currency}{" "}
                    {mission.budgetAmount.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-kwacha-gray-400">
                    Deadline
                  </span>

                  <span>
                    {new Date(
                      mission.deadline
                    ).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-kwacha-gray-400">
                    Success
                  </span>

                  <span className="text-right max-w-40">
                    {mission.successMetric}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-kwacha-gray-400">
                    Leads
                  </span>

                  <span>
                    {mission._count.leads}
                  </span>
                </div>
              </div>
            </section>

            {/* HEARTBEAT */}
            <section className="kwacha-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-medium flex items-center gap-2">
                  <Radio size={17} />
                  Heartbeat
                </h2>

                <span className="text-xs text-kwacha-gold uppercase tracking-wider">
                  {mission.status ===
                  "active"
                    ? "Live"
                    : "Idle"}
                </span>
              </div>

              <p className="text-sm text-kwacha-gray-400">
                The mission automatically wakes
                the orchestrator, executes pending
                AI tasks, records results and
                updates mission performance.
              </p>

              {heartbeatBusy && (
                <div className="mt-4 flex items-center gap-2 text-xs text-kwacha-gold">
                  <Loader2
                    size={14}
                    className="animate-spin"
                  />
                  AI heartbeat running...
                </div>
              )}

              {mission.heartbeatRuns?.[0] && (
                <div className="mt-4 border-t border-kwacha-gray-800 pt-3">
                  <div className="text-xs uppercase tracking-wider text-kwacha-gray-500">
                    Last cycle
                  </div>

                  <div className="text-sm mt-1">
                    {mission.heartbeatRuns[0].action.replace(
                      /_/g,
                      " "
                    )}
                  </div>

                  <div className="text-xs text-kwacha-gray-500 mt-1">
                    {new Date(
                      mission.heartbeatRuns[0].createdAt
                    ).toLocaleTimeString()}{" "}
                    ·{" "}
                    {mission.heartbeatRuns[0].message}
                  </div>
                </div>
              )}
            </section>

            {/* AGENT TASKS */}
            <section className="kwacha-card p-5">
              <h2 className="font-medium mb-4 flex items-center gap-2">
                <Bot size={17} />
                Agent Tasks
              </h2>

              {mission.agents.length ===
              0 ? (
                <p className="text-sm text-kwacha-gray-500">
                  Agents are assigned when
                  the mission starts.
                </p>
              ) : (
                <div className="space-y-3">
                  {mission.agents.map(
                    (t: any) => (
                      <div
                        key={t.id}
                        className={`border p-3 ${
                          t.status ===
                          "running"
                            ? "border-kwacha-gold/40 bg-kwacha-gold/5"
                            : "border-kwacha-gray-800"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {t.status ===
                          "running" ? (
                            <Loader2
                              size={15}
                              className="text-kwacha-gold animate-spin mt-0.5"
                            />
                          ) : t.status ===
                              "done" ||
                            t.status ===
                              "completed" ? (
                            <Check
                              size={15}
                              className="text-green-400 mt-0.5"
                            />
                          ) : t.status ===
                            "failed" ? (
                            <XCircle
                              size={15}
                              className="text-red-400 mt-0.5"
                            />
                          ) : (
                            <Circle
                              size={15}
                              className="text-kwacha-gray-600 mt-0.5"
                            />
                          )}

                          <div className="flex-1">
                            <div className="text-sm">
                              {t.title}
                            </div>

                            <div
                              className={`text-xs mt-1 uppercase ${taskStatusClass(
                                t.status
                              )}`}
                            >
                              {t.agent?.name ||
                                "Agent"}{" "}
                              · {t.status}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ANALYTICS */}
        {analytics && (
          <section className="kwacha-card p-5 mt-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <div className="text-xs uppercase tracking-[.18em] text-kwacha-gold">
                  Simulation Environment
                </div>

                <h2 className="font-medium mt-1">
                  Live synthetic performance
                </h2>
              </div>

              <span className="text-xs text-kwacha-gray-500">
                TEST DATA ONLY
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div className="text-xs text-kwacha-gray-500">
                  Impressions
                </div>
                <div className="text-xl mt-1">
                  {analytics.impressions.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-xs text-kwacha-gray-500">
                  Clicks
                </div>
                <div className="text-xl mt-1">
                  {analytics.clicks.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-xs text-kwacha-gray-500">
                  Enquiries
                </div>
                <div className="text-xl mt-1">
                  {analytics.enquiries.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-xs text-kwacha-gray-500">
                  Qualified leads
                </div>
                <div className="text-xl mt-1 text-kwacha-gold">
                  {analytics.qualifiedLeads.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-xs text-kwacha-gray-500">
                  Simulated spend
                </div>

                <div className="text-xl mt-1">
                  {mission.currency}{" "}
                  {analytics.spend.toFixed(0)}
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-kwacha-gray-800 grid md:grid-cols-3 gap-3 text-sm">
              <div>
                CTR{" "}
                <span className="text-kwacha-gray-300">
                  {(analytics.ctr * 100).toFixed(
                    2
                  )}
                  %
                </span>
              </div>

              <div>
                Qualification rate{" "}
                <span className="text-kwacha-gray-300">
                  {(
                    analytics.qualificationRate *
                    100
                  ).toFixed(1)}
                  %
                </span>
              </div>

              <div>
                Cost / qualified lead{" "}
                <span className="text-kwacha-gray-300">
                  {mission.currency}{" "}
                  {analytics.costPerQualifiedLead.toFixed(
                    2
                  )}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* AGENT ACTIVITY */}
        <section className="kwacha-card p-5 mt-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">
              Agent Activity
            </h2>

            {mission.status === "active" && (
              <span className="text-xs text-kwacha-gold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-kwacha-gold animate-pulse" />
                Live
              </span>
            )}
          </div>

          {mission.activity?.length ===
          0 ? (
            <p className="text-sm text-kwacha-gray-500">
              No agent activity yet.
            </p>
          ) : (
            <div className="space-y-3">
              {mission.activity.map(
                (a: any) => (
                  <div
                    key={a.id}
                    className="flex gap-3 text-sm border-b border-kwacha-gray-800 last:border-0 pb-3 last:pb-0"
                  >
                    <span className="text-kwacha-gold uppercase text-[10px] tracking-wider min-w-24">
                      {a.actor}
                    </span>

                    <span className="text-kwacha-gray-300 flex-1">
                      {a.message}
                    </span>

                    <span className="text-xs text-kwacha-gray-600 whitespace-nowrap">
                      {new Date(
                        a.createdAt
                      ).toLocaleTimeString()}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {/* DECISIONS + APPROVALS */}
        <div className="grid lg:grid-cols-3 gap-5 mt-5">

          <section className="kwacha-card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium flex items-center gap-2">
                <Brain size={17} />
                Decision Inspector
              </h2>

              <span className="text-xs text-kwacha-gray-500">
                {decisions.length} decisions
              </span>
            </div>

            {decisions.length ===
            0 ? (
              <p className="text-sm text-kwacha-gray-500">
                No recorded decisions yet.
                The inspector will populate as
                agents observe and act.
              </p>
            ) : (
              <div className="space-y-4">
                {decisions
                  .slice(0, 12)
                  .map((d: any) => (
                    <div
                      key={d.id}
                      className="border-l-2 border-kwacha-gold pl-4"
                    >
                      <div className="flex justify-between gap-3">
                        <span className="text-xs uppercase tracking-wider text-kwacha-gold">
                          {d.actor} ·{" "}
                          {d.trigger.replace(
                            /_/g,
                            " "
                          )}
                        </span>

                        <span className="text-xs text-kwacha-gray-600">
                          {new Date(
                            d.createdAt
                          ).toLocaleString()}
                        </span>
                      </div>

                      <div className="text-sm mt-1">
                        {d.summary}
                      </div>

                      <div className="text-xs text-kwacha-gray-500 mt-2">
                        Action: {d.action}
                      </div>

                      {d.outcome && (
                        <div className="text-xs text-kwacha-gray-500 mt-1">
                          Outcome: {d.outcome}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="kwacha-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium flex items-center gap-2">
                <ShieldCheck size={17} />
                Approvals
              </h2>

              <button
                className="kwacha-btn-secondary text-xs"
                disabled={approvalBusy}
                onClick={requestApproval}
              >
                Request
              </button>
            </div>

            {approvals.length ===
            0 ? (
              <p className="text-sm text-kwacha-gray-500">
                No approval requests.
              </p>
            ) : (
              <div className="space-y-3">
                {approvals
                  .slice(0, 6)
                  .map((a: any) => (
                    <div
                      key={a.id}
                      className="border border-kwacha-gray-800 p-3"
                    >
                      <div className="text-sm">
                        {a.title}
                      </div>

                      <p className="text-xs text-kwacha-gray-500 mt-1">
                        {a.description}
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-kwacha-gray-500">
                          {a.status}
                        </span>

                        {a.status ===
                          "pending" && (
                          <div className="flex gap-2">
                            <button
                              className="text-xs text-green-400"
                              disabled={
                                approvalBusy
                              }
                              onClick={() =>
                                decideApproval(
                                  a.id,
                                  "approved"
                                )
                              }
                            >
                              <CheckCircle2
                                size={15}
                              />
                            </button>

                            <button
                              className="text-xs text-red-400"
                              disabled={
                                approvalBusy
                              }
                              onClick={() =>
                                decideApproval(
                                  a.id,
                                  "rejected"
                                )
                              }
                            >
                              <XCircle
                                size={15}
                              />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>

        {/* MEMORY */}
        <section className="kwacha-card p-5 mt-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium flex items-center gap-2">
              <History size={17} />
              Mission Memory
            </h2>

            <span className="text-xs text-kwacha-gray-500">
              Persistent context
            </span>
          </div>

          {(mission.memories || [])
            .length === 0 ? (
            <p className="text-sm text-kwacha-gray-500">
              No persistent memory entries yet.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {(mission.memories || [])
                .slice(0, 10)
                .map((m: any) => (
                  <div
                    key={m.id}
                    className="border border-kwacha-gray-800 p-3"
                  >
                    <div className="text-xs uppercase tracking-wider text-kwacha-gold">
                      {m.key}
                    </div>

                    <div className="text-xs text-kwacha-gray-400 mt-2 line-clamp-4">
                      {m.value}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* AI AGENT RESULTS */}
        <section className="kwacha-card p-5 mt-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-medium flex items-center gap-2">
                <Bot size={17} />
                AI Agent Results
              </h2>

              <p className="text-xs text-kwacha-gray-500 mt-1">
                Findings and outcomes produced by
                the agents during this mission.
              </p>
            </div>

            <span className="text-xs text-kwacha-gray-500">
              {mission.runs?.length || 0} runs
            </span>
          </div>

          {!mission.runs ||
          mission.runs.length === 0 ? (
            <div className="border border-kwacha-gray-800 p-6 text-center">
              {mission.status === "active" ? (
                <>
                  <Loader2
                    size={20}
                    className="mx-auto text-kwacha-gold animate-spin mb-3"
                  />

                  <div className="text-sm">
                    Waiting for the first AI
                    agent result...
                  </div>

                  <div className="text-xs text-kwacha-gray-500 mt-1">
                    The mission heartbeat will
                    execute the next queued agent
                    automatically.
                  </div>
                </>
              ) : (
                <div className="text-sm text-kwacha-gray-500">
                  No AI agent runs recorded yet.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {mission.runs.map(
                (run: any) => {
                  let output: any = {};

                  try {
                    output = JSON.parse(
                      run.output || "{}"
                    );
                  } catch {
                    output = {};
                  }

                  return (
                    <div
                      key={run.id}
                      className="border border-kwacha-gray-800 p-4"
                    >
                      <div className="flex flex-wrap justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-kwacha-gold" />

                          <span className="text-xs uppercase tracking-wider text-kwacha-gold">
                            {run.agent?.name ||
                              "AI Agent"}
                          </span>
                        </div>

                        <span className="text-xs text-kwacha-gray-600">
                          {new Date(
                            run.createdAt
                          ).toLocaleString()}
                        </span>
                      </div>

                      {output.outcome && (
                        <div className="mt-3">
                          <div className="text-xs uppercase tracking-wider text-kwacha-gray-500">
                            Outcome
                          </div>

                          <p className="text-sm mt-1 text-kwacha-gray-300">
                            {output.outcome}
                          </p>
                        </div>
                      )}

                      {run.reasoning &&
                        !output.outcome && (
                          <div className="mt-3">
                            <div className="text-xs uppercase tracking-wider text-kwacha-gray-500">
                              Agent reasoning
                            </div>

                            <p className="text-sm mt-1 text-kwacha-gray-300">
                              {run.reasoning}
                            </p>
                          </div>
                        )}

                      {output.findings?.length >
                        0 && (
                        <div className="mt-4">
                          <div className="text-xs uppercase tracking-wider text-kwacha-gray-500 mb-2">
                            Findings
                          </div>

                          <ul className="text-sm text-kwacha-gray-300 list-disc pl-5 space-y-2">
                            {output.findings.map(
                              (
                                finding: string,
                                index: number
                              ) => (
                                <li key={index}>
                                  {finding}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}

                      {output.actions?.length >
                        0 && (
                        <div className="mt-4">
                          <div className="text-xs uppercase tracking-wider text-kwacha-gray-500 mb-2">
                            Actions
                          </div>

                          <ul className="text-sm text-kwacha-gray-300 list-disc pl-5 space-y-2">
                            {output.actions.map(
                              (
                                action: string,
                                index: number
                              ) => (
                                <li key={index}>
                                  {action}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}

                      {!output.outcome &&
                        !output.findings?.length &&
                        !output.actions?.length &&
                        run.output && (
                          <div className="mt-3 text-sm text-kwacha-gray-400 whitespace-pre-wrap">
                            {run.output}
                          </div>
                        )}
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}