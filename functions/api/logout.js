import { json, clearCookie } from "../../lib/util.js";

export const onRequestPost = () => json({ ok: true }, 200, { "set-cookie": clearCookie() });
