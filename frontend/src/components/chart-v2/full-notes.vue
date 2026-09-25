<script setup lang="ts">
/**
 * 整曲谱面预览（对应 sv 的 full-notes.vue）。
 *
 * 把当前难度整张画成一张 SVG：时间轴在**每一栏里从下往上**走，一栏画满就换到右边下一栏，
 * 所以不管曲子多长，图都是「又宽又矮」的一张长图。谱面预览 modal 里显示它，
 * 导出 png 也是把这张 SVG 光栅化（见 Chart.write_png）。
 *
 * 与 sv 不同：
 * - sv 的物件是按 lane（1~4 轨）表示的，uni 的 x_pos 是 0~100，所以这里直接按百分比
 *   映射到轨道宽度上，note 的宽度/高度也按「设置里的尺寸 : 轨道宽度」等比换算，
 *   这样预览和编辑器里看到的比例一致；
 * - hazard / wide / chip / flick 也一并画出来（sv 那边没有这些类型）。
 *
 * SVG 里所有长度都写死成 px（不用 rem/%）：导出 png 时这张图会被序列化后当图片加载，
 * 那种环境下根元素的字号/百分比都不一定解析得出来。
 * */
import { computed, ref } from 'vue'
import type { INotes } from '@type/note-types.ts'
import type { ISkinName } from '@type/ipc.ts'
import { Chart } from '@core/chart/chart.ts'
import { Storage, Version } from '@core/storage.ts'
import { chart_api } from '@core/chart/chart-api.ts'
import { Skin } from '@core/misc/skin.ts'
import { ease_lerp } from '@core/chart/ease.ts'

const chart = Chart.$current
const diff = chart.diff

/* ---------------- 布局参数（沿用 sv 的取值） ---------------- */

/** 预览里轨道的宽度（px）。固定值：导出图的宽度不该随设置里的轨道宽度变 */
const TRACK_PX = 400
/** 两栏之间的间隔 */
const CHART_GAP = 50
/** 整图四周的留白 */
const PADDING = 50
/** 每毫秒对应多少像素 */
const MS_TO_PX = 0.7
/** 底部信息区的高度 */
const INF_HEIGHT = 250

/**
 * 要画的时间区间。
 *
 * 起点是第一个物件的时间，**终点是音频长度**（而不是最后一个物件的时间）：
 * 尾部没有物件的那一段也要照原样画出来，预览图的长度才和整首歌对得上。
 * 只有谱面画到了音频之后（不正常的谱面）才退回到按物件算，免得那些物件被画到栏外。
 * */
const time_range = computed(() => {
  let min = Infinity
  let max = -Infinity
  for (const { obj } of diff.all_objects()) {
    min = Math.min(min, obj.time)
    max = Math.max(max, obj.time)
    const end = end_of(obj)
    if (Number.isFinite(end)) max = Math.max(max, end)
  }
  if (!Number.isFinite(min)) {
    min = 0
    max = 0
  }
  const audio = chart.audio.length
  if (Number.isFinite(audio) && audio > 0) max = Math.max(max, audio)
  return { min, max, total: Math.max(1, max - min) }
})

/** 一栏最多多高、要几栏、每栏覆盖多长时间 */
const layout = computed(() => {
  const total_px = time_range.value.total * MS_TO_PX
  // 让整图尽量接近正方形：栏高 ≈ sqrt(总高 × 栏宽)。
  // 上限 12000：再高没有意义（浏览器和 canvas 都顶不住），多出来的部分换到右边下一栏去。
  const max_height = Math.min(
    12000,
    Math.max(120, Math.floor(Math.sqrt(total_px * (CHART_GAP + TRACK_PX))))
  )
  const columns = Math.max(1, Math.ceil(total_px / max_height))
  const per_column = time_range.value.total / columns
  return {
    max_height,
    columns,
    per_column,
    width: columns * (TRACK_PX + CHART_GAP) + 2 * PADDING,
    height: INF_HEIGHT + 10 + max_height
  }
})

