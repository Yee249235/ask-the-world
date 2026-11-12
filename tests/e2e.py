"""
问世界 · 端到端测试（火花和课题两边都测）

用法（在项目根目录）：
  1. node tests/mock_ai.mjs &                         # 假 AI，回答里故意带 Markdown
  2. .dev.vars 里设置 ACCESS_PASSWORD=test123，CUSTOM_* 和 TAVILY_* 指向 http://127.0.0.1:9999
  3. rm -rf .wrangler/state && npm run db:local && npx wrangler pages dev --port 8788 &
  4. python3 tests/e2e.py
"""
import asyncio, re, sys
from playwright.async_api import async_playwright

BASE = "http://localhost:8788"
PW = "test123"
MD = re.compile(r"\*\*|^#{1,6}\s|^\s*[-*]\s|`", re.M)
results = []

def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("✅" if ok else "❌"), name, ("— " + detail) if detail and not ok else "")

async def long_press(pg, el):
    await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
    bb = await el.bounding_box()
    await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + min(30, bb["height"] / 2))
    await pg.mouse.down(); await pg.wait_for_timeout(700); await pg.mouse.up(); await pg.wait_for_timeout(300)

async def swipe(pg, dx, y=500, x0=None):
    """在手机上模拟手指横向滑动"""
    x0 = x0 if x0 is not None else (300 if dx < 0 else 80)
    await pg.evaluate("""([x0, x1, y]) => {
      const el = document.elementFromPoint(x0, y) || document.body;
      const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent("touchstart", { touches: [mk(x0)], changedTouches: [mk(x0)], bubbles: true }));
      el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [mk(x1)], bubbles: true }));
    }""", [x0, x0 + dx, y])
    await pg.wait_for_timeout(450)

