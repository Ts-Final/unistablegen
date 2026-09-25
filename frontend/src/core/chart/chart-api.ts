import { api } from '@core/ipc-handler.ts'
import { Storage } from '@core/storage.ts'
import type { IChartSummary, ISkinName } from '@type/ipc.ts'
import type { INotes } from '@type/note-types.ts'

/**
 * 谱面数据(chart.json)的读写。
 *
 * chart.json 走 http api（GET/POST /api/charts/:id/json），
 * 不走 sv 那套 invoke —— invoke 在本项目里只留给普通的 ipc 风格接口。
 * */
export class ChartApi {
  readonly base = '/api/charts'

  json_url(id: string) {
    return `${this.base}/${encodeURIComponent(id)}/json`
  }
  audio_url(id: string) {
    return `${this.base}/${encodeURIComponent(id)}/audio`
  }
  bg_url(id: string) {
    return `${this.base}/${encodeURIComponent(id)}/bg`
  }
  skin_url(name: ISkinName) {
    return `/api/skin/${name}`
  }

  /** 拉取谱面数据（类型为 INotes.final），失败抛异常 */
  async fetch_chart(id: string): Promise<INotes.final> {
    const r = await api.get(this.json_url(id))
    return this.normalize(r.data as Partial<INotes.final>)
  }

  /** 保存谱面数据 */
  async save_chart(id: string, data: INotes.final): Promise<void> {
    await api.post(this.json_url(id), data)
  }

  /**
   * 谱面列表。走 GET /api/charts（不再走 invoke），并且严格校验返回体：
   * 如果代理没生效（例如用 vite preview 打开却没配 preview.proxy），
   * 静态服务会把 index.html 当成 200 返回，这里就能报出可读的错误。
   * */
  async all_charts(): Promise<IChartSummary[]> {
    const r = await api.get(this.base)
    const data = r.data
    if (!Array.isArray(data)) {
      throw new Error(
        `GET /api/charts 返回的不是数组（${typeof data}）：${this.describe(data)} —— 通常是 server 没启动，或者前端没走代理。`
      )
    }
    return (data as IChartSummary[]).slice().sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
  }

  /** 一张空白 diff */
  empty_diff(name = 'Finale', num = 0): INotes.diff {
    return {
      note: [],
      hold: [],
      wide: [],
      hazard: [],
      chip: [],
      flick: [],
      timing: [{ time: 0, bpm: 120, num: 4, den: 4 }],
      meta: {
        // 名字会自动填到谱师栏（和 sv 一样）
        charter: Storage.username,
        diff_name: name,
        diff_num: num,
        rating: 1
      }
    }
  }

  /** 一张空白谱面 */
  empty_final(name = ''): INotes.final {
    return {
      song: {
        name,
        composer: '',
        perspective: 0,
        enemy: '',
        bpm: '120',
        bpm_number: 120,
        sprite: 0,
        offset: 0,
        preview: [0, 0]
      },
      diff: [this.empty_diff()],
      version: Storage.version
    }
  }

  /**
   * 补全/清理谱面数据：老文件里可能没有 wide/timing 等字段，
   * 这里统一补上，保证后续代码可以放心地直接用。
   */
  normalize(data: Partial<INotes.final> | null | undefined): INotes.final {
    const base = this.empty_final()
    if (!data || typeof data !== 'object') return base
    return {
      song: { ...base.song, ...(data.song ?? {}) },
      diff: (data.diff?.length ? data.diff : base.diff).map((d) => ({
        note: d.note ?? [],
        hold: d.hold ?? [],
        wide: d.wide ?? [],
        hazard: d.hazard ?? [],
        chip: d.chip ?? [],
        flick: d.flick ?? [],
        timing: d.timing?.length ? d.timing : [{ time: 0, bpm: 120, num: 4, den: 4 }],
        meta: { ...base.diff[0].meta, ...(d.meta ?? {}) }
      })),
      version: data.version ?? 1
    }
  }

  /** 报错时把返回体截断成一句话，方便定位 */
  private describe(data: unknown) {
    const s = typeof data === 'string' ? data : JSON.stringify(data)
    return String(s ?? '')
      .slice(0, 120)
      .replace(/\s+/g, ' ')
  }
}

/** 全局单例 */
export const chart_api = new ChartApi()
