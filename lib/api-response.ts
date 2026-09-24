export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  if (message === "UNAUTHORIZED") return Response.json({ error: "Connect and sign your wallet again." }, { status: 401 });
  if (message.includes("Supabase is not configured") || message.includes("SPENDWISE_SESSION_SECRET")) {
    return Response.json({ error: message }, { status: 503 });
  }
  console.error(error);
  return Response.json({ error: message }, { status: 500 });
}
