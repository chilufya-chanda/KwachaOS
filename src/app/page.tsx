import Link from "next/link";
import { ArrowRight, Cpu, Activity, ShieldCheck } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-24">
      <nav className="flex items-center justify-between mb-24">
        <span className="text-lg font-semibold tracking-wide">
          KWACHA <span className="gold-text">OS</span>
        </span>
        <Link href="/sign-in" className="kwacha-btn-secondary text-sm">
          Sign in
        </Link>
      </nav>

      <section className="text-center max-w-3xl mx-auto">
        <p className="uppercase tracking-[0.2em] text-xs text-kwacha-gray-300 mb-4">
          The Autonomous Operating System for AI Agents
        </p>
        <h1 className="text-4xl md:text-6xl font-semibold leading-tight mb-6">
          Give AI a mission.
          <br />
          <span className="gold-text">Not a prompt.</span>
        </h1>
        <p className="text-kwacha-gray-300 text-lg mb-10">
          Goal + Resources + Permissions + Constraints → Autonomous Execution → Observation →
          Adaptation → Measurable Result.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/sign-up" className="kwacha-btn-primary flex items-center gap-2">
            Start a mission <ArrowRight size={16} />
          </Link>
          <Link href="/sign-in" className="kwacha-btn-secondary">
            Sign in
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6 mt-32">
        <div className="kwacha-card p-6">
          <Cpu className="gold-text mb-3" size={22} />
          <h3 className="font-medium mb-2">Orchestrator, not chatbot</h3>
          <p className="text-sm text-kwacha-gray-300">
            Missions are delegated across specialized agents — Research, Marketing, Sales,
            Analytics — coordinated by a central Orchestrator.
          </p>
        </div>
        <div className="kwacha-card p-6">
          <Activity className="gold-text mb-3" size={22} />
          <h3 className="font-medium mb-2">Every action, visible</h3>
          <p className="text-sm text-kwacha-gray-300">
            A live Activity Stream and Decision Inspector show exactly what each agent did, and
            why.
          </p>
        </div>
        <div className="kwacha-card p-6">
          <ShieldCheck className="gold-text mb-3" size={22} />
          <h3 className="font-medium mb-2">Autonomy within limits</h3>
          <p className="text-sm text-kwacha-gray-300">
            Budgets, permissions and a Policy Engine keep execution inside boundaries you set —
            with human approval where it matters.
          </p>
        </div>
      </section>
    </main>
  );
}
