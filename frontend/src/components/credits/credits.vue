<script lang="ts" setup>
/**
 * Credits（对应 sv 的 credits/credits.vue）。
 * 排版照搬 sv，内容留空。
 * */
import { computed } from 'vue'
import { Storage } from '@core/storage.ts'
import { utils } from '@core/utils.ts'

const total = computed(() => utils.toTimeStr(Storage.total_used_time / 1000, 0))
</script>

<template>
  <div class="credits-list">
    <div class="credits-head">unistablegen</div>
    <div class="credits-head">Creator</div>
    <div class="credits-col">Allesta</div>
    <div class="credits-head">Special Thanks</div>
    <div class="credits-4col">
      <span>Creeper_001</span>
      <span>Deepseek大肥鱼</span>
    </div>
    <div class="credits-head">And You</div>
    <div class="credits-col">
      <div>你总计使用了 {{ total }}</div>
    </div>
  </div>
</template>

<style scoped>
.credits-list {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.credits-list > div {
  width: 100%;
}
.credits-head {
  width: 100%;
  text-align: center;
  margin-bottom: 10px;
  font-size: 1.5rem;
  text-shadow: #16b7cc 1px 1px;
  font-weight: bolder;
}
.credits-head:not(:first-child) {
  margin-top: 50px;
}
.credits-2col {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
.credits-2col > * {
  flex-basis: 50%;
}
.credits-4col {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}
.credits-4col > * {
  flex-basis: 25%;
}
.credits-col {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  justify-content: center;
}
.credits-col > * {
  flex-basis: 100%;
  text-align: center;
}
* {
  user-select: none;
  text-align: center;
  font-size: 1.1rem;
}
</style>
