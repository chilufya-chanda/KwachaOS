# KWACHA OS — Consolidated Build (Phases 1–10)

This is the merged, final state of all 10 phase drops, normalized into one clean
project (no wrapper folders, no leftover build artifacts). It supersedes the
individual `kwacha-os-phaseN.zip` files — this folder already contains
everything from phase 1 through phase 10 with nothing dropped along the way
(verified file-by-file).

Old `PHASE8_README.md` / `PHASE9_README.md` / `PHASE10_README.md` are kept for
history and describe what each of those phases added.

## What's actually in here

- Firebase Authentication (email/password + Google) — identity only
- SQLite (via Prisma) — application data (users, workspaces, missions, agents, etc.)
- Onboarding: business profile → workspace → subscription → demo payment → verify
- Mission engine: create, start, pause, tick through stages, history
- Gemini-backed mission planning (`GEMINI_API_KEY`)
- Agent registry + orchestrator + tool/permission engine (simulated actions)
- Simulation engine (market data, paper trades) — clearly demo-only
- Heartbeat process for autonomous ticking (PM2 config included)
- Governance: approvals, decision log, memory
- Developer section: API keys, usage, public `/api/v1/*` endpoints
- Admin console at `/admin`: system overview, health, mission/agent/user monitors, audit log

## Before you run it — two things that will otherwise block you

1. **This app requires a real Firebase project.** There is no dev/mock auth
   bypass anywhere in the code — sign-in and sign-up call real Firebase
   client + admin SDKs. You must create a Firebase project, enable
   Email/Password (and Google, optional) sign-in, and fill in all
   `NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_*` values in `.env.local` before
   anything past the landing page will work.
2. **`/admin` is unreachable by default.** Every new user is created with
   `role: "business_user"` (see `src/app/api/auth/sign-in/route.ts` — actually
   `src/app/api/auth/sync/route.ts`) and nothing in the app ever promotes a
   user to `admin`. To view the Admin Console, sign up once normally, then
   open Prisma Studio and manually set your user's `role` field to `"admin"`
   (see step 5 below).

## Setup

```bash
npm install
cp .env.example .env.local
# fill in Firebase + Gemini values in .env.local
npm run db:push      # creates dev.db from the Prisma schema
npm run seed         # seeds the agent/tool registry
npm run dev          # http://localhost:3000
```

To view the Admin Console:
```bash
npm run db:studio
# open the User table, set your row's `role` to "admin", save
# then visit /admin while signed in
```

To run the autonomous heartbeat loop (optional, ticks missions in the background):
```bash
npm run heartbeat
# or, for a persistent process: npx pm2 start ecosystem.config.cjs
```

## Admin Finance dashboard (new)

Added a real "Finance" tab to the existing Admin Console (`/admin`) —
Agent Profitability, Model Cost Engine visibility, and Agent Health, all
computed from real `AiUsageEvent`/`WalletTransaction`/`AgentTask` data:

- Total wallet balance, AI provider cost vs. customer charge vs. margin
  for the current month
- Cost and margin broken down per agent (which agents are actually
  expensive to run)
- Cost broken down per provider/model
- Real success/failure rates per agent, from actual `AgentTask` status

**What I deliberately did not build, and why**: the BI/Finance doc
specifies 61 sections total, including MRR, churn, retention, customer
acquisition cost, cash flow, hosting cost, provider-dependency monitoring,
queue/webhook monitoring, and fraud detection. None of these are
meaningfully computable right now — this build has one demo workspace, not
a real customer base to compute churn/retention against, and no real
queues, webhooks receiving live traffic, or multiple redundant providers to
monitor. Building dashboards for those would mean inventing numbers to
fill the chart, which is the exact mistake already found and fixed
elsewhere in this build (the hardcoded "Lusaka" findings). I'd rather tell
you what's missing than fake it. If you get real paying customers and real
infrastructure, these become genuinely buildable — happy to do them then.



