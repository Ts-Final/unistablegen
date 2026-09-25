import type { External } from './external.js'

export interface ipc {
  "write-file": {
    args: {
      id: string
      fname: string
      data: string
    },
    r: void
  }
  "show-file": {
    args: {
      id: string
      fname: string
    },
    r: { status: string }
  }
  "import-song": {
    args: {
      id: string
      /** 由 ask-song 返回的本地绝对路径 */
      path: string
    }
    r: IImportSongResult
  }
  "ask-song": {
    args: {}
    /** 取消则为 null */
    r: { path: string; name: string } | null
  }
  "import-sprite": {
    args: {
      id: string
      /** 由 ask-file 返回的本地绝对路径 */
      path: string
    }
    r: IImportSpriteResult
  }
  "browser-status": {
    args: {}
    /** server 启动时是用哪个浏览器打开的页面（打 exe 之后才有意义） */
    r: IBrowserLaunch
  }
  "ask-file": {
    args: {
      /** [名称, 后缀1, 后缀2, ...]，对应 sv 的 { file: [...] } */
      file: string[]
    }
    /** 取消则为 null */
    r: string | null
  }
  "open-file-utf": {
    args: {
      path: string
    }
    /** 读不到则为 null */
    r: string | null
  }
  "all-charts": {
    args: {}
    r: IChartSummary[]
  }
  "get-chart": {
    args: {
      id: string
    }
    r: string
  }
  "get-tips": {
    args: {}
    /** 启动页的随机提示，读取 external/startup-tips.json */
    r: External.StartUpTips
  }
  "get-conf": {
    args: {}
    /** 没有存档时返回 null */
    r: string | null
  }
  "save-conf": {
    args: {
      data: string
    }
    r: void
  }
  "read-external": {
    args: {
      fname: string
    }
    /** 文件不存在时返回 null */
    r: string | null
  }
  "open-skin-folder": {
    args: {}
    r: { status: string; path: string }
  }
  "open-charts-folder": {
    args: {}
    r: { status: string; path: string }
  }
}

/**
 * 一张谱面的摘要信息，用于谱面列表。
 * 对应 server 端 charts/<id>/chart.json 里解析出来的内容。
 * */
export interface IChartSummary {
  id: string
  name: string
  composer: string
  /** 谱面的难度列表（形如 "Finale 13+"） */
  diffs: string[]
  /** 最后修改时间(ms) */
  time: number
}

/** 皮肤可用的贴图名（不含后缀，由 server 端 find 出实际文件） */
export type ISkinName = 'note' | 'exnote' | 'critical' | 'chip' | 'flickL' | 'flickR'

/** import_song 的结果（与 server/src/chart-manager.ts 的 IImportSongResult 对应，state 命名沿用 sv） */
export interface IImportSongResult {
  /** success = 导入成功；existed = 该 id 的文件夹已存在；failed = 出错 */
  state: 'success' | 'existed' | 'failed'
  id: string
  /** 复制过去的音频路径 */
  audio?: string
  /**
   * 跟着音频一起复制过来的 chart.json。
   * 没有这个字段时表示这首曲子还没有谱面数据，由**前端**初始化后再存回去
   * （对应 sv：主进程只负责复制文件，Chart.createChart 在渲染进程里建数据）。
   * */
  json?: string
  reason?: string
}

/** import_sprite 的结果（曲绘会被复制成 charts/<id>/jacket<后缀>） */
export interface IImportSpriteResult {
  state: 'success' | 'failed'
  id: string
  /** 复制过去的曲绘路径 */
  file?: string
  reason?: string
}

/**
 * server（打包后的 exe）启动浏览器时用的方式。
 * 设置里指定的浏览器用不了时会退回系统默认浏览器，并把说明放在 notice 里，
 * 前端在启动流程里读到 notice 就弹 information modal。
 * */
export interface IBrowserLaunch {
  /** configured = 用了设置里指定的；default = 系统默认浏览器 */
  used: 'configured' | 'default'
  /** 设置里填的路径（原样回显） */
  path?: string
  /** 有值就表示「配置的浏览器没用上」，内容可直接显示给用户 */
  notice?: string
}

/** charts/charts.json —— 谱面索引，第一次启动时自动生成 */
export interface IChartsIndex {
  version: number
  charts: IChartSummary[]
}


type _IpcArgs<T, K extends keyof T> =
  T[K] extends { args: infer A } ? A : never

type _IpcResult<T, K extends keyof T> =
  T[K] extends { r: infer R } ? R : never

// 核心工具类型：调用签名
export type IpcCall<T> = <K extends keyof T>(
  channel: K,
  args: _IpcArgs<T, K>
) => Promise<_IpcResult<T, K>>