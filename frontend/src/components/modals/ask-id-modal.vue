<script lang="ts" setup>
/** 询问曲目 id（对应 sv 的 ask-id-modal.vue） */
import { computed, onMounted, ref } from 'vue'
import { closeModal, confirmModal } from '@kolirt/vue-modal'
import SimpleModal from '@components/modals/simple-modal.vue'
import AButton2 from '@components/a-elements/a-button2.vue'
import ATextInput from '@components/a-elements/a-text-input.vue'

const props = withDefaults(defineProps<{ all: string[]; def?: string }>(), { def: '' })

const pending = ref(props.def)

/** 与 sv 一致：非空且没有重名即可（不限制字符） */
const valid = computed(() => !props.all.includes(pending.value) && pending.value.length > 0)
const taken = computed(() => props.all.includes(pending.value))

function confirm() {
  if (!valid.value) return
  confirmModal(pending.value)
}

onMounted(() => {
  setTimeout(() => document.getElementById('id-input-box')?.focus(), 400)
})
</script>

<template>
  <SimpleModal :show-close="false" size="1">
    <div>请输入一个id以识别该曲目</div>
    <a-text-input
      id="id-input-box"
      v-model="pending"
      placeholder="这里输入哦"
      @keydown.enter.capture="confirm()"
    />
    <div>建议：不要使用中文或特殊字符</div>
    <div v-if="taken" class="warn">该id已存在。请换一个试试。</div>
    <template #footer>
      <a-button2 v-if="valid" msg="确定" @click="confirm()" />
      <a-button2 msg="no" @click="closeModal()" />
    </template>
  </SimpleModal>
</template>

<style scoped>
#id-input-box {
  width: 90%;
}
.warn {
  color: crimson;
  font-size: 0.85rem;
}
</style>
