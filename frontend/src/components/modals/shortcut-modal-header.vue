<script lang="ts" setup>
/** 快捷键设置里的分组标题（对应 sv 的 shortcut-modal-header.vue） */
const { msg } = defineProps<{ msg: string }>()
</script>

<template>
  <tr class="sc-header">
    <td colspan="4">{{ msg }}</td>
  </tr>
</template>

<style scoped>
.sc-header {
  height: 2rem;
  line-height: 2rem;
  font-weight: bold;
  font-size: 1.2rem;
}
</style>
