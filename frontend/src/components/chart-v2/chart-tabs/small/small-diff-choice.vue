<script setup lang="ts">
/**
 * 小面板里的难度选择（对应 sv 的 small-diff-choice）。
 *
 * sv 用 RefreshAll.generate_key 拿一个 key，在新增/删除难度后强制重建 a-select；
 * 这里没有那套东西，key 直接由难度列表拼出来 —— 列表本身是响应式的，
 * 名字/等级一变 key 就变，a-select 缓存的选项（setup 时只算一次）才会跟着更新。
 * 显示格式和「曲目信息」里的难度下拉保持一致。
 * */
import { computed } from 'vue'
import { Chart } from '@core/chart/chart.ts'
import ASelect from '@components/a-elements/a-select.vue'

const chart = Chart.$current
const diff = chart.diff

const options = computed(() =>
  chart.diffs.map((d, i) => ({
    val: i,
    display: `${d.meta.diff_name || '???'} ${d.meta.rating}`
  }))
)

/** 难度列表（含名字与等级）的指纹，用来当 a-select 的 key */
const rkey = computed(() =>
  chart.diffs.map((d) => `${d.meta.diff_name}/${d.meta.rating}`).join('|')
)

const diff_index = computed({
  get: () => diff.diff_index.value,
  set: (v: number) => {
    diff.diff_index.value = v
  }
})
</script>

<template>
  <div class="left-diff-choice">
    <div>选择难度：</div>
    <a-select :key="rkey" v-model="diff_index" :options="options" />
  </div>
</template>

<style scoped>
.left-diff-choice {
  display: flex;
  flex-direction: row;
  gap: 10px 0;
  justify-content: space-evenly;
  width: 100%;
  white-space: nowrap;
}
:deep(.a-select-value) {
  overflow-x: hidden;
}
</style>