const inf_base = computed(() => layout.value.max_height + PADDING)
const svg_width = computed(() => layout.value.width)
const svg_height = computed(() => layout.value.height)

/** 设置里的尺寸换算到预览的尺度上（比例和编辑器里一致） */
const px_scale = computed(() => TRACK_PX / Math.max(1, Storage.settings.track_width))
const note_w = computed(() => Math.max(4, Storage.settings.note_width * px_scale.value))
const note_h = computed(() => Math.max(4, Storage.settings.note_height * px_scale.value))
const flick_h = computed(() => Math.max(4, Storage.settings.flick_height * px_scale.value))
const hold_lw = computed(() => Math.max(1, Storage.settings.hold_line_width * px_scale.value))

const parts = computed(() => Storage.settings.svg_shown_parts)

/** 没有曲绘时用它顶上（就是顶栏那个图标；sv 那边是回退到 /song.jpg） */
const APP_ICON = '/icon.png'
const jacket_ok = ref(true)
const jacket = computed(() => (jacket_ok.value ? chart_api.bg_url(chart.id) : APP_ICON))

/* ---------------- 坐标换算 ---------------- */

/** 第 col 栏（从 0 开始）轨道左边的 x */
function base_x(col: number) {
  return PADDING + col * (TRACK_PX + CHART_GAP)
}

/** 时间 -> 所在栏 */
function col_of(t: number) {
  const { columns, per_column } = layout.value
  const rel = t - time_range.value.min
  return Math.min(columns - 1, Math.max(0, Math.floor(rel / per_column)))
}

/** 时间 -> 该栏里的 y（时间越晚越靠上） */
function y_of(t: number, col: number) {
  const rel = t - time_range.value.min - col * layout.value.per_column
  return Math.round(layout.value.max_height - rel * MS_TO_PX + PADDING / 2)
}

function pos_of(t: number) {
  const col = col_of(t)
  return { col, y: y_of(t, col) }
}

/** x_pos(0~100) -> 像素 x（物件中心） */
function x_of(x_pos: number, col: number) {
  return base_x(col) + (x_pos / 100) * TRACK_PX
}

/** 第 col 栏覆盖的时间区间 [起, 止] */
function col_time(col: number): [number, number] {
  const { per_column } = layout.value
  const start = time_range.value.min + col * per_column
  return [start, start + per_column]
}

/** 物件（hold/hazard）的结束时间 */
function end_of(obj: INotes.note | INotes.hold | INotes.wide | INotes.hazard | INotes.chip | INotes.flick) {
  if ('segment' in obj && obj.segment.length) return obj.segment[obj.segment.length - 1][0]
  if ('end' in obj) return obj.end
  return obj.time
}

/* ---------------- 渲染元素 ---------------- */

interface IImageEl {
  href: string
  x: number
  y: number
  w: number
  h: number
  /** 缺贴图时的兜底颜色（用 solid rect 画），有贴图时是空串 */
  fill: string
}
interface IPathRun {
  col: number
  d: string
}

/** 贴图缺失时按 note 类型给个颜色兜底（和编辑器里的 tint 一致） */
function fallback_fill(name: ISkinName) {
  if (name === 'critical') return '#ff5555'
  if (name === 'exnote') return '#66ccff'
  return '#dddddd'
}

function img_el(name: ISkinName, x: number, y: number, w: number, h: number): IImageEl {
  return {
    href: Skin.url(name),
    x,
    y,
    w,
    h,
    fill: Skin.getTexture(name) ? '' : fallback_fill(name)
  }
}

/** note / hold 头用的是同一套贴图 */
function note_skin(type: INotes.note['type']): ISkinName {
  if (type === 1) return 'critical'
  if (type === 2) return 'exnote'
  return 'note'
}

