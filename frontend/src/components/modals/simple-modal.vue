<script lang="ts" setup>
/**
 * modal 外壳。
 * 结构、CSS 与关闭方式沿用 sv 的 simple-modal.vue：
 * v1 的库只负责把整个组件放进 `.vue-modal` 层里（slideUp + 蒙版），
 * 卡片本体就是这个 `.vue-modal-content`。
 * */
import { useSlots } from 'vue'
import { closeModal } from '@kolirt/vue-modal'

const slots = useSlots()

const props = withDefaults(
  defineProps<{
    title?: string
    showClose?: boolean
    size?: string
  }>(),
  { title: '', showClose: true, size: '2' }
)
</script>

<template>
  <div :class="`size-${props.size}`" class="vue-modal-content">
    <div v-if="props.title || props.showClose" class="vue-modal-header">
      <slot name="header">
        <h1 v-if="props.title" class="vue-modal-title">{{ props.title }}</h1>
      </slot>
      <button
        v-if="props.showClose"
        aria-label="Close"
        class="vue-modal-btn-close"
        @click="closeModal()"
      >
        &times;
      </button>
    </div>

    <div class="vue-modal-body">
      <slot></slot>
    </div>

    <div v-if="slots.footer" class="vue-modal-footer">
      <slot name="footer"></slot>
    </div>
  </div>
</template>

<style scoped>
.vue-modal-content {
  background: var(--blue-bgi);
  border-radius: 0.5rem;
  font-family: inherit;
  color: black;
  /* 内容很少的 modal 不至于缩成一条；多出来的高度给 body，footer 仍然贴底 */
  display: flex;
  flex-direction: column;
  min-height: 10rem;
}

.vue-modal-content.size-1 {
  width: 100%;
  max-width: 35vw;
}
.vue-modal-content.size-2 {
  width: 100%;
  max-width: 45vw;
}
.vue-modal-content.size-3 {
  width: 100%;
  max-width: 55vw;
}
.vue-modal-content.size-4 {
  width: 100%;
  max-width: 65vw;
}
.vue-modal-content.size-5 {
  width: 100%;
  max-width: 75vw;
}
.vue-modal-content.size-6 {
  width: 100%;
  max-width: 85vw;
}

.vue-modal-header {
  padding: 0.5rem 1rem;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #dee2e6;
  border-top-left-radius: 0.5rem;
  border-top-right-radius: 0.5rem;
  background: var(--purple-bgi);
}

.vue-modal-title {
  font-size: 1.25rem;
  font-weight: 500;
  margin: 0;
  user-select: none;
}

.vue-modal-btn-close {
  opacity: 0.5;
  width: 2rem;
  height: 2rem;
  background: transparent center/1em auto no-repeat;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: opacity 200ms ease;
  font-size: 1.8rem;
  line-height: 2rem;
}
.vue-modal-btn-close:hover {
  opacity: 1;
}

.vue-modal-body {
  padding: 1rem;
  /* 和上面的 min-height 配合：多余的高度落在 body 上 */
  flex: 1;
}

.vue-modal-footer {
  padding: 1rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  border-bottom-left-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
  border-top: 1px solid #dee2e6;
  gap: 0.25rem;
}
.vue-modal-footer > * {
  margin: 0.25rem;
}
</style>
