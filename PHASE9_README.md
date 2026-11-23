# KWACHA OS — Phase 9

Developer Portal, API keys, scoped API authentication, working developer endpoints, and API usage observability.

## Included
- Developer Portal UI
- API key creation with `kw_live_...` secrets
- SHA-256 key hashing; plaintext secrets are never stored
- One-time secret reveal and copy flow
- Key revocation
- API scopes and enforcement
- 120 requests/minute per-key rate limit
- API usage persistence
- Developer applications
- Working `/api/v1` endpoints for agents, missions, activity, economy, markets and paper trades
- Agent execution endpoint wired to the existing orchestrator
- Simulation-only external/economic actions

## API authentication
Use either:
- `Authorization: Bearer kw_live_...`
- `X-API-Key: kw_live_...`

## Notes
Phase 9 is a demo/mock-up implementation aligned to the product specification. It does not claim production SLA, live integrations, live payments, live advertising or live trading.