Closed the gap I flagged last time — real leads, real content drafts, and
real message history existed with no way to see them outside a mission's
raw activity log. Three new workspace-wide pages (Stage 20 of the user flow):

- **`/workspace/customers`** — every real lead across every mission, with a
  detail view showing conversation history, campaign source, and AI notes.
  A human can change lead status here for real.
- **`/workspace/inbox`** — unified inbox across connected channels, grouped
  by contact. **"Human can intervene" is real, not decorative**: I
  extracted the WhatsApp-sending code into one shared function
  (`sendWhatsAppReal`) so a human typing a reply here uses the exact same
  real send path as the Communication Agent — not a second, different,
  maybe-inconsistent implementation.
- **`/workspace/content`** — every draft the Content Agent has written,
  editable, with a real "Publish now" button. Same principle: publishing
  from here calls the same `publishToPlatformReal` function the Social
  Publishing Agent's tools use. A human clicking Publish is treated as the
  approval — it does not additionally route through the Permission Center's
  agent-approval gate, since that gate exists specifically to keep a human
  in the loop for autonomous actions, and a human directly clicking is
  already that.

**Refactor note**: this is the second time reusing a bug-prevention pattern
from earlier in this build — rather than writing the send/publish logic
twice (once for the agent, once for the human UI) and risking them drifting
apart, both paths now call the identical underlying function.



All five stages built, each wired into real enforcement, not just stored
settings:

- **Stage 12 — Business Knowledge**: manual entry, real website import
  (actual fetch + text extraction — single page, not a full crawl), real
  document upload (`.txt`/`.csv` native, `.docx` via the new `mammoth`
  dependency; **PDF is honestly not supported** — I didn't want to add an
  unverifiable parsing dependency, so it tells you to paste the content
  manually instead of pretending to extract it). Everything lands as a
  `BusinessKnowledge` row, retrievable on demand by the Content,
  Communication, CRM, and Research agents via a new `getBusinessKnowledge`
  tool — deliberately on-demand rather than stuffed into every prompt, to
  keep token usage down.
- **Brand Configuration**: a real `BrandProfile` that's actually fed into
  the Content/Communication/Marketing agents' system instructions (tone,
  language, style, words to use/avoid, CTA style) — not stored-and-ignored.
- **Stage 13 — Agent Configuration**: per-agent settings for all 6
  configurable agents, fed into that agent's real system instruction. Be
  aware these are *guidance*, not hard limits — e.g. Marketing's "campaign
  budget limit" field influences the prompt, but the actual enforced cap is
  Spend Controls below.
- **Stage 14 — Permission Center**: real per-tool modes (automatic /
  needs approval / blocked), checked before every single tool execution in
  the agent loop. "Needs approval" doesn't just log a warning — it creates
  a real `Approval` row with the tool and its exact arguments attached, and
  the action genuinely does not happen until a human approves it from the
  mission's existing Approvals panel, at which point it's executed for
  real. Unknown tools fail safe to "approval," never "auto."
- **Stage 15 — Marketing Spend Controls**: real daily/per-campaign caps,
  checked before `createCampaign`/`simulateCampaign` run — exceeding either
  cap blocks the action outright (not just a warning), independent of any
  approval setting. One honest precision note: "today's spend" is
  approximated from campaigns created today, not from a fully itemized
  per-day ledger — good enough for this simulated-economy feature, not
  perfectly precise if a campaign spends across multiple days.
- **Stage 16 — Communication Safety**: a real `CommunicationPolicy` gate in
  front of `sendWhatsAppMessage`. The model self-reports a message category
  (simple / sales-qualification / complex-refund-legal) as a tool argument,
  and the policy decides for real whether that specific message sends
  automatically or queues for approval — "draft only" mode never sends
  automatically no matter what.

All five are editable anytime at `/workspace/settings`, not just during
onboarding — useful for a demo, since you don't have to redo signup to
change a setting.

