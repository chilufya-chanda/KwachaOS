# KWACHA OS — Phase 10

## Admin Console & System Monitoring

Phase 10 adds a role-protected operational control plane at `/admin`.

### Included
- System overview metrics for users, workspaces, missions, agents, runs, heartbeats, API usage, tools and errors.
- System health checks for app, SQLite/Prisma, Gemini configuration, heartbeat freshness, simulation, memory and API.
- Mission monitor with status, workspace, leads, runs, heartbeat count and update time.
- Agent monitor with fleet state, task/run counts and recent runs.
- User monitor with role, subscription tier, onboarding state and workspace counts.
- System event stream with info/warning/error levels.
- Admin audit log for control-plane access.
- Server-side `requireAdmin` enforcement; non-admin users are redirected to the workspace.
- Responsive dense operational UI consistent with the KWACHA OS dark/gold visual language.
- Automatic 30-second refresh plus manual refresh.

The console is observational. It does not introduce unsafe external execution or bypass the existing permission/simulation layers.