/** 把一串采样点切成「同一栏内」的若干段折线 */
function split_runs(pts: [number, number][]): IPathRun[] {
  const runs: IPathRun[] = []
  let cur: IPathRun | null = null
  for (const [t, x] of pts) {
    const p = pos_of(t)
    const px = x_of(x, p.col).toFixed(1)
    if (cur && cur.col === p.col) cur.d += ` L ${px} ${p.y}`
    else {
      if (cur) runs.push(cur)
      cur = { col: p.col, d: `M ${px} ${p.y}` }
    }
  }
  if (cur) runs.push(cur)
  return runs
}

const note_els = computed(() => {
  const w = note_w.value
  const h = note_h.value
  return diff.note.map((n) => {
    const p = pos_of(n.time)
    return img_el(note_skin(n.type), x_of(n.x_pos, p.col) - w / 2, p.y - h / 2, w, h)
  })
})

const wide_els = computed(() => {
  const h = note_h.value
  return diff.wide.map((n) => {
    const p = pos_of(n.time)
    return img_el('note', base_x(p.col), p.y - h / 2, TRACK_PX, h)
  })
})

const chip_els = computed(() => {
  const s = note_h.value
  return diff.chip.map((n) => {
    const p = pos_of(n.time)
    return img_el('chip', x_of(n.x_pos, p.col) - s / 2, p.y - s / 2, s, s)
  })
})

const flick_els = computed(() => {
  const h = flick_h.value
  return diff.flick.map((n) => {
    const p = pos_of(n.time)
    const name: ISkinName = n.to === 0 ? 'flickL' : 'flickR'
    const tex = Skin.getTexture(name)
    const ratio = tex && tex.height ? tex.width / tex.height : 1.5
    const w = h * ratio
    return img_el(name, x_of(n.x_pos, p.col) - w / 2, p.y - h / 2, w, h)
  })
})

/** hold：黑色中轴（按 ease 采样）+ 头贴图 */
const hold_els = computed(() => {
  const w = note_w.value
  const h = note_h.value
  return diff.hold.map((hold) => {
    const pts: [number, number][] = []
    let t0 = hold.time
    let x0 = hold.x_pos
    for (const seg of hold.segment) {
      const [et, ex, ease] = seg
      const steps = Math.max(2, Math.min(48, Math.round(Math.abs(et - t0) / 16)))
      for (let i = 0; i <= steps; i++) {
        const p = i / steps
        pts.push([t0 + (et - t0) * p, ease_lerp(x0, ex, p, ease)])
      }
      t0 = et
      x0 = ex
    }
    const hp = pos_of(hold.time)
    return {
      runs: split_runs(pts),
      head: img_el('note', x_of(hold.x_pos, hp.col) - w / 2, hp.y - h / 2, w, h)
    }
  })
})

/**
 * hazard：左右两边各按自己的 ease 采样后围成多边形。
 * 跨栏时按栏切开（每栏只画落在它时间区间里的那一段），
 * 否则一条边会被画到隔壁栏上去。
 * */
const hazard_els = computed(() => {
  const out: { d: string; fill: string; alpha: number }[] = []
  const alpha = Storage.settings.hazard_alpha / 100
  for (const hz of diff.hazard) {
    const dur = Math.max(1e-6, hz.end - hz.time)
    const lx = (t: number) => ease_lerp(hz.x1, hz.y1, (t - hz.time) / dur, hz.e1)
    const rx = (t: number) => ease_lerp(hz.x2, hz.y2, (t - hz.time) / dur, hz.e2)
    const first = col_of(hz.time)
    const last = col_of(hz.end)
    for (let col = first; col <= last; col++) {
      const [ct0, ct1] = col_time(col)
      const t0 = Math.max(hz.time, ct0)
      const t1 = Math.min(hz.end, ct1)
      if (t1 < t0) continue
      const steps = Math.max(2, Math.min(64, Math.round((t1 - t0) / 16) + 2))
      let d = ''
      for (let i = 0; i <= steps; i++) {
        const t = t0 + ((t1 - t0) * i) / steps
        d += `${i === 0 ? 'M' : 'L'} ${x_of(lx(t), col).toFixed(1)} ${y_of(t, col)} `
      }
      for (let i = steps; i >= 0; i--) {
        const t = t0 + ((t1 - t0) * i) / steps
        d += `L ${x_of(rx(t), col).toFixed(1)} ${y_of(t, col)} `
      }
      out.push({ d: d + 'Z', fill: Storage.settings.hazard_color, alpha })
    }
  }
  return out
})

