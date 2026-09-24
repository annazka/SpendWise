import "server-only";

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return { url, key };
}

export async function supabaseRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase database error (${response.status}): ${message}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function uploadPrivateObject(bucket: string, path: string, bytes: ArrayBuffer, type: string) {
  const { url, key } = config();
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": type, "x-upsert": "false" },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Receipt upload failed (${response.status}): ${await response.text()}`);
}

export async function downloadPrivateObject(bucket: string, path: string) {
  const { url, key } = config();
  return fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
}

export async function deletePrivateObject(bucket: string, paths: string[]) {
  const { url, key } = config();
  await fetch(`${url}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
}
