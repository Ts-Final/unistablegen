<script setup lang="ts">
/** 时间轴 / 播放速度（样式沿用 sv fn-time；播放暂停走空格快捷键） */
import { computed } from 'vue'
import { Chart } from '@core/chart/chart.ts'
import { utils } from '@core/utils.ts'
import ARange from '@components/a-elements/a-range.vue'

const chart = Chart.$current
const { current_ms, writable_current_second, writable_play_rate, play_rate } = chart.audio.refs

const beat_str = computed(() => chart.diff.get_beat_string(current_ms.value))
const section_count = computed(() => Math.max(0, chart.diff.section_list.length - 1))
</script>

<template>
  <div class="fn-time">
    <label>
      <span class="fn-time-str1">{{ utils.toTimeStr(current_ms / 1000) }}</span>
      <span class="fn-time-str2"> /{{ utils.toTimeStr(chart.audio.length / 1000) }} </span>
      <br />
      <span class="fn-time-str1">{{ beat_str }}</span>
      <span class="fn-time-str2"> /{{ section_count }} </span>
    </label>
    <a-range v-model="writable_current_second" :max="chart.audio.length / 1000" :min="0" :step="0.01" />
    <label @click="writable_play_rate = 1">播放速度:{{ play_rate }}x</label>
    <a-range v-model="writable_play_rate" max="2" min="0.25" step="0.05" />
    <div v-if="chart.audio.audio_error.value" class="fn-time-hit-err">没有找到音频文件。</div>
  </div>
</template>

<style scoped>
input {
  width: 100%;
}

.fn-time {
  display: grid;
  grid-template-columns: 7fr 6fr;
  align-items: center;
  justify-items: center;
  gap: 15px 0;
  text-align: center;
  padding: 15px 15px 15px 10px;
  box-sizing: border-box;
}

.fn-time > input {
  background-color: transparent;
  outline: none;
  border: none;
  font-size: 1rem;
  line-height: 1rem;
  text-align: center;
  border-bottom: 1px solid transparent;
}

.fn-time > input:focus {
  border-bottom: 1px solid var(--grey);
}

.fn-time-hit-err {
  grid-column: span 2;
  text-align: center;
}

.fn-time-str1 {
  width: 9rch;
}

.fn-time-str2 {
  width: 7.2rch;
  font-size: 0.8em;
  color: gray;
}
</style>
