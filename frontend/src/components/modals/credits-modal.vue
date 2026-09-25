<script lang="ts" setup>
/** Credits modal（对应 sv 的 credits-modal.vue） */
import SimpleModal from '@components/modals/simple-modal.vue'
import Credits from '@components/credits/credits.vue'
</script>

<template>
  <SimpleModal size="2" title="Credits">
    <div class="credits-wrapper">
      <Credits />
    </div>
  </SimpleModal>
</template>

<style scoped>
.credits-wrapper {
  overflow-y: auto;
  min-height: 60vh;
  max-height: 70vh;
}
</style>
