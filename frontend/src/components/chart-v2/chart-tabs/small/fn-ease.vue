<script setup lang="ts">
import { computed, toRaw } from 'vue'
import type { INotes } from '@type/note-types.ts'
import { Chart } from '@core/chart/chart.ts'
import { NoteClipboard } from '@core/misc/note-clipboard.ts'
import { EASE_NAMES } from '@core/chart/ease.ts'
import { utils } from '@core/utils.ts'

const chart = Chart.$current

/** 面板只关心选中的 hold / hazard（顺带依赖 change_count，保证撤销后也会刷新） */
const holds = computed(() => {
  void chart.change_count.value
  return NoteClipboard.selected.value
    .filter((s) => s.kind === 'hold')
    .map((s) => toRaw(s.obj) as INotes.hold)
})
const hazards = computed(() => {
  void chart.change_count.value
  return NoteClipboard.selected.value
    .filter((s) => s.kind === 'hazard')
    .map((s) => toRaw(s.obj) as INotes.hazard)
})

const ease_options = EASE_NAMES.map((name, id) => ({ id, name }))

/** 选中一个以上的物件时不显示 ease 调整（一次改多条没有意义） */
const single = computed(() => NoteClipboard.selected.value.length <= 1)

function change(apply: () => void) {
  apply()
  chart.mark_changed()
}

function set_hold_ease(seg: [number, number, number], e: Event) {
  change(() => (seg[2] = Number((e.target as HTMLSelectElement).value)))
}

function set_hazard_ease(hz: INotes.hazard, which: 'e1' | 'e2', e: Event) {
  change(() => (hz[which] = Number((e.target as HTMLSelectElement).value)))
}
</script>

<template>
  <div v-if="single && (holds.length || hazards.length)" class="fn-ease">
    <div class="ease-title">ease 调整</div>

    <div v-for="(hold, hi) in holds" :key="'h' + hi" class="ease-block">
      <div class="block-title">
        hold #{{ hi }} · {{ utils.toTimeStr(hold.time / 1000) }} ({{ hold.segment.length }} 段)
      </div>
      <div v-for="(seg, si) in hold.segment" :key="si" class="ease-row">
        <span class="seg-label">第 {{ si + 1 }} 段</span>
        <select class="ease-select" :value="seg[2]" @change="set_hold_ease(seg, $event)">
          <option v-for="e in ease_options" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </div>
    </div>

    <div v-for="(hz, zi) in hazards" :key="'z' + zi" class="ease-block">
      <div class="block-title">
        hazard #{{ zi }} · {{ utils.toTimeStr(hz.time / 1000) }} ~ {{ utils.toTimeStr(hz.end / 1000) }}
      </div>
      <div class="ease-row">
        <span class="seg-label">左</span>
        <select class="ease-select" :value="hz.e1" @change="set_hazard_ease(hz, 'e1', $event)">
          <option v-for="e in ease_options" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </div>
      <div class="ease-row">
        <span class="seg-label">右</span>
        <select class="ease-select" :value="hz.e2" @change="set_hazard_ease(hz, 'e2', $event)">
          <option v-for="e in ease_options" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fn-ease {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ease-title {
  text-align: center;
}

.fn-ease-empty {
  color: #8996a4;
  font-size: 0.78rem;
  text-align: center;
}

.ease-block {
  border-radius: 4px;
  padding: 6px 8px;
}

.block-title {
  color: #b8dcee;
  font-size: 0.8rem;
  margin-bottom: 4px;
  text-align: center;
}

.ease-row {
  display: grid;
  grid-template-columns: 5rem 1fr;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}

.seg-label {
  font-size: 0.8rem;
  text-align: right;
}

.ease-select {
  background: transparent;
  border: 1px solid var(--grey);
  border-radius: 0;
  color: #b8dcee;
  font-size: 0.8rem;
  width: 100%;
  outline: none;
}

.ease-select option {
  background: #1c1c28;
  color: #b8dcee;
}
</style>
