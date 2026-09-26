<script lang="ts" setup>
import Build from '@components/credits/build.vue'
</script>

<template>
  <div class="version-wrapper">
    <Build build="1.0" d="24" m="9" title="0.1.0" y="2026">
      <div>Hello world.</div>
    </Build>
    <Build build="2" d="25" m="9" title="0.1.1" y="2026">
      <div>添加了导出png。</div>
      <div>添加了竖直方向的吸附，可以在设置中设置最大分割。</div>
      <div>添加了前端文件的自动更新。如果你访问不了github可能就有点难受了。</div>
    </Build>
    <Build build="3" d="25" m="9" title="0.1.2" y="2026">
      <template #bugs>
        <div>修复了拖动时不显示预览的问题。</div>
        <div>修复了重复选择同一note类型，不会进入选择模式的问题。</div>
      </template>
      <template #server>
        <div>添加了fetch failed时的报错记录。现在fetch failed会显示在命令行里了。</div>
      </template>
      <div>添加了给hold中段添加节点的功能。</div>
      <div>添加了使用说明。</div>
      <div>添加了更新时弹出本窗口的功能。嘻嘻。</div>
    </Build>
    <Build build="4" y="2026" m="9" d="26" title="0.1.3">
      <template #bugs>
        修复了画师名义被写成number的问题。
      </template>
      <div>添加了json导出。</div>
    </Build>
  </div>
</template>

<style scoped>
.version-wrapper {
  display: flex;
  flex-direction: column-reverse;
  overflow-x: hidden;
}
</style>
