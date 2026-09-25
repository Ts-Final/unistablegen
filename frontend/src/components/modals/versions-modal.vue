<script lang="ts" setup>
/** 版本更新日志 modal（对应 sv 的 versions-modal.vue） */
import SimpleModal from '@components/modals/simple-modal.vue'
import Versions from '@components/credits/versions.vue'
import { Version } from '@core/storage.ts'
</script>

<template>
  <SimpleModal size="4">
    <template #header> 版本更新日志 （当前版本： {{ Version.str }} </template>
    <div class="versions-wrapper">
      <Versions />
    </div>
  </SimpleModal>
</template>

<style scoped>
.versions-wrapper {
  overflow-y: auto;
  max-height: 70vh;
}
</style>