async def no_overflow(pg, where):
    sw, iw = await pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
    check(f"{where}：页面没有被撑宽", sw <= iw + 1, f"scrollWidth={sw} innerWidth={iw}")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-proxy-server"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # ---------- 登录 ----------
        await pg.goto(BASE); await pg.wait_for_selector("#pw")
        await pg.fill("#pw", "wrong"); await pg.click("text=进入"); await pg.wait_for_timeout(1200)
        check("登录：密码错误有提示", "密码不对" in await pg.inner_text("#le"))
        await pg.fill("#pw", PW); await pg.click("text=进入"); await pg.wait_for_selector(".capture textarea")
        check("登录：密码正确进入首页", True)
        await no_overflow(pg, "火花首页")

        # ---------- 火花：先记下（选了分类）----------
        check("记录框：分类平时是收起的", await pg.locator(".pick-list").count() == 0)
        await pg.click("#pick-toggle"); await pg.wait_for_timeout(200)
        check("记录框：点开后是可以上下滑的列表", await pg.eval_on_selector(".pick-list", "e => getComputedStyle(e).overflowY") == "auto")
        await pg.click(".pick-list [data-pick] >> nth=2"); await pg.wait_for_timeout(200)
        cat_name = (await pg.inner_text("#pick-toggle")).replace("▾", "").strip()
        check("记录框：选好后自动收起并显示所选分类", await pg.locator(".pick-list").count() == 0 and len(cat_name) > 2, cat_name)
        check("记录框：「新分类」按钮在外面", await pg.locator(".pick-bar [data-newcat]").count() == 1)
        await pg.fill(".capture textarea", "为什么炒青菜要大火？"); await pg.click("[data-mode=save]"); await pg.wait_for_timeout(800)
        first = pg.locator(".card").first
        check("火花：先记下后出现在最上面", "炒青菜" in await first.inner_text())
        check("火花：卡片显示所选分类", cat_name.split()[-1] in await first.locator(".meta").inner_text(), cat_name)

        # ---------- 火花：记下并回答 ----------
        await pg.fill(".capture textarea", "猫为什么会呼噜？"); await pg.click("[data-mode=answer]")
        await pg.wait_for_selector("#snack.show", timeout=15000)
        card = pg.locator(".card", has_text="猫为什么会呼噜").first
        ans = await card.locator(".ans").inner_text()
        check("火花：记下并回答后卡片直接显示答案", "核心答案" in ans, ans[:40])
        check("火花：卡片上的答案没有 Markdown 符号", not MD.search(ans), ans[:80])
        check("火花：卡片标着「刚答好」", "刚答好" in await card.inner_text())
        await pg.click("#snack .sm"); await pg.wait_for_selector("#sh-ans")
        check("火花：点提示条能打开那个问题", "猫为什么会呼噜" in await pg.input_value("#sh-text"))
        ta = await pg.input_value("#sh-ans")
        check("火花：详情页答案没有 Markdown 符号", not MD.search(ta), ta[:80])

        # ---------- 追问 ----------
        await pg.click("#sh-ideas"); await pg.wait_for_selector(".idea")
        check("追问：AI 给出 3 个提示", await pg.locator(".idea").count() == 3)
        y0 = await pg.eval_on_selector(".sheet", "e => e.scrollTop")
        await pg.click(".idea >> nth=0"); await pg.wait_for_timeout(200)
        y1 = await pg.eval_on_selector(".sheet", "e => e.scrollTop")
        check("追问：点提示后页面没有跳回顶部", abs(y1 - y0) < 5 or y1 > 0, f"{y0}->{y1}")
        await pg.click("#sh-follow button.primary"); await pg.wait_for_timeout(800)
        check("追问：追问出现在列表里", await pg.locator(".sheet .mini[data-goto]").count() >= 1)
        await pg.click(".sheet .list .mini[data-goto] >> nth=0"); await pg.wait_for_timeout(500)
        check("追问：打开追问时上方显示来自哪个问题", "猫为什么会呼噜" in await pg.inner_text(".parent-ctx"))
        open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mock-msgs.log", "a").close()
        await pg.click("#sh-ai"); await pg.wait_for_timeout(2500)
        log = open("/tmp/mock-msgs.log").read()
        check("追问：回答时带上了最初的问题作为上下文", "最初的问题：猫为什么会呼噜" in log)
        ta = await pg.input_value("#sh-ans")
        check("追问：答案没有 Markdown 符号", ta and not MD.search(ta), ta[:60])
        await pg.go_back(); await pg.wait_for_timeout(500)
        check("导航：在问题之间跳过后，返回一次就回到列表", not await pg.query_selector(".sheet"))

        # 一叠卡片
        stack = pg.locator(".stack", has_text="猫为什么会呼噜").first
        check("火花：有追问的问题显示成一叠卡片", await stack.count() == 1)
        await stack.locator("[data-deck]").click(); await pg.wait_for_timeout(300)
        check("火花：展开后看到追问", await stack.locator(".fcard").count() >= 1)

        # ---------- 贴进来的 Markdown 被清理 ----------
        await pg.locator(".card", has_text="炒青菜").first.click(); await pg.wait_for_selector("#sh-ans")
        await pg.evaluate("""() => { const ta = document.querySelector('#sh-ans'); const dt = new DataTransfer();
          dt.setData('text/plain', '**外部AI**说：\\n## 原因\\n- 高温'); ta.focus();
          ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
        v = await pg.input_value("#sh-ans")
        check("粘贴：别的 AI 的 Markdown 被清理", "外部AI" in v and not MD.search(v), v)
        await pg.click("#sh-close"); await pg.wait_for_timeout(400)

        # ---------- 长按换分类（连同追问）----------
        await long_press(pg, pg.locator(".card", has_text="猫为什么会呼噜").first)
        check("长按：弹出换分类", await pg.locator(".move-sheet").count() == 1)
        target = (await pg.locator(".mv >> nth=3").inner_text()).strip()
        await pg.locator(".mv >> nth=3").click(); await pg.wait_for_timeout(800)
        check("长按：问题和追问一起移过去", "共" in await pg.inner_text("#toast"), await pg.inner_text("#toast"))

        # ---------- 左侧抽屉 ----------
        await pg.click("#menu-btn"); await pg.wait_for_timeout(300)
        check("抽屉：☰ 打开分类抽屉", await pg.eval_on_selector("#drawer", "e => e.classList.contains('open')"))
        await pg.locator(".dr-list .dr-item", has_text=target.split()[-1]).click(); await pg.wait_for_timeout(400)
        check("抽屉：选分类后自动收起并切换", target.split()[-1] in await pg.inner_text("#now-viewing"))
        check("抽屉：该分类下能看到移过去的问题", await pg.locator(".card", has_text="猫为什么会呼噜").count() == 1)

        # 改分类名
        await pg.click("#menu-btn"); await pg.wait_for_timeout(300)
        await long_press(pg, pg.locator(".dr-list .dr-item", has_text=target.split()[-1]))
        await pg.fill(".sheet input[name=name]", "测试改名"); await pg.click(".sheet button.primary"); await pg.wait_for_timeout(600)
        check("分类：长按可以改名", "测试改名" in await pg.inner_text("#now-viewing"))

        # ---------- 左右滑切换页面 ----------
        await pg.goto(BASE + "/#/"); await pg.wait_for_timeout(500)
        await swipe(pg, -150)
        check("滑动：在火花往左滑到课题", await pg.evaluate("location.hash") == "#/topics")
        await swipe(pg, -150)
        check("滑动：在课题往左滑到回顾", await pg.evaluate("location.hash") == "#/review")
        await swipe(pg, 150, y=250)
        check("滑动：在回顾往右滑回课题", await pg.evaluate("location.hash") == "#/topics")
        await swipe(pg, 150)
        check("滑动：在课题往右滑回火花", await pg.evaluate("location.hash") in ("#/", ""))
        await swipe(pg, 150)
        check("滑动：在火花往右滑拉出分类抽屉", await pg.eval_on_selector("#drawer", "e => e.classList.contains('open')"))
        await swipe(pg, -150, x0=200)
        check("滑动：抽屉开着时往左滑只关抽屉、不翻页", not await pg.eval_on_selector("#drawer", "e => e.classList.contains('open')") and await pg.evaluate("location.hash") in ("#/", ""))

        # ---------- 课题 ----------
        await pg.goto(BASE + "/#/topics"); await pg.wait_for_timeout(400)
        await pg.click("#topic-add"); await pg.fill("#topic-form input[name=name]", "做一个自己的网站")
        await pg.fill("#topic-form input[name=goal]", "年底上线"); await pg.click("#topic-form button.primary"); await pg.wait_for_timeout(600)
        check("课题：新建后进入课题页", "做一个自己的网站" in await pg.inner_text("h1"))
        await no_overflow(pg, "课题页")
        check("课题：记录框里没有分类选择", await pg.locator(".capture #pick-toggle").count() == 0)
        await pg.fill(".capture textarea", "网站用什么框架？"); await pg.click("[data-mode=answer]")
        await pg.wait_for_selector("#snack.show", timeout=15000)
        tcard = pg.locator(".journey .card", has_text="网站用什么框架").first
        meta = await tcard.locator(".meta").inner_text()
        check("课题：卡片不显示「未分类」", "未分类" not in meta, meta)
        tans = await tcard.locator(".ans").inner_text()
        check("课题：答案没有 Markdown 符号", not MD.search(tans), tans[:60])
        check("课题：和火花一样标着「刚答好」", "刚答好" in await tcard.inner_text())
        await pg.click("#snack .sm"); await pg.wait_for_selector("#sh-ans")
        check("课题：点提示条能打开问题", "网站用什么框架" in await pg.input_value("#sh-text"))
        check("课题：详情页没有分类选择", await pg.locator("#sh-cat").is_hidden())
        await pg.fill("#sh-follow textarea", "部署要花钱吗？"); await pg.click("#sh-follow button.primary"); await pg.wait_for_timeout(700)
        await pg.click("#sh-close"); await pg.wait_for_timeout(400)
        tstack = pg.locator(".journey .stack", has_text="网站用什么框架").first
        check("课题：追问和火花一样叠成一叠", await tstack.count() == 1)
        await tstack.locator("[data-deck]").click(); await pg.wait_for_timeout(300)
        check("课题：展开能看到追问", await tstack.locator(".fcard", has_text="部署要花钱吗").count() == 1)

        await pg.click("#menu-btn"); await pg.wait_for_timeout(300)
        dr = await pg.inner_text("#drawer")
        check("课题：抽屉列出课题和进度", "做一个自己的网站" in dr and "/2" in dr, dr[:80])
        await pg.click("#drawer-close"); await pg.wait_for_timeout(300)

        await long_press(pg, pg.locator(".journey .card", has_text="网站用什么框架").first)
        check("课题：长按弹出「移到哪里」（课题/放回火花）", "放回火花" in await pg.inner_text(".move-sheet"))
        await pg.locator(".mv", has_text="放回火花").click(); await pg.wait_for_timeout(700)
        await pg.goto(BASE + "/#/"); await pg.wait_for_timeout(400)
        await pg.click("#menu-btn"); await pg.locator(".dr-item[data-cat=all]").click(); await pg.wait_for_timeout(300)
        check("课题：放回火花后出现在火花里", await pg.locator(".card", has_text="网站用什么框架").count() == 1)

        # ---------- 删除 ----------
        await pg.locator(".card", has_text="网站用什么框架").first.click(); await pg.wait_for_selector("#sh-del")
        await pg.click("#sh-del"); await pg.click("[data-delk='1']"); await pg.wait_for_timeout(800)
        check("删除：连同追问一起删", await pg.locator(".card", has_text="网站用什么框架").count() == 0)

        # ---------- 回顾 ----------
        await pg.goto(BASE + "/#/review"); await pg.wait_for_timeout(1500)
        check("回顾：网络图画出来了", await pg.locator("#gc").count() == 1)
        await no_overflow(pg, "回顾页")
        await pg.goto(BASE + "/#/stats"); await pg.wait_for_timeout(500)
        check("统计：柱状图画出来了", await pg.locator(".chart-wrap .bar").count() > 0)
        await no_overflow(pg, "统计页")

        # ---------- 手卷 ----------
        for t in ["手卷测试一", "手卷测试二", "手卷测试三"]:
            await pg.evaluate(f"fetch('/api/questions',{{method:'POST',headers:{{'content-type':'application/json'}},body:JSON.stringify({{text:'{t}'}})}})")
        await pg.goto(BASE + "/#/"); await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.click("#menu-btn"); await pg.locator(".dr-item[data-cat=all]").click(); await pg.wait_for_timeout(400)
        roll = pg.locator(".roll:not(.single)").first
        check("手卷：同一天的问题排成一卷", await roll.count() == 1 and await roll.locator(".roll-item").count() >= 3)
        await roll.scroll_into_view_if_needed(); bb = await roll.bounding_box()
        y = bb["y"] + bb["height"] / 2
        await pg.evaluate("document.querySelector('.roll:not(.single)').scrollLeft = 0"); await pg.wait_for_timeout(200)
        await swipe(pg, -200, y=y); await pg.wait_for_timeout(500)
        check("手卷：在卷上横滑不会切页面", route_ok := (await pg.evaluate("location.hash")) in ("", "#/"))
        await pg.evaluate("const r=document.querySelector('.roll:not(.single)'); r.scrollLeft = r.scrollWidth"); await pg.wait_for_timeout(500)
        pos = await pg.locator(".roll-pos").first.inner_text()
        check("手卷：右上角显示第几张", pos.split("/")[0].strip() == pos.split("/")[1].strip(), pos)
        await swipe(pg, -200, y=y); await pg.wait_for_timeout(700)
        check("手卷：卷到头再滑，才切到课题", "topics" in await pg.evaluate("location.hash"))
        await pg.goto(BASE + "/#/"); await pg.wait_for_timeout(500)

        # ---------- 开窗 ----------
        await pg.goto(BASE + "/#/"); await pg.wait_for_timeout(500)
        await pg.click("#open-win"); await pg.wait_for_timeout(1200)
        check("开窗：打开后出现番茄钟和「该去实践了」", await pg.locator(".win #win-time").count() == 1 and "实践" in await pg.inner_text(".win"))
        check("开窗：主界面被清屏", await pg.evaluate("document.body.classList.contains('window-open')"))
        await pg.fill("#todo-in", "测试待办一"); await pg.press("#todo-in", "Enter"); await pg.wait_for_timeout(600)
        check("开窗：能加待办", await pg.locator(".win .todo", has_text="测试待办一").count() == 1)
        check("开窗：第一条待办自动成为「正在做」", "测试待办一" in await pg.inner_text("#win-focus"))
        await pg.locator(".win .todo", has_text="测试待办一").locator("[data-todo-focus]").click(); await pg.wait_for_timeout(300)
        off = "测试待办一" not in await pg.inner_text("#win-focus")
        await pg.locator(".win .todo", has_text="测试待办一").locator("[data-todo-focus]").click(); await pg.wait_for_timeout(300)
        check("开窗：再点一下取消/设为正在做", off and "测试待办一" in await pg.inner_text("#win-focus"))
        t0 = await pg.inner_text("#win-time")
        await pg.click("#win-go"); await pg.wait_for_timeout(2300)
        t1 = await pg.inner_text("#win-time")
        check("开窗：番茄钟开始倒计时", t0 != t1, f"{t0} -> {t1}")
        await pg.click(".win", position={"x": 5, "y": 300}); await pg.click("#win-go"); await pg.wait_for_timeout(1500)
        t2 = await pg.inner_text("#win-time")
        await pg.wait_for_timeout(1200)
        check("开窗：暂停后不再走", t2 == await pg.inner_text("#win-time"))
        await pg.locator(".win .todo", has_text="测试待办一").locator("[data-todo-done]").click(); await pg.wait_for_timeout(600)
        check("开窗：勾选完成", await pg.locator(".win .todo.done", has_text="测试待办一").count() == 1)
        await pg.reload(); await pg.wait_for_timeout(1500)
        check("开窗：刷新后待办还在（存到数据库）", await pg.locator(".win .todo.done", has_text="测试待办一").count() == 1)
        await pg.locator(".win .todo", has_text="测试待办一").locator("[data-todo-del]").click(); await pg.wait_for_timeout(600)
        check("开窗：删除待办", await pg.locator(".win .todo", has_text="测试待办一").count() == 0)
        await no_overflow(pg, "开窗")
        await pg.click("#win-reset"); await pg.click("#win-close"); await pg.wait_for_timeout(1000)
        check("开窗：关窗回到主页", await pg.locator(".win").count() == 0 and await pg.locator("#open-win").count() == 1)

        check("整个过程没有脚本报错", not errors, "; ".join(errors[:3]))
        await b.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n共 {len(results)} 项，通过 {passed} 项，失败 {len(results) - passed} 项")
    sys.exit(0 if passed == len(results) else 1)

asyncio.run(main())
