import { startHeartbeatWorker } from "@/lib/heartbeat/service";

startHeartbeatWorker().catch((error) => {
  console.error("KWACHA heartbeat worker stopped", error);
  process.exit(1);
});
