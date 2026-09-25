import { Router, type Response } from "express"
import { chart_manager } from "../chart-manager.js"

const router: Router = Router()

/**
 * 列出所有谱面。走 charts/charts.json 索引（不存在则自动生成）。
 * 同时挂在 GET /api/charts 与 POST /api/all-charts 上。
 */
export function list_charts(_req: unknown, res: Response) {
  try {
    res.json(chart_manager.list())
  } catch (e) {
    console.error("[charts] 读取谱面列表失败：", e)
    res.status(500).json({ error: "failed to list charts" })
  }
}

router.get("/", list_charts)

/** 谱面数据本体 chart.json（类型为 INotes.final） */
router.get("/:id/json", (req, res) => {
  const json = chart_manager.chart_json_path(req.params.id)
  if (!json) return res.status(404).json({ error: "no such chart" })
  res.sendFile(json)
})

/** 保存谱面数据，body 就是 INotes.final */
router.post("/:id/json", (req, res) => {
  const data = req.body
  if (!data || typeof data !== "object") return res.status(400).json({ error: "invalid body" })
  if (!chart_manager.write(req.params.id, data))
    return res.status(404).json({ error: "no such chart" })
  res.json({ status: "ok" })
})

/** 谱面音频（后缀未知，靠 find） */
router.get("/:id/audio", (req, res) => {
  const audio = chart_manager.audio_path(req.params.id)
  if (!audio) return res.status(404).json({ error: "no audio found" })
  res.sendFile(audio)
})

/** 曲绘 */
router.get("/:id/bg", (req, res) => {
  const bg = chart_manager.bg_path(req.params.id)
  if (!bg) return res.status(404).json({ error: "no image found" })
  res.sendFile(bg)
})

export default router
