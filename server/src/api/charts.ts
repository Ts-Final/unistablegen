import {Router} from "express"
import {file_paths, find_png} from "../file_path.js"
import path from "node:path"
import fs from "fs"

const router = Router()

const chart_path = file_paths.charts

router.get("/:id/bg", async (req, res) => {
  const id = req.params.id
  if (fs.existsSync(path.join(chart_path, id))) {
    // TODO: find the png/jpg/gif/... and return it
    const folder = path.join(chart_path, id)
    const png = find_png(folder, "jacket")
    if (!png) return res.status(404).send("No png found")
    res.sendFile(path.join(chart_path, id, png))
  }
  return res.status(404)
})

router.get("/:id/json", async (req, res) => {
  const id = req.params.id
  if (fs.existsSync(path.join(chart_path, id))) {
    // i wish it could be chart.usg, but finally give up on that
    res.sendFile(path.join(chart_path, id, "chart.json"))
  }
  return res.status(404)
})

export default router;