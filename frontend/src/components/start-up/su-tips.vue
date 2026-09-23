<script setup lang="ts">
import {Invoke} from "@core/ipc-handler.ts"

const tips:string[] = ["别急，正在启动……"]

Invoke("get-tips", {}).then(r => {
  tips.push(...r)
})
</script>

<template>

</template>

<style scoped>

</style>