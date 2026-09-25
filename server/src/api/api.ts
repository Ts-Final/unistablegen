import { Router, type Request, type Response } from "express"
import path from "node:path"
import fs from "node:fs"
import charts_router, { list_charts } from "./charts.js"
import skin_router from "./skin.js"
import { chart_manager } from "../chart-manager.js"
import { ask_file, open_folder } from "../file-dialog.js"
import { file_paths } from "../file_path.js"
import { browser_status } from "../open-browser.js"
import { broadcast } from "../alive.js"
import { check_update, install_frontend_update } from "../updater.js"
import type { External } from "../../../type/external.js"

/**
 * /api 下所有接口都挂在这个 router 上（index.ts 只负责 `app.use("/api", api_router)`）。
 *
 * 这里的接口都是「ipc 风格」的：前端用 Invoke(channel, args) POST 过来，
 * 路径就是 channel 名，返回值就是原来 sv 里 Invoke 的返回值。
 * 谱面数据本身（/api/charts/:id/json 等）和皮肤贴图（/api/skin/:name）在各自的 router 里。
 * */

/** 启动页 tips 的文件名（和 sv 一样放在 external/ 下） */
const TIPS_FILE = "startup-tips.json"

/** 内置 tips：external/startup-tips.json 不存在或坏掉时用它兜底 */
const DEFAULT_TIPS: External.StartUpTips = [
  "Tab 可以在「谱面信息 / 谱面编辑 / 变奏」之间切换。",
  "不选中任何物件类型时，在画布上拖动即可框选。",
  "Ctrl + 滚轮 调流速，Alt + 滚轮 调分音。",
  "右键物件可以删除它；Ctrl+C / X / V 复制、剪切、粘贴。",
  "hold：左键定头，右键加节点，最后一次左键收尾。",
  "hazard：四次左键依次定 x1、x2、y1、y2 画好四边形，再用 ease 面板调整。",
  "选中 hold 或 hazard 后会出现蓝色控制点，拖动即可调整。",
  "谱面数据保存在 charts/<id>/chart.json，索引在 charts/charts.json。",
  "皮肤贴图放在 skin/ 目录，文件名只要包含对应关键字即可，后缀随意。",
  "Ctrl+Z / Ctrl+Y 撤销与重做。"
]

/**
 * 读 external/startup-tips.json（对应 sv 的 load_external_tips）。
 * 每次请求都重新读，改完文件不用重启 server。
 */
function read_tips(): External.StartUpTips {
  const file = path.join(file_paths.external, TIPS_FILE)
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8").replace(/^\uFEFF/, "")) as unknown
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string")
      console.warn(`[tips] ${TIPS_FILE} 的内容不是字符串数组，改用内置 tips`)
    }
  } catch (e) {
    console.warn(`[tips] 读取 ${TIPS_FILE} 失败：`, e)
  }
  return DEFAULT_TIPS
}

const router: Router = Router()

