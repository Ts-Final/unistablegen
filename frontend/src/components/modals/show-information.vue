<script lang="ts" setup>
/** 通用信息 modal（对应 sv 的 showInformation.vue） */
import SimpleModal from '@components/modals/simple-modal.vue'
import AButton2 from '@components/a-elements/a-button2.vue'
import { closeModal } from '@kolirt/vue-modal'

withDefaults(
  defineProps<{
    /** 允许 html（和 sv 的 confirmModal 一样用 v-html 渲染） */
    msg: string
    buttons?: { msg: string; action?: () => void }[]
  }>(),
  { buttons: undefined }
)

function run(action?: () => void) {
  action?.()
  closeModal()
}
</script>

<template>
  <simple-modal size="2">
    <div class="msg" v-html="msg"></div>
    <template #footer>
      <template v-if="buttons?.length">
        <a-button2 v-for="(b, i) in buttons" :key="i" :msg="b.msg" @click="run(b.action)" />
      </template>
      <a-button2 v-else msg="ok" @click="closeModal()" />
    </template>
  </simple-modal>
</template>

<style scoped>
.msg {
  text-align: center;
  line-height: 1.6;
  user-select: text;
  word-break: break-word;
}
</style>
