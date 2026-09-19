import { getAddress, isAddress, verifyMessage } from "ethers";
import { bindings, response, sameOrigin, session } from "@/lib/server";

function loginMessage(wallet: string, nonce: string) {
  return [
    "Sign in to SpendWise",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    "",
    "This request will not trigger a blockchain transaction or cost gas.",
  ].join("\n");
}

export async function GET(request: Request) {
  const current = session(request);
  const row = await bindings().DB.prepare("SELECT wallet FROM wallet_sessions WHERE session=?")
    .bind(current.id)
    .first<{ wallet: string }>();
  return response({ authenticated: Boolean(row), wallet: row?.wallet || null }, current);
}

export async function POST(request: Request) {
  const current = session(request);
  if (!sameOrigin(request)) return response({ error: "Invalid request origin." }, current, 403);
  try {
    const body = (await request.json()) as { action?: string; wallet?: string; signature?: string };
    const db = bindings().DB;
    if (body.action === "challenge") {
      if (!body.wallet || !isAddress(body.wallet)) return response({ error: "Connect a valid EVM wallet." }, current, 400);
      const wallet = getAddress(body.wallet);
      const nonce = crypto.randomUUID();
      const expiresAt = Date.now() + 5 * 60_000;
      await db.prepare(
        "INSERT INTO auth_challenges(session,wallet,nonce,expires_at) VALUES(?,?,?,?) ON CONFLICT(session) DO UPDATE SET wallet=excluded.wallet,nonce=excluded.nonce,expires_at=excluded.expires_at",
      ).bind(current.id, wallet.toLowerCase(), nonce, expiresAt).run();
      return response({ message: loginMessage(wallet, nonce) }, current);
    }
    if (body.action === "verify") {
      if (!body.wallet || !body.signature || !isAddress(body.wallet)) return response({ error: "Missing wallet signature." }, current, 400);
      const challenge = await db.prepare("SELECT wallet,nonce,expires_at FROM auth_challenges WHERE session=?")
        .bind(current.id)
        .first<{ wallet: string; nonce: string; expires_at: number }>();
      if (!challenge || challenge.expires_at < Date.now() || challenge.wallet !== body.wallet.toLowerCase()) {
        return response({ error: "Login request expired. Please connect again." }, current, 401);
      }
      const recovered = verifyMessage(loginMessage(getAddress(body.wallet), challenge.nonce), body.signature).toLowerCase();
      if (recovered !== challenge.wallet) return response({ error: "Wallet signature did not match." }, current, 401);
      await db.batch([
        db.prepare("INSERT INTO wallet_sessions(session,wallet,created_at) VALUES(?,?,?) ON CONFLICT(session) DO UPDATE SET wallet=excluded.wallet,created_at=excluded.created_at")
          .bind(current.id, challenge.wallet, Date.now()),
        db.prepare("DELETE FROM auth_challenges WHERE session=?").bind(current.id),
      ]);
      return response({ authenticated: true, wallet: getAddress(body.wallet) }, current);
    }
    if (body.action === "disconnect") {
      await db.prepare("DELETE FROM wallet_sessions WHERE session=?").bind(current.id).run();
      return response({ authenticated: false }, current);
    }
    return response({ error: "Unknown authentication action." }, current, 400);
  } catch (error) {
    console.error("Wallet authentication failed", error);
    return response({ error: "Wallet authentication failed. Please try again." }, current, 400);
  }
}
