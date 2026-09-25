<script setup lang="ts">
import { computed } from 'vue'
import { Storage } from '@core/storage.ts'
import { EventHub } from '@core/misc/eventhub.ts'
import { Chart } from '@core/chart/chart.ts'
import ARange from '@components/a-elements/a-range.vue'
import ANumberInput from '@components/a-elements/a-number-input.vue'

const chart = Chart.$current

const scale = computed({
  get: () => Storage.settings.scale,
  set: (v: number) => {
    Storage.settings.scale = v
    EventHub.dispatch('scale-changed')
  }
})
const meter = computed({
  get: () => Storage.settings.meter,
  set: (v: number) => {
    Storage.settings.meter = Math.max(1, Math.round(v))
    chart.diff.update_meter()
    EventHub.dispatch('meter-changed')
  }
})

/**
 * 竖直分列：把轨道平均分成 N 栏，编辑画布上竖着画网格，
 * pending（待放置物件）的中心吸附到栏中心；N = 0 时不画也不吸附。
 * */
const column = computed({
  get: () => Storage.settings.column,
  set: (v: number) => {
    const n = Math.max(0, Math.min(Math.round(v), Storage.settings.max_column))
    if (n === Storage.settings.column) return
    Storage.settings.column = n
    EventHub.dispatch('column-changed')
  }
})

const METERS = [4, 6, 8, 12, 16, 24, 32, 48, 64]
/** 分列的快捷档位（和分音一样一排九个） */
const COLUMNS = [0, 2, 3, 4, 5, 6, 8, 12, 16]
</script>

<template>
  <table class="table-set">
    <tbody>
      <tr>
        <td style="width: 10%">流速</td>
        <td colspan="9">
          <a-range
            v-model="scale"
            :max="Storage.settings.max_scale"
            :min="0.1"
            :step="0.1"
            style="width: 100%"
          />
        </td>
        <td style="width: 15%">
          <a-number-input v-model="scale" :max="Storage.settings.max_scale" :min="0.1" :step="0.1" />
        </td>
      </tr>
      <tr>
        <td rowspan="2">分音</td>
        <td colspan="9">
          <a-range v-model="meter" :max="Storage.settings.max_meter" :min="1" :step="1" style="width: 100%" />
        </td>
        <td>
          <a-number-input v-model="meter" :max="Storage.settings.max_meter" :min="1" :step="1" />
        </td>
      </tr>
      <tr>
        <td v-for="m in METERS" :key="m" class="meter-button" @click="meter = m">{{ m }}</td>
      </tr>
      <tr>
        <td rowspan="2">竖直分列</td>
        <td colspan="9">
          <a-range
            v-model="column"
            :max="Storage.settings.max_column"
            :min="0"
            :step="1"
            style="width: 100%"
          />
        </td>
        <td>
          <a-number-input
            v-model="column"
            :max="Storage.settings.max_column"
            :min="0"
            :step="1"
          />
        </td>
      </tr>
      <tr>
        <td v-for="c in COLUMNS" :key="c" class="meter-button" @click="column = c">{{ c }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.table-set {
  height: min-content;
}

input {
  width: 100%;
}

td {
  text-align: center;
}

.meter-button {
  text-align: center;
  cursor: pointer;
  width: calc(75% / 9);
  box-sizing: content-box;
  border: 4px solid transparent;
  transition: 0.2s linear background-color;
}

.meter-button:hover {
  background: #444;
}
</style>