/* ---------------- 小节线 / timing / 分音 ---------------- */

// 派生数据（小节线、分音）可能还是打开谱面那一刻算的，预览前重算一次
diff.update_timing_list()

const bar_lines = computed(() => {
  const timing_times = diff.timing.map((t) => t.time)
  const from_0 = Storage.settings.bar_from_0
  const out: { x1: number; x2: number; y: number; ix: string }[] = []
  diff.bar_list.forEach((time, i) => {
    if (time > time_range.value.max) return
    const p = pos_of(Math.max(time, time_range.value.min))
    out.push({
      x1: base_x(p.col),
      x2: base_x(p.col) + TRACK_PX,
      y: p.y - 6,
      ix: timing_times.includes(time) ? '' : String(from_0 ? i : i + 1)
    })
  })
  return out
})

const timing_labels = computed(() => {
  const { min, max } = time_range.value
  const out: { x: number; y: number; bpm: number; ix: number }[] = []
  let start = 0
  const before = diff.timing.findLastIndex((t) => t.time < min)
  if (before >= 0) {
    // 第一栏之前就生效的 timing：贴在第一栏底部标出来
    const p = pos_of(min)
    out.push({ x: base_x(p.col) - 3, y: p.y - 6, bpm: diff.timing[before].bpm, ix: before + 1 })
    start = before + 1
  }
  for (let i = start; i < diff.timing.length; i++) {
    const t = diff.timing[i]
    if (t.time > max) break
    const p = pos_of(t.time)
    out.push({ x: base_x(p.col) - 3, y: p.y - 6, bpm: t.bpm, ix: i + 1 })
  }
  return out
})

const tick_labels = computed(() => {
  const max = time_range.value.max
  const out: { x: number; y: number; tick: number }[] = []
  for (const [time, tick] of diff.ticks) {
    if (time > max) continue
    const p = pos_of(Math.max(time, time_range.value.min))
    out.push({ x: base_x(p.col) + TRACK_PX + 3, y: p.y - 6, tick })
  }
  return out
})
</script>

