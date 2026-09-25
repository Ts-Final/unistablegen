/**
 * 前后端共用的设置结构。
 *
 * 前端负责读写它的内容，server 只是把它当作纯文本存进 charts/config.json，
 * 但因为这份文件是两边都打交道的产物，所以类型放在 type/ 下统一维护。
 *
 * 与 sv 不同：uni 里所有谱面的轨道尺寸一致，因此没有 max-lane 的概念，
 * pixi 画布的宽度直接由 `track_width` 决定（默认 800px），高度恒为显示屏高度。
 * */
export interface ISettings {
  /* ---- 编辑/播放 ---- */
  /** 流速 (sv 的 scale) */
  scale: number
  max_scale: number
  /** 分音 */
  meter: number
  max_meter: number

  /* ---- 画布 ---- */
  /** pixi 画布宽度（px），即整条轨道的宽度 */
  track_width: number
  /** 背景色（外框 / 底部条底色） */
  background_color: string
  /** 轨道（note 落点所在的那一条）的底色 */
  track_color: string
  /** 底部条叠在背景色上的颜色 */
  bottom_bar_color: string
  /** 底部条叠加色的透明度，0~100 */
  bottom_bar_alpha: number
  /** 判定线颜色（横贯整个画布） */
  judge_line_color: string
  /** 判定线宽度（px），0 表示不画 */
  judge_line_width: number
  /** note 贴图在轨道上的绘制宽度（px） */
  note_width: number
  /** note 系（note/ex/critical/wide/hold头）的绘制高度（px） */
  note_height: number
  /** flick 的绘制高度（px），宽度按贴图比例走 */
  flick_height: number
  /** 判定线距离画布底部的距离（px） */
  judge_offset: number
  /** 谱面时间偏移（ms），正值表示谱面整体延后 */
  offset: number

  /* ---- hazard ---- */
  hazard_color: string
  /** hazard 透明度，0~100 */
  hazard_alpha: number

  /* ---- hold ---- */
  /** hold 中间黑色连线的宽度（px） */
  hold_line_width: number

  /* ---- 显示 ---- */
  bar_or_section: boolean
  bar_from_0: boolean
  show_ticks: boolean
  show_bpm_bottom: boolean
  sprites: {
    bar_color1: string
    bar_color2: string
    bar_color3: string
    bar_color4: string
    bar_length: number
    bar_dy: number
  }

  /* ---- 编辑网格 ---- */
  /**
   * 竖直分列：把轨道横向分成几栏。
   * 0 表示不画网格、也不吸附。
   * */
  column: number
  /** 竖直分列的上限（编辑面板里的滑块/输入框顶到这个值） */
  max_column: number
  /** 网格线的颜色 */
  column_color: string

  /* ---- 谱面预览 ---- */
  /** 谱面预览（导出 png）里显示哪些部分 */
  svg_shown_parts: {
    /** 曲绘 */
    sprite: boolean
    /** 曲名 - 曲师 */
    song: boolean
    /** 难度 / 谱师 */
    diff: boolean
    /** 水印 */
    sv: boolean
    /** timing 标记（#序号 + bpm） */
    timing: boolean
    /** 小节线 */
    bar: boolean
    /** 分音 */
    tick: boolean
  }

  /* ---- 启动 ---- */
  /**
   * server 监听的端口。
   * 被占用时 server 不会退出，而是每 2 秒重试一次（期间会一直提示改这里），
   * 所以直接改这个值、等下一次重试即可，不用重启。
   * */
  port: number
  /**
   * 用哪个浏览器打开页面（打包成 exe 后由 server 启动浏览器时使用）。
   * 留空 = 用系统默认浏览器；填了但用不了会自动退回默认浏览器并在页面上提示。
   * */
  browser_path: string

  /* ---- 行为 ---- */
  /** 放置物件时的吸附间隔(ms) */
  nearest: number
  /** 小节线计算的容差(ms) */
  beat_tolerance: number
  /** 可见区间的预加载前后量(ms) */
  pooling: {
    ahead: number
    interval: number
  }
  auto_save: boolean
}

/**
 * 存档结构（与 sv 的 storages.storage_scheme 一致）。
 * 存在 charts/config.json。
 * */
export interface IStorageScheme {
  settings: ISettings
  version: number
  /** 快捷键的 json（ShortCuts.to_string()） */
  shortcut: string
  username: string
  statistics: {
    /** 累计使用时长(ms) */
    used_time: number
    /** 第一次启动的时间(ms) */
    first_open: number
  }
}
