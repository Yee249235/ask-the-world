import { json, readJson, sessionToken, sessionCookie } from "../../lib/util.js";

export async function onRequestPost({ request, env }) {
  if (!env.ACCESS_PASSWORD) return json({ error: "还没有设置 ACCESS_PASSWORD 环境变量" }, 500);
  const { password } = await readJson(request);
  if (!password || password !== env.ACCESS_PASSWORD) {
    await new Promise((r) => setTimeout(r, 600)); // 减慢暴力尝试
    return json({ error: "密码不对" }, 401);
  }
  const token = await sessionToken(env);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, request) });
}
