<script setup lang="ts">
/** chart-timing：变奏(timing)列表与编辑（样式沿用 sv chart-timing） */
import { computed, ref } from 'vue'
import { Chart } from '@core/chart/chart.ts'
import { GlobalStat } from '@core/globalStat.ts'
import { utils } from '@core/utils.ts'
import AButton2 from '@components/a-elements/a-button2.vue'
import ACheckbox from '@components/a-elements/a-checkbox.vue'

const chart = Chart.$current
const diff = chart.diff
const index = ref(-1)
const bpm_input = ref<HTMLInputElement>()

/** 移动模式：true 时改时间会带着物件一起移动 */
const move_inside = ref(false)
const move_after = ref(false)

const cur = computed(() =>
  index.value >= 0 && index.value < diff.timing.length ? diff.timing[index.value] : null
)

function focus(idx: number) {
  index.value = idx
  bpm_input.value?.focus()
}

const bpm = computed({
  get: () => cur.value?.bpm ?? 0,
  set: (v: number) => {
    if (!cur.value) return
    cur.value.bpm = v
    diff.update_timing_list()
    chart.mark_changed()
  }
})
const num = computed({
  get: () => cur.value?.num ?? 0,
  set: (v: number) => {
    if (!cur.value) return
    cur.value.num = Math.max(1, Math.round(v))
    diff.update_timing_list()
    chart.mark_changed()
  }
})
const den = computed({
  get: () => cur.value?.den ?? 0,
  set: (v: number) => {
    if (!cur.value) return
    cur.value.den = Math.max(1, Math.round(v))
    diff.update_timing_list()
    chart.mark_changed()
  }
})
const time = computed({
  get: () => cur.value?.time ?? 0,
  set: (v: number) => {
    if (!cur.value) return
    const delta = v - cur.value.time
    if (move_after.value) diff.push_timing_all(index.value, delta)
    else if (move_inside.value) diff.push_timing(index.value, delta)
    else cur.value.time = v
    diff.update_timing_list()
    chart.mark_changed()
  }
})

