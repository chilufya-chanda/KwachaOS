# KWACHA OS — Phase 8

## Memory, Activity, Decision Inspector, Approvals & Mission History

Phase 8 adds the governance and observability layer on top of the autonomous heartbeat/orchestrator loop.

### Added

- Persistent `Decision` records with trigger, evidence, action and outcome.
- Decision Inspector in Mission Control.
- Persistent Mission Memory viewer.
- Human approval creation and approve/reject workflow.
- Approval activity and decision records.
- Mission history page across the current workspace.
- Decision and memory APIs.
- Approval API with workspace membership authorization.
- Completion notifications when a mission reaches its success target.
- Orchestrator agent results now become inspectable decisions.
- Heartbeat performance observations now become inspectable decisions.

### APIs

- `GET /api/missions/:id/decisions`
- `GET /api/missions/:id/memory`
- `GET /api/missions/:id/approvals`
- `POST /api/missions/:id/approvals`
- `PATCH /api/missions/:id/approvals`
- `GET /api/missions/history`

### Demo behavior

All records are persisted in SQLite. Approval actions are application-level governance only. No real external action or financial transaction is introduced by Phase 8.

### Verification

The project was checked for schema/code consistency in the working tree. Full dependency installation/Next.js compilation may still require an environment where npm dependencies can finish installing; previous environment attempts timed out.
