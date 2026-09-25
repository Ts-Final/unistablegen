<script lang="ts" setup>
const props = defineProps<{
  min?: number | string
  max?: number | string
  step?: number | string
}>()

const model = defineModel<number>({ required: true })

function clamp(value: number): number {
  let clamped = value
  if (props.min !== undefined) clamped = Math.max(Number(props.min), clamped)
  if (props.max !== undefined) clamped = Math.min(Number(props.max), clamped)
  return clamped
}

function handleInput(e: Event) {
  const input = e.target as HTMLInputElement
  const rawValue = input.value

  if (rawValue === '') {
    input.placeholder = String(model.value)
    return
  }

  const num = Number(rawValue)
  if (!isNaN(num)) {
    if (clamp(num) == num) model.value = num
  }
}

function wheel(e: WheelEvent) {
  if (e.target instanceof HTMLInputElement) {
    e.target.blur()
    const delta = Math.sign(e.deltaY)
    const step = Number(props.step ?? 1)
    model.value = clamp(model.value - delta * step)
    e.target.value = String(model.value)
    e.target.focus()
  }
}
</script>

<template>
  <input
    :value="model"
    type="number"
    :min="min"
    :max="max"
    :step="step"
    @input="handleInput"
    @wheel.passive.prevent="wheel"
  />
</template>

<style scoped>
input {
  background-color: transparent;
  outline: none;
  border: none;
  font-size: 1rem;
  line-height: 1rem;
  text-align: center;
  border-bottom: 1px solid transparent;
  box-sizing: border-box;
}
input:focus {
  border-bottom: 1px solid var(--grey);
}
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[disabled] {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
