<script lang="ts" setup>
import ATextInput from '@components/a-elements/a-text-input.vue'

const model = defineModel<string>()
const { name, disabled } = defineProps<{ name: string; disabled?: boolean }>()
</script>

<template>
  <div class="song-info-single">
    <div :data-disabled="disabled">{{ name }}</div>
    <a-text-input v-model.trim="model" :disabled="disabled" class="sis-input" />
  </div>
</template>

<style scoped>
.sis-input {
  border-bottom: 1px solid #b8dcee77;
  width: 90%;
}
div {
  user-select: none;
}
div[data-disabled='true'] {
  opacity: 0.6;
}
</style>
