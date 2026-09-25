/**
 * 「检查更新」相关的类型。
 *
 * 一次 Release 里最多有两个产物（见 .github/workflows/release.yml）：
 *   - page.zip         前端页面（build/page 整个文件夹）
 *   - unistablegen.exe 服务端
 * 版本号同时写在 tag（v<前端>-<服务端>）和标题（v<前端>/<服务端>）里，
 * server 端解析标题/tag 得到发布时的两个版本，和本地版本比。
 *
 * server 负责查、负责下载，前端只负责显示和确认，所以类型放这里两边共用。
 * */

/** 一对版本号：前端页面版本 + 服务端版本 */
export interface IVersionPair {
  frontend: string
  server: string
}

/** Invoke('check-update') 的结果 */
export interface IUpdateCheck {
  /** 检查本身有没有成功（网络、仓库、release 格式都算在内） */
  ok: boolean
  /** ok = false 时的原因，可以直接显示给用户 */
  reason?: string
  /** 当前 server 是不是开发模式（开发模式前端不做自动检查） */
  dev: boolean
  /** 本地版本：前端是页面自己报的，服务端是 exe 里的 */
  current: IVersionPair
  /** 最新 Release 的版本；仓库里一个 Release 都没有时为 null */
  latest: IVersionPair | null
  /** 最新 Release 的 tag 与网页地址 */
  tag?: string
  release_url?: string
  /** 最新 Release 里有比本地新的 page.zip */
  has_frontend_update: boolean
  /** 最新 Release 里有比本地新的 exe */
  has_backend_update: boolean
  /**
   * 能不能只更新前端。
   *
   * 后端也有更新时是 false：新前端可能要用到新 exe 才有的 api，
   * 只换 page/ 会让后端缺接口，这种情况必须让用户换 exe。
   * */
  can_update_frontend: boolean
  /** page.zip 的下载直链（has_frontend_update 为 true 时才有意义） */
  page_url?: string
  /** 这次检查的时间戳(ms) */
  checked_at: number
}

/** Invoke('update-frontend') 的结果 */
export interface IUpdateResult {
  ok: boolean
  /** ok = false 时的原因，可以直接显示给用户 */
  reason?: string
  /** 换上去的前端版本 */
  version?: string
  /** 换之前的前端版本 */
  from?: string
  /**
   * 需要重启 exe 才生效。
   * 启动时就没有 page/ 目录的话，静态服务根本没挂上，换完也得重启一次。
   * */
  restart_required?: boolean
}

/**
 * server 通过 websocket 推给前端的消息。
 * 目前只有「前端页面换好了，刷新一下」这一种。
 * */
export interface IServerSocketMessage {
  type: 'frontend-updated'
  /** 换上去的前端版本 */
  version?: string
}