/** 健康检查 */
router.post("/alive", (_req: Request, res: Response): void => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

/* ipc 风格的谱面列表（Invoke('all-charts') 会 POST 到这里） */
router.post("/all-charts", list_charts as never)
router.get("/all-charts", list_charts as never)

/** 启动页的随机提示（Invoke('get-tips')）：来自 external/startup-tips.json */
router.post("/get-tips", (_req: Request, res: Response): void => {
  res.json(read_tips())
})
router.get("/get-tips", (_req: Request, res: Response): void => {
  res.json(read_tips())
})

/** 浏览器状态：前端启动时读它，配置的浏览器没用上就弹 information modal */
router.post("/browser-status", (_req: Request, res: Response): void => {
  res.json(browser_status())
})
router.get("/browser-status", (_req: Request, res: Response): void => {
  res.json(browser_status())
})

/** 打开 skin 文件夹（缺贴图时 modal 上的按钮用） */
router.post("/open-skin-folder", (_req: Request, res: Response): void => {
  open_folder(file_paths.skin)
  res.json({ status: "ok", path: file_paths.skin })
})

/** 打开 charts 文件夹 */
router.post("/open-charts-folder", (_req: Request, res: Response): void => {
  open_folder(file_paths.charts)
  res.json({ status: "ok", path: file_paths.charts })
})

/** 把文本写到谱面文件夹（对应 sv 的 Invoke('write-file')，导出 pcd 用） */
router.post("/write-file", (req: Request, res: Response): void => {
  const { id, fname, data } = req.body ?? {}
  if (typeof fname !== "string" || typeof data !== "string")
    return void res.status(400).json({ error: "invalid body" })
  if (!chart_manager.write_file(String(id ?? ""), fname, data))
    return void res.status(404).json({ error: "no such chart" })
  console.log(`[write-file] ${id}/${fname}（${data.length} 字节）`)
  res.json({ status: "ok" })
})

/**
 * 把 base64 的二进制写到谱面文件夹（对应前端的 Invoke('write-file-b64')，导出 png 用）。
 * body.data 是不带 `data:image/png;base64,` 前缀的 base64。
 */
router.post("/write-file-b64", (req: Request, res: Response): void => {
  const { id, fname, data } = req.body ?? {}
  if (typeof fname !== "string" || typeof data !== "string")
    return void res.status(400).json({ error: "invalid body" })
  if (!chart_manager.write_file_b64(String(id ?? ""), fname, data))
    return void res.status(404).json({ error: "no such chart" })
  console.log(`[write-file-b64] ${id}/${fname}（${data.length} 字节 base64）`)
  res.json({ status: "ok" })
})

/** 在文件管理器里定位到文件（对应 sv 的 Invoke('show-file')） */
router.post("/show-file", (req: Request, res: Response): void => {
  const { id, fname } = req.body ?? {}
  chart_manager.show_file(String(id ?? ""), String(fname ?? ""))
  res.json({ status: "ok" })
})

/** 读取设置（对应 sv 的 Invoke('get-conf')，存在 charts/config.json） */
router.post("/get-conf", (_req: Request, res: Response): void => {
  if (!fs.existsSync(file_paths.config)) return void res.json(null)
  try {
    res.json(fs.readFileSync(file_paths.config, "utf-8"))
  } catch (e) {
    console.error("[get-conf] 读取失败：", e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

/** 保存设置（对应 sv 的 Invoke('save-conf')） */
router.post("/save-conf", (req: Request, res: Response): void => {
  const data = req.body?.data
  if (typeof data !== "string") return void res.status(400).json({ error: "invalid body" })
  try {
    fs.mkdirSync(path.dirname(file_paths.config), { recursive: true })
    fs.writeFileSync(file_paths.config, data, "utf-8")
  } catch (e) {
    console.error("[save-conf] 写入失败：", e)
    return void res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
  res.json({ status: "ok" })
})

/**
 * 读取 external 目录下的文件（对应 sv 的 Invoke('read-external')）。
 * 前端用它读 external/startup-tips.json 之类的可外挂文件。
 */
router.post("/read-external", (req: Request, res: Response): void => {
  const fname = typeof req.body?.fname === "string" ? path.basename(req.body.fname) : ""
  if (!fname) return void res.status(400).json({ error: "invalid fname" })
  const file = path.join(file_paths.external, fname)
  if (!fs.existsSync(file)) return void res.json(null)
  try {
    res.json(fs.readFileSync(file, "utf-8"))
  } catch (e) {
    console.error("[read-external] 读取失败：", e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

/**
 * 弹系统原生的文件选择框（对应 sv 的 Invoke('ask-song')）。
 * 文件选择全部由 server 完成，浏览器不参与。
 */
router.post("/ask-song", async (_req: Request, res: Response): Promise<void> => {
  try {
    const p = await ask_file({ title: "选择音频文件" })
    if (!p) return void res.json(null)
    res.json({ path: p, name: p.split(/[\\/]/).pop() ?? p })
  } catch (e) {
    console.error("[ask-song] 打开文件框失败：", e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

/**
 * 通用的文件选择（对应 sv 的 Invoke('ask-file')）。
 *   body: { file: [名称, 后缀1, 后缀2, ...] }
 * 返回选中的绝对路径，取消则 null。
 */
router.post("/ask-file", async (req: Request, res: Response): Promise<void> => {
  const f = req.body?.file
  if (!Array.isArray(f) || !f.length) return void res.status(400).json({ error: "invalid file" })
  const name = String(f[0] ?? "选择文件")
  const patterns = f
    .slice(1)
    .map((e: unknown) => "*." + String(e).replace(/^\*\./, "").trim())
  try {
    const p = await ask_file({
      title: name,
      filters: [{ name, patterns: patterns.length ? patterns : ["*.*"] }]
    })
    res.json(p ?? null)
  } catch (e) {
    console.error("[ask-file] 打开文件框失败：", e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

/** 以 utf-8 读取一个本地文件（对应 sv 的 Invoke('open-file-utf')），失败返回 null */
router.post("/open-file-utf", (req: Request, res: Response): void => {
  const fp = String(req.body?.path ?? "")
  if (!fp || !fs.existsSync(fp)) return void res.json(null)
  try {
    // 去掉可能的 BOM
    res.json(fs.readFileSync(fp, "utf-8").replace(/^\uFEFF/, ""))
  } catch (e) {
    console.error("[open-file-utf] 读取失败：", e)
    res.json(null)
  }
})

/** 导入曲目（对应 sv 的 Invoke('import-song')）：把音频复制成 charts/<id>/song<ext> */
router.post("/import-song", (req: Request, res: Response): void => {
  const id = String(req.body?.id ?? "").trim()
  const p = String(req.body?.path ?? "").trim()
  // id 的字符不限（sv 只要求非空且不重复），这里只挡路径穿越
  if (!p) return void res.status(400).json({ state: "failed", id, reason: "missing path" })
  res.json(chart_manager.import_song(p, id))
})

/** 导入曲绘（对应 sv 的 Invoke('import-sprite')）：把图片复制成 charts/<id>/jacket<ext> */
router.post("/import-sprite", (req: Request, res: Response): void => {
  const id = String(req.body?.id ?? "").trim()
  const p = String(req.body?.path ?? "").trim()
  if (!p) return void res.status(400).json({ state: "failed", id, reason: "missing path" })
  res.json(chart_manager.import_sprite(p, id))
})

/**
 * 检查更新（前端的「检查更新」按钮和启动时的自动检查都走这里）。
 * 前端把自己的版本号报上来，server 去 GitHub 拿最新 Release 比对，
 * 顺便告诉前端「能不能只更新前端」。
 */
router.post("/check-update", async (req: Request, res: Response): Promise<void> => {
  const fe = typeof req.body?.frontend_version === "string" ? req.body.frontend_version : ""
  try {
    res.json(await check_update(fe))
  } catch (e) {
    console.error("[check-update] 失败：", e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

/**
 * 用最新 Release 里的 page.zip 就地更新前端页面（下载 + 解压 + 换目录全在 server 做）。
 * 换完之后通过 websocket 通知所有开着的页面刷新。
 * 后端也有更新时 updater 会直接拒掉：新前端可能要用到新 exe 才有的 api。
 */
router.post("/update-frontend", async (req: Request, res: Response): Promise<void> => {
  const fe = typeof req.body?.frontend_version === "string" ? req.body.frontend_version : ""
  const result = await install_frontend_update(fe)
  if (result.ok) {
    const sent = broadcast({ type: "frontend-updated", version: result.version })
    console.log(`[update-frontend] 已通知 ${sent} 个页面刷新`)
  }
  res.json(result)
})

/* 谱面数据：/api/charts/:id/json|audio|bg */
router.use("/charts", charts_router)
/* 皮肤贴图：/api/skin/:name */
router.use("/skin", skin_router)

export default router
