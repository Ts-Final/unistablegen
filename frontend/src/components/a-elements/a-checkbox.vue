<script lang="ts" setup>
const m = defineModel<boolean>()
</script>

<template>
  <input v-model="m" type="checkbox" />
</template>

<style scoped>
input {
  vertical-align: center;
  align-self: center;
}
</style>
