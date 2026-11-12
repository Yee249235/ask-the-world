export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export const newId = (prefix = "") =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const now = () => Date.now();

const COOKIE = "atw_session";

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const sessionToken = (env) => hmacHex(env.ACCESS_PASSWORD, "atw-session-v1");

export async function isAuthed(request, env) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`${COOKIE}=([a-f0-9]+)`));
  if (!m) return false;
  return m[1] === (await sessionToken(env));
}

export function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=31536000`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
