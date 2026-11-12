// 简单的单人密码保护：除了 /api/login，其余接口都需要登录
import { isAuthed, json } from "../../lib/util.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === "/api/login" || url.pathname === "/api/logout") {
    return context.next();
  }
  if (!context.env.ACCESS_PASSWORD) {
    return json({ error: "还没有设置 ACCESS_PASSWORD 环境变量" }, 500);
  }
  if (!(await isAuthed(context.request, context.env))) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    return await context.next();
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
}
