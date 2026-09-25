import { Router } from "express"
import { file_paths, find_asset } from "../file_path.js"
import path from "node:path"
import fs from "node:fs"

const router: Router = Router()

const skin_path = file_paths.skin

/**
 * 皮肤贴图。文件名后缀不确定，所以请求里可以不带后缀：
 *   GET /api/skin/note       -> skin/note.png   (或 .jpg/.webp/...)
 *   GET /api/skin/note.png   -> skin/note.png
 * 带后缀只是给前端/pixi 提示格式用的，服务端仍以 find 的结果为准。
 * 可用的名字见 type/ipc.ts 的 ISkinName。
 */
router.get("/:name", async (req, res) => {
  // 去掉扩展名，只留资源名
  const name = path.basename(req.params.name).replace(/\.[^.]+$/, "")
  const file = find_asset(skin_path, name)
  if (!file) return res.status(404).json({ error: `skin "${name}" not found` })
  res.sendFile(path.join(skin_path, file))
})

/** 列出皮肤目录里现有的文件，方便前端提示缺了哪些 */
router.get("/", (_req, res) => {
  res.json({ path: skin_path, files: fs.readdirSync(skin_path) })
})

export default router
