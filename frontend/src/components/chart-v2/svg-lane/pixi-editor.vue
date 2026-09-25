<script setup lang="ts">
/** 谱面编辑画布（样式沿用 sv pixi-container）。 */
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { Chart } from '@core/chart/chart.ts'
import { DiffDrawer } from '@core/chart/drawer.ts'
import { DiffEditor } from '@core/chart/edit-drawer.ts'
import { Storage } from '@core/storage.ts'
import { EventHub } from '@core/misc/eventhub.ts'

const chart = Chart.$current
const diff = chart.diff
const container = useTemplateRef<HTMLDivElement>('pixi-container')
const drawer = new DiffDrawer(diff, { total_width: Storage.settings.track_width })
let editor: DiffEditor | null = null

onMounted(async () => {
  await drawer.init()
  const el = container.value
  if (!el) return
  el.appendChild(drawer.app.canvas)
  editor = new DiffEditor(drawer)
  editor.listen()
  diff.force_fuck()
  EventHub.dispatch('audio-time-update')
})

onUnmounted(() => {
  editor?.stop()
  drawer.stop()
  drawer.app.destroy(true, { children: true })
})

// 设置里改了轨道宽度就实时缩放画布
watch(
  () => Storage.settings.track_width,
  (w) => drawer.resize(w)
)

// 滚轮滚动时间轴（与 sv 一致：向上滚时间后退）
function on_wheel(e: WheelEvent) {
  if (e.ctrlKey || e.altKey) return
  chart.audio.pause()
  const meter = Storage.settings.meter
  const bpm = diff.bpm_of_time(chart.audio.current_ms)?.bpm ?? 120
  const step = Math.round((4 / meter) * (60 / bpm) * Sign(e.deltaY) * 1000)
  chart.seek(chart.audio.current_ms - step)
}

function Sign(v: number) {
  return v > 0 ? 1 : v < 0 ? -1 : 0
}
</script>

<template>
  <div
    ref="pixi-container"
    :style="{ width: Storage.settings.track_width + 'px' }"
    class="pixi-container"
    @wheel.prevent="on_wheel"
  />
</template>

<style>
/* 与 sv 一致：画布绝对定位在容器底部；容器作为 flex item 会被纵向拉满，
   并且会跟着窗口一起被压缩（不要给 flex-shrink: 0） */
.pixi-container {
  position: relative;
}

.chart-main .pixi-container canvas {
  position: absolute;
  bottom: 0;
}
</style>
