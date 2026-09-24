import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, verifyMessage } from "ethers";

const SESSION_COOKIE = "spendwise_session";
const CHALLENGE_COOKIE = "spendwise_challenge";

type SessionPayload = { wallet: string; exp: number };
type ChallengePayload = { wallet: string; message: string; exp: number };

function secret() {
  const value = process.env.SPENDWISE_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SPENDWISE_SESSION_SECRET must contain at least 32 characters.");
  return value;
}

function encode(value: object) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decode<T>(token?: string): T | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T; }
  catch { return null; }
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function createWalletChallenge(input: string) {
  const wallet = getAddress(input);
  const nonce = randomBytes(18).toString("hex");
  const issuedAt = new Date().toISOString();
  const message = [
    "Sign in to SpendWise",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`,
    "",
    "This signature is free and does not submit a blockchain transaction.",
  ].join("\n");
  const exp = Date.now() + 5 * 60_000;
  (await cookies()).set(CHALLENGE_COOKIE, encode({ wallet, message, exp }), { ...cookieOptions, maxAge: 300 });
  return { wallet, message };
}

export async function verifyWalletChallenge(walletInput: string, signature: string) {
  const wallet = getAddress(walletInput);
  const store = await cookies();
  const challenge = decode<ChallengePayload>(store.get(CHALLENGE_COOKIE)?.value);
  if (!challenge || challenge.exp < Date.now() || challenge.wallet !== wallet) throw new Error("The wallet challenge expired. Please connect again.");
  if (getAddress(verifyMessage(challenge.message, signature)) !== wallet) throw new Error("The wallet signature is invalid.");
  const exp = Date.now() + 7 * 24 * 60 * 60_000;
  store.set(SESSION_COOKIE, encode({ wallet, exp }), { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 });
  store.delete(CHALLENGE_COOKIE);
  return wallet;
}

export async function getWalletSession() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = decode<SessionPayload>(value);
  if (!session || session.exp < Date.now()) return null;
  try { return getAddress(session.wallet); } catch { return null; }
}

export async function requireWalletSession() {
  const wallet = await getWalletSession();
  if (!wallet) throw new Error("UNAUTHORIZED");
  return wallet;
}

export async function clearWalletSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(CHALLENGE_COOKIE);
}
