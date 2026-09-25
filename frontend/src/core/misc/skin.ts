import { Assets, Texture } from 'pixi.js'
import type { ISkinName } from '@type/ipc.ts'
import { api } from '@core/ipc-handler.ts'
import { notify } from './notify'
import { modal } from './modal'

/** uni 需要的所有贴图名。hold 与 note 共用 note 贴图，hazard 用纯色所以不需要贴图。 */
export const SKIN_NAMES: ISkinName[] = ['note', 'exnote', 'critical', 'chip', 'flickL', 'flickR']

interface ISkinState {
  /** note 贴图的原始尺寸，用来换算其它贴图的比例 */
  BaseWidth: number
  BaseHeight: number
  status: Record<ISkinName, Texture | null>
  /** 加载失败的贴图名 */
  missing: ISkinName[]
  /** 名字 -> 实际文件名（含后缀） */
  files: Partial<Record<ISkinName, string>>
  /** skin 目录的绝对路径（由 server 告知） */
  folder: string
  url(name: ISkinName): string
  load(): Promise<boolean>
  /** 加载并检查皮肤，缺图时弹出 modal（模仿 sv 的 check_skin） */
  check_skin(): Promise<boolean>
  getTexture(name: ISkinName): Texture | null
  height(width: number): number
}

/** 在文件名列表里找 name 对应的文件：先精确匹配，再前缀，最后包含 */
function pick_file(files: string[], name: string) {
  const stem = (f: string) => f.replace(/\.[^.]+$/, '').toLowerCase()
  const lower = name.toLowerCase()
  return (
    files.find((f) => stem(f) === lower) ??
    files.find((f) => stem(f).startsWith(lower)) ??
    files.find((f) => stem(f).includes(lower))
  )
}

/**
 * 皮肤贴图管理。
 *
 * 贴图后缀不确定（png/jpg/webp...），所以先问 server 要文件列表，
 * 拿到真实文件名（带后缀）后再加载 —— pixi 需要靠后缀来挑加载器。
 * */
export const Skin: ISkinState = {
  BaseWidth: 130,
  BaseHeight: 43,
  status: {
    note: null,
    exnote: null,
    critical: null,
    chip: null,
    flickL: null,
    flickR: null
  },
  missing: [],
  files: {},
  folder: 'skin/',

  url(name: ISkinName) {
    const file = Skin.files[name]
    return file ? `/api/skin/${encodeURIComponent(file)}` : `/api/skin/${name}`
  },

  /** 加载所有必需的贴图（并发），返回是否全部加载成功 */
  async load() {
    Skin.missing.length = 0
    let raw_files: string[] = []
    try {
      const r = await api.get('/api/skin')
      raw_files = (r.data?.files ?? []) as string[]
      if (r.data?.path) Skin.folder = r.data.path as string
    } catch {
      // server 没起来的话下面每个贴图都会被记为缺失
    }

    for (const name of SKIN_NAMES) {
      const file = pick_file(raw_files, name)
      if (file) Skin.files[name] = file
      else Skin.missing.push(name)
    }

    await Promise.all(
      SKIN_NAMES.map(async (name) => {
        if (!Skin.files[name]) {
          Skin.status[name] = null
          return
        }
        try {
          const tex = (await Assets.load(Skin.url(name))) as Texture
          // note 贴图会被缩放绘制，开 mipmap + 线性过滤能明显减少锯齿和闪烁
          try {
            tex.source.autoGenerateMipmaps = true
            tex.source.scaleMode = 'linear'
            tex.source.update()
          } catch {
            /* 某些贴图改不了，忽略 */
          }
          Skin.status[name] = tex
        } catch {
          Skin.status[name] = null
          if (!Skin.missing.includes(name)) Skin.missing.push(name)
        }
      })
    )

    if (Skin.status.note) {
      Skin.BaseWidth = Skin.status.note.width
      Skin.BaseHeight = Skin.status.note.height
    }
    return Skin.missing.length === 0
  },

  /**
   * 加载皮肤并检查缺图（模仿 sv 的 check_skin）。
   * 缺图不影响继续编辑（渲染会用白块兜底），所以只是弹个 modal 提醒。
   */
  async check_skin() {
    const ok = await Skin.load()
    if (!ok) {
      notify.error(`缺少皮肤贴图：${Skin.missing.join(', ')}`)
      modal.MissingSkinModal.show({
        missing: [...Skin.missing],
        all: [...SKIN_NAMES],
        skin_path: Skin.folder
      })
    }
    return ok
  },

  getTexture(name: ISkinName): Texture | null {
    return Skin.status[name]
  },

  /** 按绘制宽度换算出贴图应有的高度（保持原始比例） */
  height(width: number) {
    return (width / Skin.BaseWidth) * Skin.BaseHeight
  }
}
