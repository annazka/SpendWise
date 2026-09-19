import { env } from "cloudflare:workers";

export const currencies = ["IDR", "USD", "MYR", "SGD"] as const;
export const categories = ["Food & drinks", "Groceries", "Transport", "Shopping", "Other"];

export function bindings() {
  return env as unknown as {
    DB: D1Database;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    BOT_CONTRACT_ADDRESS?: string;
    BOT_CHAIN_ID?: string;
  };
}

export function session(request: Request) {
  const match = request.headers.get("cookie")?.match(/(?:^|;\s*)sw_session=([a-f0-9-]{36})(?:;|$)/);
  return {
    id: match?.[1] || crypto.randomUUID(),
    fresh: !match,
    secure: new URL(request.url).protocol === "https:",
  };
}

export function response(data: unknown, current: ReturnType<typeof session>, status = 200) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (current.fresh) {
    headers["Set-Cookie"] = `sw_session=${current.id}; HttpOnly; ${current.secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=31536000`;
  }
  return Response.json(data, { status, headers });
}

export async function authenticatedWallet(db: D1Database, sessionId: string) {
  const row = await db.prepare("SELECT wallet FROM wallet_sessions WHERE session=?").bind(sessionId).first<{ wallet: string }>();
  return row?.wallet?.toLowerCase() || null;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

export function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function validCurrency(value: unknown): value is (typeof currencies)[number] {
  return typeof value === "string" && currencies.includes(value as (typeof currencies)[number]);
}