**One real bug fixed as a side effect**: `authedFetch` was unconditionally
forcing `Content-Type: application/json` on every request with a body,
which would have silently corrupted the document upload's file data the
moment I tried to use it. Fixed to skip that header for `FormData` bodies.

## Real web search for the Research Agent (new)

Added a real `webSearch` tool backed by Tavily (`src/lib/research/tavily.ts`)
— genuine live web search, not Gemini's static training knowledge. The
Research Agent can now call it before writing its findings, so research is
grounded in current real results.

Kept it token-conscious, per your instruction and the architecture doc's
own Token Management section: Tavily's API call itself costs Tavily usage,
not Gemini tokens, and I trim every result to a short extract (title, URL,
~400 characters) before it ever reaches Gemini — never full pages. The
model still authors the actual finding itself using `searchMarket` /
`analyzeCompetitors` / `identifyAudience` as before, now optionally
grounded in what `webSearch` actually found, rather than paying for a
dedicated grounding call on every single research step.

Add your key to `.env.local`:
```
TAVILY_API_KEY=your-key-here
```
**Not tested against a live Tavily call** — same caveat as everywhere else
in this build: no network access in my sandbox. If Tavily's exact response
shape has changed since I last knew it, you'll get a clear
`TavilySearchError`, not a silent wrong answer.



Two separate problems fixed here, both real:

**Problem 1 — hardcoded fake output.** Several existing tools
(`searchMarket`, `analyzeCompetitors`, `identifyAudience`, `generateContent`,
etc.) returned the exact same hardcoded string — literally mentioning
"Lusaka" and "property developers" — for every mission regardless of what
business or objective it was actually about. This was more fake than a
first read suggests. **Fixed**: these tools now take the actual finding as
a real function-call argument, so the model writes something specific to
*this* mission, and the tool just persists it. This costs zero extra
tokens, since the model is already reasoning about this mission in that
same turn — it was never a token/reasoning problem, it was a wiring bug.

**Problem 2 — most agents in your docs didn't exist yet.** Added 4 new
agents matching the Complete Architecture spec, keeping every one honest
about what's real vs. gated on a connection that isn't set up yet:

- **CRM Agent** — fully real, no external dependency. Creates and updates
  actual `Lead` rows in your database with real arguments (name, contact,
  qualification, status) — not simulated text.
- **Content Agent** — genuinely authors captions/ad copy for the specific
  business (it's Gemini's own writing, saved as a real `ContentDraft` row),
  separate from whether it ever gets published anywhere.
- **Communication Agent** — drafts messages always; sends a *real* WhatsApp
  message only if WhatsApp is actually connected in Integrations (checks
  connection status and phone number ID before ever attempting the real
  Graph API call). If not connected, it logs an honest `not_connected`
  result — it will never claim a message was sent when it wasn't.