<template>
  <!--
    viewBox 必须写：不写的话 CSS 的 max-width 只会缩小「视口」，里面的坐标仍是 1:1 的
    用户单位，于是第一栏右边的所有内容（后面的栏、它们的 timing/小节线、底部信息）
    在预览里全被裁掉，而且元素高度还是按原生高度算，滚动区会拖出一大片空白。
    有了 viewBox，整张图才会跟着容器等比缩放。
  -->
  <svg
    id="chart-preview-svg"
    :height="svg_height"
    :width="svg_width"
    :viewBox="`0 0 ${svg_width} ${svg_height}`"
    preserveAspectRatio="xMinYMin meet"
  >
    <rect fill="black" height="100%" width="100%" x="0" y="0" />
    <text
      v-if="parts.sv"
      :x="PADDING"
      :y="svg_height - 20"
      fill="gray"
      font-size="20"
      font-family="sans-serif"
    >
      Generated by unistablegen {{ Version.str }}
    </text>

    <!-- 每栏的底 -->
    <rect
      v-for="c in layout.columns"
      :key="'col-' + c"
      :height="layout.max_height + 30"
      :width="TRACK_PX"
      :x="base_x(c - 1)"
      fill="#131520"
      y="10"
    />

    <g v-if="parts.bar">
      <template v-for="(bar, i) in bar_lines" :key="'bar-' + i">
        <line :x1="bar.x1" :x2="bar.x2" :y1="bar.y" :y2="bar.y" stroke="red" stroke-width="2" />
        <text
          :x="bar.x1"
          :y="bar.y"
          dx="-3"
          dy="4"
          fill="white"
          font-size="13"
          font-family="sans-serif"
          text-anchor="end"
        >
          {{ bar.ix }}
        </text>
      </template>
    </g>

    <g v-if="parts.timing">
      <template v-for="(t, i) in timing_labels" :key="'timing-' + i">
        <text
          :x="t.x"
          :y="t.y"
          fill="pink"
          font-size="14"
          font-family="sans-serif"
          text-anchor="end"
        >
          #{{ t.ix }}
        </text>
        <text
          :x="t.x"
          :y="t.y"
          dy="15"
          fill="pink"
          font-size="14"
          font-family="sans-serif"
          text-anchor="end"
        >
          {{ t.bpm }}
        </text>
      </template>
    </g>

    <!-- 顺序和编辑器一致：hazard 垫在最下面，然后才是 hold / 各类音符 -->
    <g>
      <template v-for="(hz, hi) in hazard_els" :key="'hazard-' + hi">
        <path :d="hz.d" :fill="hz.fill" :fill-opacity="hz.alpha" stroke="none" />
      </template>
    </g>

    <g>
      <template v-for="(h, i) in hold_els" :key="'hold-' + i">
        <path
          v-for="(run, j) in h.runs"
          :key="'hold-body-' + i + '-' + j"
          :d="run.d"
          fill="none"
          stroke="black"
          :stroke-width="hold_lw"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <rect
          v-if="h.head.fill"
          :fill="h.head.fill"
          :height="h.head.h"
          :width="h.head.w"
          :x="h.head.x"
          :y="h.head.y"
        />
        <image
          v-else
          :height="h.head.h"
          :href="h.head.href"
          :width="h.head.w"
          :x="h.head.x"
          :y="h.head.y"
          preserveAspectRatio="none"
        />
      </template>
    </g>

    <g>
      <template v-for="(el, i) in [...wide_els, ...note_els, ...chip_els, ...flick_els]" :key="'note-' + i">
        <rect
          v-if="el.fill"
          :fill="el.fill"
          :height="el.h"
          :width="el.w"
          :x="el.x"
          :y="el.y"
        />
        <image
          v-else
          :height="el.h"
          :href="el.href"
          :width="el.w"
          :x="el.x"
          :y="el.y"
          preserveAspectRatio="none"
        />
      </template>
    </g>

    <g v-if="parts.tick">
      <text
        v-for="(t, i) in tick_labels"
        :key="'tick-' + i"
        :x="t.x"
        :y="t.y"
        dy="6"
        fill="gray"
        font-size="12"
        font-family="sans-serif"
        text-anchor="start"
      >
        {{ t.tick }}
      </text>
    </g>

    <g v-if="parts.sprite">
      <image
        :href="jacket"
        :x="PADDING"
        :y="inf_base"
        height="175"
        width="220"
        preserveAspectRatio="xMinYMid meet"
        @error="jacket_ok = false"
      />
    </g>

    <g>
      <text
        v-if="parts.song"
        :x="svg_width - PADDING"
        :y="inf_base + 75"
        fill="white"
        font-size="50"
        font-family="sans-serif"
        text-anchor="end"
      >
        {{ chart.song.name }} - {{ chart.song.composer }}
      </text>
      <text
        v-if="parts.diff"
        :x="svg_width - PADDING"
        :y="inf_base + 150"
        fill="#bbb"
        font-size="25"
        font-family="sans-serif"
        text-anchor="end"
      >
        {{ diff.meta.diff_name }} {{ diff.meta.rating }} by {{ diff.meta.charter }}
      </text>
    </g>
  </svg>
</template>
