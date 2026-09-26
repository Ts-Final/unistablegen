<script lang="ts" setup>

const model = defineModel<string>({required: true})
</script>

<template>
<textarea v-model="model"
          class="a-textarea"/>
</template>

<style scoped>

textarea {
  background-image: var(--dark-bgi);
  background-size: cover;
  width: 100%;
  min-height: 3rem;
  appearance: none;
  -webkit-appearance: none;
  border: none;
  font-family: Arial, sans-serif;
  padding: 5px;
  color: #b8dcee;
  font-size: 1rem;
  resize: none;

}
</style>