<script setup lang="ts">
/**
 * 启动流程页（对应 sv 的 pre-init-page.vue + loading.css）。
 * 把 Preinit 里的每个阶段列出来，卡住的时候一眼能看出卡在哪。
 * 和 sv 一样不接受任何 props。
 * */
import { computed } from 'vue'
import { Preinit, type StageKey } from '@core/misc/preinit.ts'

const rows = computed(() =>
  (Object.keys(Preinit.stages) as StageKey[]).map((k) => ({
    key: k,
    label: Preinit.labels[k],
    state: Preinit.stages[k],
    display: Preinit.text[Preinit.stages[k]]
  }))
)
</script>

<template>
  <div class="preinit-wrapper">
    <div class="preinit">
      <div class="preinit-title">
        <div>unistablegen</div>
        <div>loading...</div>
      </div>
      <div class="load-stages">
        <div class="load-header">Load Progress</div>
        <template v-for="r in rows" :key="r.key">
          <div>{{ r.label }}</div>
          <div :class="`stage-${r.state}`">{{ r.display }}</div>
        </template>
      </div>
      <div class="hint">如果在某个阶段一直卡住说明大概率是出bug了。请检查控制台。</div>
    </div>
  </div>
</template>

<style scoped>
/* 沿用 sv 的 loading.css */
.preinit-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  left: 0;
  top: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}
.preinit {
  display: flex;
  flex-direction: column;
  text-align: center;
  align-items: center;
  gap: 20px;
}
.preinit-title {
  margin-bottom: 50px;
  font-size: 1.2rem;
}
.load-stages {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: min-content;
  text-wrap: nowrap;
  gap: 0 20px;
}
.load-header {
  font-weight: bold;
  font-size: 1.2rem;
  grid-column: span 2;
  padding-bottom: 25px;
  margin-bottom: 25px;
  border-bottom: 2px solid #b8dcee;
}
.load-stages > div:not(.load-header) {
  text-align: left;
}
.load-stages > div:nth-child(even) {
  text-align: right;
}
.stage-pending {
  color: #3b4652;
}
.stage-loading {
  color: gold;
}
.stage-done {
  color: #8bff66;
}
.stage-failed {
  color: crimson;
}
.hint {
  color: #8996a4;
  font-size: 0.85rem;
  max-width: 30rem;
}
</style>
