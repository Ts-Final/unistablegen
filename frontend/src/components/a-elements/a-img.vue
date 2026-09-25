<script setup lang="ts">
/**
 * 图片（对应 sv 的 a-img.vue）。
 *
 * 图片加载不出来时不显示破图，而是渲染插槽里的兜底内容 ——
 * 比如曲绘不存在时换成项目图标（见 song-info.vue）。
 * */
import { ref, watch } from 'vue'

// 两个根节点（img / 插槽），属性由下面的 v-bind="$attrs" 显式分发，
// 关掉自动继承免得 Vue 报「无法继承到 fragment 根节点」的警告
defineOptions({ inheritAttrs: false })

const props = defineProps<{ src: string }>()

/** 这张图能不能用 */
const shown = ref(true)

// 换了 src（比如重新导入了一张曲绘）就再试一次，否则会一直停在兜底图上
watch(
  () => props.src,
  () => (shown.value = true)
)
</script>

<template>
  <img v-if="shown" v-bind="$attrs" :src="src" alt="" @error="shown = false" />
  <slot v-else v-bind="$attrs"></slot>
</template>
