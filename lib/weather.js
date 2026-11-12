// 真实天气：用 Cloudflare 根据访问者网络大致判断出的位置（不需要定位权限），
// 再向 Open-Meteo（免费、不需要密钥）查询当地现在的天气。结果缓存 20 分钟。

// WMO 天气代码 → 窗外的场景
export function sceneOf(code) {
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([45, 48].includes(code)) return "fog";
  if ([2, 3].includes(code)) return "cloudy";
  return "clear"; // 0、1
}

const LABEL = { clear: "晴", cloudy: "多云", fog: "雾", drizzle: "小雨", rain: "雨", snow: "雪", storm: "雷雨" };

export async function getWeather(request) {
  const cf = request.cf || {};
  const lat = Number(cf.latitude) || 35.68; // 拿不到位置时用东京
  const lon = Number(cf.longitude) || 139.76;
  const tz = cf.timezone || "Asia/Tokyo";
  const city = cf.city || "";
  const key = `https://weather.cache/${lat.toFixed(1)},${lon.toFixed(1)}`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return { ...(await hit.json()), city };
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,is_day,temperature_2m,cloud_cover&daily=sunrise,sunset&forecast_days=1&timezone=${encodeURIComponent(tz)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`天气服务 HTTP ${res.status}`);
  const d = await res.json();
  const code = d.current?.weather_code ?? 1;
  const scene = sceneOf(code);
  const out = {
    scene,
    label: LABEL[scene],
    code,
    isDay: d.current?.is_day === 1,
    temp: Math.round(d.current?.temperature_2m ?? 0),
    sunrise: d.daily?.sunrise?.[0] || "",
    sunset: d.daily?.sunset?.[0] || "",
    tz,
    lat,
  };
  if (cache) await cache.put(key, new Response(JSON.stringify(out), { headers: { "cache-control": "max-age=1200" } }));
  return { ...out, city };
}
