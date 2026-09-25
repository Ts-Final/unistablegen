<script lang="ts" setup>
import Build from '@components/credits/build.vue'
</script>

<template>
  <div class="version-wrapper">
    <Build build="1.0" d="24" m="9" y="2026" title="0.1.0">
      <div>Hello world.</div>
    </Build>
    <Build build="2" d="24" m="9" y="2026" title="0.1.1">
      <div>

      </div>
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