function del_timing(ix: number) {
  diff.del_timing(ix)
  index.value = -1
}
function add_timing() {
  const r = diff.add_timing({
    bpm: 120,
    num: 4,
    den: 4,
    time: Math.max(0, chart.audio.current_ms)
  })
  if (r >= 0) index.value = r
}
function switcher(t: number) {
  chart.seek(t)
  GlobalStat.refs.chart_tab.value = 2
}
function copy_timing_list() {
  navigator.clipboard.writeText(diff.timing.map((t) => `${t.time}, ${t.bpm}`).join('\n'))
}
function bpm_change(e: Event) {
  bpm.value = parseFloat((e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="timing-wrapper">
    <div class="timing-left">
      <div class="timing-list">
        <div class="timing-header">
          <div style="flex: 1">Timing List</div>
          <a-button2 class="timing-add" msg="复制timing list" @click="copy_timing_list" />
          <a-button2 class="timing-add" msg="+new Timing" @click="add_timing" />
        </div>
        <div class="timing-list-inner">
          <div
            v-for="(t, idx) in diff.timing"
            :key="idx"
            :class="index == idx ? 'chosen' : ''"
            class="timing-single"
            @click="index = idx"
            @click.ctrl.capture="switcher(t.time)"
            @contextmenu.prevent="del_timing(idx)"
          >
            <span class="timing-time">{{ utils.toTimeStr(t.time / 1000) }}</span>
            <span class="timing-bpm" @click.stop="focus(idx)">{{ t.bpm.toFixed(2) }}</span>
            <span>{{ t.num }}/{{ t.den }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="timing-right">
      <div v-if="index != -1 && cur" class="timing-editor">
        <div class="timing-index">timing #{{ index }}</div>
        <div>
          <span>Time</span>
          <input v-model.number="time" class="timing-input" min="0" type="number" />
        </div>
        <div>
          <span>BPM</span>
          <input
            ref="bpm_input"
            :value="bpm"
            class="timing-input"
            min="1"
            type="number"
            @change="bpm_change"
          />
        </div>
        <div style="display: flex; justify-content: center; align-items: center">
          <span>拍号</span>
          <div class="timing-signature">
            <input v-model.number="num" class="timing-input" min="1" type="number" />
            <div style="border: 1px solid #b8dcee"></div>
            <input v-model.number="den" class="timing-input" min="1" type="number" />
          </div>
        </div>

        <div :class="index == 0 ? 'timing-first' : ''" class="timing-delete" @click="del_timing(index)">
          删除
        </div>
        <div class="timing-move">
          <div @click="move_inside = !move_inside">
            <a-checkbox v-model="move_inside" /> 移动此timing内的所有物件
          </div>
          <div @click="move_after = !move_after">
            <a-checkbox v-model="move_after" /> 移动此timing之后的所有物件
          </div>
        </div>
      </div>
      <div v-else-if="diff.timing.length == 1" class="timing-placeholder">
        没有变奏呢。好曲（师）！
      </div>
      <div v-else-if="diff.timing.length == 0" class="timing-placeholder">
        为什么这里一个timing都没有，我代码哪里炸了？
      </div>
      <div v-else class="timing-placeholder">古希腊掌管变奏的神。</div>
    </div>
  </div>
</template>

<style scoped>
.timing-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  position: relative;
}
.timing-left {
  bottom: 0;
  margin: 50px 50px 0;
  background: var(--darker-bgi);
  box-shadow: 0 0 10px 10px #000;
  width: 50%;
}
.timing-header {
  line-height: 1.6rem;
  border-bottom: 2px solid #b8dcee;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  padding-left: 15px;
  gap: 5px;
}
.timing-add {
  border-radius: 3px;
  background: var(--purple-bgi);
  line-height: 1.6rem;
  height: 1.6rem;
  cursor: pointer;
  user-select: none;
}
.timing-list {
  padding: 15px;
  height: 100%;
}
.timing-list-inner {
  overflow-y: auto;
  max-height: calc(100% - 60px - 2rem);
  height: 100%;
}
.chosen {
  background: var(--button-hover);
}
.timing-right {
  position: absolute;
  right: 0;
  background: var(--darker-bgi);
  max-width: 35vw;
  width: 30%;
  top: calc(45% - 25vh);
  padding: 30px;
  border-radius: 15px 0 0 15px;
  height: 50vh;
  display: flex;
  justify-content: center;
  align-items: center;
}
.timing-placeholder {
  color: #3b4652;
  font-style: italic;
  text-align: center;
  position: relative;
  top: -50px;
}
.timing-editor {
  text-align: center;
}
.timing-index {
  margin-bottom: 40px;
}
.timing-input {
  border-radius: 5px 5px 0 0;
  line-height: 1.5rem;
  height: 1.4rem;
  font-size: 1rem;
  margin: 5px;
  text-align: center;
  border: none;
  border-bottom: 2px solid #000;
  background: var(--purple-bgi);
  color: #b8dcee;
  outline: none;
}
.timing-input::-webkit-inner-spin-button,
.timing-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}
.timing-signature {
  display: flex;
  flex-direction: column;
  max-width: 5rem;
  margin-left: 5px;
}
.timing-delete {
  border: 2px solid crimson;
  width: 6rem;
  height: 2rem;
  line-height: 2rem;
  left: calc(50% - 3rem);
  position: relative;
  margin-top: 25px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 15px;
}
.timing-first {
  cursor: not-allowed;
  filter: brightness(0.6);
  font-style: italic;
}
.timing-move {
  display: flex;
  flex-direction: column;
  align-items: start;
}
.timing-move > div {
  cursor: pointer;
  display: flex;
  align-items: center;
}
.timing-single {
  display: grid;
  grid-template-columns: 1fr 4fr 2fr 1fr;
  border-radius: 4px;
  transition: background-color 0.1s ease-out;
  padding: 3px;
  cursor: pointer;
  user-select: none;
}
.timing-single:hover {
  background: var(--button-hover);
}
.timing-time {
  border-left: #b8dcee 5px solid;
  padding-left: 5px;
}
.timing-bpm {
  text-align: right;
  padding-right: 15px;
  cursor: pointer;
}
</style>
