<script lang="ts" setup>
import Build from '@components/credits/build.vue'
</script>

<template>
  <div class="version-wrapper">
    <Build build="1.0" d="24" m="9" title="0.1.0" y="2026">
      <div>Hello world.</div>
    </Build>
    <Build build="2" d="24" m="9" title="0.1.1" y="2026">
      <div>添加了导出png。</div>
      <div>添加了竖直方向的吸附，可以在设置中设置最大分割。</div>
      <div>添加了前端文件的自动更新。如果你访问不了github可能就有点难受了。</div>
    </Build>
  </div>
</template>

<style scoped>
.version-wrapper {
  display: flex;
  flex-direction: column-reverse;
  overflow-x: hidden;
}
</style>
