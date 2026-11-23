import { NextRequest, NextResponse } from "next/server";
import { runHeartbeatOnce } from "@/lib/heartbeat/service";

export async function POST(req: NextRequest) {
  const configured = process.env.HEARTBEAT_SECRET;
  if (!configured || req.headers.get("x-kwacha-heartbeat-secret") !== configured) {
    return NextResponse.json({ error: "Heartbeat authorization failed." }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runHeartbeatOnce()) });
  } catch {
    return NextResponse.json({ error: "Heartbeat cycle failed." }, { status: 500 });
  }
}