- **Social Publishing Agent** — same honesty pattern per platform:
  - Facebook, LinkedIn: real API calls when connected (Facebook's Page
    posting may need a Page-token exchange I haven't built yet — if so,
    you'll get a clear auth error, not a silent failure)
  - Instagram, TikTok, YouTube: these platforms fundamentally require
    image/video media to post at all. Kwacha OS doesn't generate or upload
    media yet, so these tools always honestly report that instead of
    pretending a text-only post went out.

**Removed entirely:** the old post-hoc keyword-matching tool selection is
gone (see the agent intelligence entry below — it's what let tools run with
no arguments and silently fail). Nothing fake-simulates a real-world action
that didn't happen anywhere in this build now.

**Token efficiency, as asked:** I did *not* add a "real" web-search
grounding call for the Research Agent, on purpose — that would have added
a mandatory extra paid Gemini call per research task, which runs directly
against "don't burn tokens." Instead, research quality comes from Gemini's
own knowledge, applied specifically to your actual business context (fixed
by Problem 1's argument-passing change) at zero extra cost. I also removed
a redundant second Gemini call that used to always fire even when an agent
needed no tools at all — if the model can answer in one turn, it now stops
there instead of paying for a guaranteed follow-up call. A task now costs
somewhere between 1 and 5 Gemini calls depending on how many tools it
genuinely needs, not a fixed number.

**Known pre-existing gap, not something I introduced:** `recordSimulatedSpend`
and `recordAttributedRevenue` are tool handlers that exist but were never
actually assigned to any agent's allowed tools, before or after my changes
— dead code, harmless, listed here for completeness.

## Real agent intelligence (new)

Previously every agent (Research, Marketing, Sales, Analytics, Markets)
shared one generic Gemini prompt, and tool selection was a hardcoded
keyword-matching heuristic that ran *after* the AI call — it didn't use the
AI's judgment at all, and it never passed real arguments to tools. That
meant tools needing an argument (`pauseCampaign`, `qualifyLead`,
`simulateTrade`, `recordSimulatedSpend`, and others) always failed with an
"X is required" error the moment they ran, silently, every time.

Rebuilt this properly:

- **Each agent now gets its own system prompt**, built from the existing
  `AGENT_REGISTRY` metadata (name, description, capabilities, forbidden
  actions) — the Research Agent now actually reasons as a research
  specialist, not a generic assistant asked to "produce findings."
- **Real Gemini function calling** (`src/lib/tools/schema.ts` +
  `executeAgentTask` in `src/lib/ai/gemini.ts`) — the model is only shown
  the function declarations for tools *that specific agent* is allowed to
  use, genuinely decides which to call, and supplies real arguments. We
  execute the real tool handler (still re-checked against the permission
  engine as defense in depth), feed the real result back, and let the
  model continue or wrap up — up to 4 tool calls per task, then a final
  structured summary call.
- **The old `chooseTools` keyword heuristic in `orchestrator/index.ts` is
  gone entirely** — deleted, not deprecated. Tool execution now happens
  inside the agent loop itself, with real arguments, not guessed
  afterward.

**Cost implication, stated plainly:** a single agent task can now cost 2-5
Gemini calls (one per tool round, plus the final synthesis) instead of 1,
and each is billed individually to the wallet — this is more expensive per
task than before, and correctly so, since it's doing more real work.

**What I could not verify:** the tool-calling loop logic (multi-turn
`contents` array with `functionCall`/`functionResponse` parts) is written
to the Gemini API's documented shape as I understand it, but I have no way
to actually run a live Gemini call from this sandbox. If the exact response
shape differs from what I've assumed (e.g. `response.functionCalls()`
not existing on your installed SDK version), the failure mode is a clear
`GeminiRequestError`, not a silent wrong answer — but you should test one
real mission end-to-end before trusting this in front of anyone.



This is genuinely real, not simulated — the only thing simulated is the card
payment used to fund it (per your instruction to keep the payment gateway
simulated). Built from BI/Finance doc sections 9-13:

- **`Wallet` + `WalletTransaction`** — an append-only ledger. Every balance
  change (deposit, usage charge, refund, credit, adjustment, chargeback) is
  its own immutable row plus an atomic balance update — nothing is ever
  edited or deleted after posting, matching the doc's own rule about never
  silently modifying financial history.
- **`ModelPrice`** (Model Cost Engine, #13) — pricing lives in a database
  table, not hard-coded in application code, so a price change becomes a
  new row rather than an edit, keeping historical cost figures accurate.
  **The seeded Gemini price is a placeholder — verify it against
  <https://ai.google.dev/pricing> before trusting any cost number this
  build produces.**
- **`AiUsageEvent`** (AI Usage Ledger, #12) — every real Gemini call
  (mission planning and agent task execution) now goes through this. I
  changed `generateJson` in `src/lib/ai/gemini.ts` to read Gemini's actual
  reported token counts (`usageMetadata`) and charge the wallet for that
  exact usage — not an estimate.
- **`/workspace/wallet`** — balance, monthly usage by category, "Add funds"
  (same simulated test-card pattern as the existing subscription checkout —
  card `4242 4242 4242 4242` authorizes, anything else declines), Low
  Balance Protection (auto top-up threshold/amount), and recent
  transactions.

**Behavior change you should know about:** because real Gemini calls are
now billed, a mission with an empty wallet will fail to plan/start with a
402 "insufficient balance" error, and the heartbeat will auto-pause any
mission that runs out mid-execution (with a notification to the workspace
owner) rather than let it run for free. **You'll need to fund the wallet
from `/workspace/wallet` (demo card) before missions will run** — this
wasn't required before this change.

I did not invent a free starter credit — nothing in the docs you gave me
asked for one, so new workspaces start at $0 by design. Say the word if you
want one added.



Added a real (non-simulated) integration layer per the Complete Architecture
spec (#28-30) and User Flow Stage 11/11A — this is genuinely correct
integration code for Facebook, Instagram, WhatsApp, TikTok, LinkedIn,
Google, and YouTube, but **I could not test any of it against a live
platform** — this sandbox has no network access, and none of these
platforms had developer apps registered yet. Treat it as "ready to connect
the moment you have credentials," not as "verified working."

**What's real:**
- `src/lib/integrations/providers.ts` — actual documented OAuth endpoints
  and scopes for each platform (Meta Graph API v21.0, TikTok v2, LinkedIn,
  Google). Facebook/Instagram/WhatsApp all share one Meta app.
- `src/lib/integrations/crypto.ts` — AES-256-GCM encryption for tokens at
  rest, per the spec's "encrypted secrets, server-side only" requirement.
- `src/lib/integrations/state.ts` — signed OAuth state binding a callback
  back to the workspace/user that started it (OAuth redirects can't carry
  our normal `Authorization` header, since it's the browser navigating away
  to a third-party domain and back).
- Full flow: `/workspace/integrations` page → `POST /api/integrations/[p]/connect`
  → real provider redirect → `GET /api/integrations/[p]/callback` → encrypted
  token storage → Stage 11A business-context modal.

**Before any of this actually works, you need to, per platform:**
1. Register a developer app (Meta for Developers / TikTok for Developers /
   LinkedIn Developer Portal / Google Cloud Console).
2. Set the redirect URI in that platform's app settings to
   `{APP_URL}/api/integrations/{provider}/callback` — e.g.
   `http://localhost:3000/api/integrations/facebook/callback` for local dev.
3. Add the resulting client ID/secret to `.env.local` (see `.env.example`).
4. Generate `INTEGRATIONS_ENCRYPTION_KEY`:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Until credentials are set, the Connect button for that platform is disabled
in the UI with an honest "Not configured yet" label — it won't pretend to
work or throw a confusing error.

**Known real-world caveats from the architecture docs themselves, not me:**
Meta requires app review/business verification before granting most scopes
beyond your own test accounts — expect that to take real time on Meta's
side. TikTok's Direct Post API and comment-automation capabilities have
platform-side restrictions the doc explicitly flags as needing to be
re-checked against current TikTok documentation before relying on them.

**Payment gateway stays simulated**, as requested — no real payment
processor is wired up.



I re-checked this codebase using an actual TypeScript parser (not just grep),
running every file through `tsc` in isolation to catch syntax errors and
undefined references. This found and fixed real, confirmed bugs:

1. **`src/app/missions/[id]/page.tsx` (Mission Control page) was broken and
   would have crashed on load.** A single missing `}` on the analytics block
   threw off the whole JSX tree below it, and on top of that: `approvalBusy`
   state, the `decisions`/`approvals` lists, and 5 icon imports (`Brain`,
   `ShieldCheck`, `CheckCircle2`, `XCircle`, `History`) were referenced in the
   JSX but never declared or imported anywhere. Fixed: added the missing
   brace, added the missing state + fetch calls to the existing (and
   already-correct) `/decisions` and `/approvals` GET endpoints, wired the
   Mission Memory section to the `mission.memories` data already being
   loaded, and added the missing icon imports.
2. **`getMarketData` was imported and called in 3 places
   (`/api/v1/markets`, `/api/simulation/market`, and the Markets Agent's tool
   registry) but never existed in `src/lib/simulation/engine.ts`.** Every one
   of those would have thrown `getMarketData is not a function` at runtime.
   Fixed: added the missing export (reads `MarketInstrument` rows via
   Prisma, matching the pattern of the other engine functions). Also added 3
   sample instruments to `prisma/seed.ts`, since nothing seeded that table
   before — the Markets Agent would otherwise always show an empty list.
3. **~46 `catch (e)` blocks across 36 API route files accessed `e.message`
   without narrowing `e`'s type.** Under this project's own `tsconfig.json`
   (`strict: true`), TypeScript treats catch variables as `unknown` by
   default, so `npm run build` would have failed with ~46 type errors,
   even though `npm run dev` tolerates it. Fixed by typing these as
   `catch (e: any)`, matching the convention already used elsewhere in the
   codebase (e.g. the client-side mission page).

**One thing I could not fully verify** (noted for honesty, not because I
found a bug): a few places build a lookup with
`new Map(rows.map((r) => [r.key, r]))` and then read a property off the
result (`agent.id` in `mission-planner.ts`, `.status`/`externalAccountName`
in the new `integrations/route.ts`). These look correct to me, but my check
environment has no real `@prisma/client` types generated (that requires
`npx prisma generate`, which needs `npm install` first), and in my isolated
per-file checks this exact `Map`-from-tuples pattern gets misinferred the
same way in both old and new code — including in `agents/route.ts`, which
predates any of my changes. That consistency makes me fairly confident it's
an artifact of my check setup rather than a real bug, but I can't rule it
out with certainty without running `tsc` inside the real project.

Everything above was checked with `tsc` run against every file in `src/`,
`prisma/`, and `scripts/`, using this project's real `tsconfig.json` settings
(strict mode, same `lib`/`target`/paths) plus stubs standing in for
`node_modules` packages (which aren't installed in my sandbox — no network
access here). Errors caused purely by those stubs (e.g. "cannot find module
'react'") were filtered out; everything reported above is a real,
independently-confirmed issue in the project's own code.



- `recharts` is a listed dependency but no chart is actually rendered yet;
  dashboards currently show numeric stats only.
- `Budget`, `CampaignMetric`, `SimulationAccount`, `SimulationEvent` models
  exist in the Prisma schema but have no CRUD code using them yet.
- `SESSION_SECRET` and `APP_URL` are in `.env.example` but not read anywhere
  in the current code.
- No automated tests exist in the project.

## Everything else checked and confirmed working

(An earlier pass only checked that `@/...` and relative import *paths*
resolved to real files — it didn't check named imports like lucide-react
icons against actual usage, or undefined variables, which is exactly how the
Mission Control bug above slipped through. The deep-check pass above used a
real parser and did check those things.)

- Every file in `src/`, `prisma/`, and `scripts/` parses with zero syntax
  errors (verified with `tsc`, not just eyeballing).
- Every `@/...` and relative import across the whole `src/` tree resolves to
  a real file — no broken imports.
- All 38 API route files export a valid Next.js route handler.
- 36 of 38 routes are gated by `requireUser` / `requireAdmin` / API-key auth;
  the two exceptions (`/api/auth/sync`, `/api/heartbeat`) are correctly
  unauthenticated-by-design (sync creates the session; heartbeat checks its
  own `HEARTBEAT_SECRET` header instead).
- Every Prisma model used in code (`prisma.<model>.…`) exists in
  `schema.prisma` with matching casing — no typos.
- Every env var read via `process.env.X` in code is declared in `.env.example`.
- SQLite is the datastore (`DATABASE_URL="file:./dev.db"`) — no external DB
  server needed.
