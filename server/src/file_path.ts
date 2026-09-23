import { dirname, join } from 'path'
import fsp from 'fs/promises'
import path, {basename, extname} from 'node:path'
import fs from 'fs'

function get_base_path(to_be_join: string) {
  if (process.env.NODE_ENV === 'development') {
    return join(__dirname, `../../${to_be_join}`)
  } else
    return join(__dirname, to_be_join)
}

/**
 * @param p base path of the dir
 * @param name img name
 * @returns string the basename "xx.png" of the file, remember to join the P
 */
export function find_png(p: string, name: string) {
  return fs.readdirSync(p).find((f) => {
    return basename(f).includes(name) && ['.jpg', '.png', '.gif', '.webp'].includes(extname(f))
  })
}

export const file_paths = {
  skin: get_base_path('skin'),
  config: get_base_path('charts/config.json'),
  charts: get_base_path('charts'),
  module: get_base_path(''),
  external: get_base_path('external')
}

export async function folder_size(folderPath: string): Promise<number> {
  const entries = await fsp.readdir(folderPath, { withFileTypes: true })

  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(folderPath, entry.name)

      // 跳过符号链接
      if (entry.isSymbolicLink()) return 0

      if (entry.isDirectory()) {
        return folder_size(fullPath)
      }

      if (entry.isFile()) {
        const stats = await fsp.stat(fullPath)
        return stats.size
      }

      // 忽略其他类型（如 socket、FIFO 等）
      return 0
    })
  )

  return sizes.reduce((sum, size) => sum + size, 0)
}

function ensure_path(p: string) {
  const resolvedPath = path.resolve(p)
  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true })
  }
}

ensure_path(file_paths.skin)
ensure_path(file_paths.charts)
ensure_path(file_paths.external)
