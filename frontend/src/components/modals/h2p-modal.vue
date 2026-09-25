<script lang="ts" setup>
/**
 * h2p = how to play：编辑器里的说明手册。
 *
 * 布局是左右分栏：
 * - 左侧是文章目录，和 docs 的侧边栏差不多，但**只列到「文章」这一级**，不列次级标题；
 *   每一项显示自己的 id 数字（也就是正文 v-if 用的那个数）。
 * - 右侧是正文，每篇文章一个 div，靠 `v-if="id === 自己的 id"` 决定显示哪一个。
 *
 * 正文直接写 HTML，不走 markdown。
 * 以后要加文章：往 H2P_ARTICLES 里加一条 { id, title }，再照着下面写一个 v-if 的 div。
 * */
import {ref} from 'vue'
import SimpleModal from '@components/modals/simple-modal.vue'

/** 目录。id 从 1 开始，既是左侧显示的序号，也是正文 v-if 的判据 */
const H2P_ARTICLES: { id: number; title: string }[] = [
  {id: 1, title: "导读"},
    {id: 2, title: '放置 note'},
]

/** 当前显示的文章 id */
const id = ref(1)
/** 正文滚动容器：换文章之后回到顶部 */
const body = ref<HTMLElement | null>(null)

function show(next: number) {
  if (id.value === next) return
  id.value = next
  body.value?.scrollTo({top: 0})
}
</script>

<template>
  <SimpleModal
      size="4"
      title="How to Play"
  >
    <div class="h2p">
      <nav class="h2p-nav">
        <div class="h2p-nav-title">
          但这不是搜索框（憋笑
        </div>
        <div
            v-for="a in H2P_ARTICLES"
            :key="a.id"
            :class="id === a.id ? 'h2p-nav-item chosen' : 'h2p-nav-item'"
            @click="show(a.id)"
        >
          <span class="h2p-nav-id">{{ a.id }}</span>
          <span class="h2p-nav-text">{{ a.title }}</span>
        </div>
      </nav>

      <!-- 右：正文，一篇一个 div -->
      <div ref="body" class="h2p-body">
        <div v-if="id === 1" class="h2p-article">
          <h2 class="h2p-title">导读</h2>
          <p>这是一个操作说明。我不知道写什么在这里。所以就这样吧。</p>
        </div>
        <div v-if="id === 2" class="h2p-article">
          <h2 class="h2p-title">
            放置 note
          </h2>
          <p>
            note 有以下几类：
          </p>
          <ul>
            <li>note (note单键, ex保护套, critical绝赞, wide大键)</li>
            <li>hazard红区</li>
            <li>flick滑键</li>
            <li>chip（我管这个叫bell因为我是音击吃）</li>
            <li>hold（面、蛇，随便吧）</li>
          </ul>
          具体的快捷键是，上面一排12345，下面一排qwert。如果不舒服自己改，可能以后会出这里顺序的自定义。
          <p>
            和sv一样，重复按一个note类型会进入选择模式。当然按ctrl还是会选中的。
          </p>
          <h3>摆放</h3>
          关于吸附：
          <ul>
            <li>
              纵向：位置吸附到当前分音（「分音」在右侧面板里调）；按住 <kbd>Alt</kbd> 临时不吸附。
            </li>
            <li>
              横向：吸附到「竖直分列」里每一栏的中心；分列设成 0、或按住 <kbd>Alt</kbd> 时不吸附，
              x 就是鼠标的原始位置。
            </li>
          </ul>
          <p>操作手法：</p>
          <ul>
            <li>note chip wide
              flick：左键单击就放好。（我考虑过使用左右键设置flick方向，但是意图上不好处理，没法确定你要不要删除什么尤其是在ln和红区里放右滑flick的时候）
            </li>
            <li>
              hold：左键定头，右键加节点（随便加），最后一次左键收尾。选中一个 hold 之后，
              <kbd>Shift</kbd>+左键可以添加节点，右键<b>点击节点</b>可以删除节点。
              右键点击其他地方（选中框内的其他区域）即可删除这个蛇。
            </li>
            <li>hazard：四次左键依次定四个角。</li>
          </ul>
        </div>
      </div>
    </div>
  </SimpleModal>
</template>

<style scoped>
/* 分栏：左右各自滚动，正文那一侧允许选中文字（全局是 user-select: none） */
.h2p {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 60vh;
}

.h2p-nav {
  flex: 0 0 12rem;
  min-width: 0;
  overflow-y: auto;
  border-right: 2px solid rgba(184, 220, 238, 0.35);
  padding-right: 0.75rem;
}

.h2p-nav-title {
  opacity: 0.6;
  font-size: 0.8rem;
  padding-left: 0.5rem;
  margin-bottom: 0.5rem;
}

.h2p-nav-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.h2p-nav-item:hover {
  background: rgba(184, 220, 238, 0.15);
}

.h2p-nav-item.chosen {
  background: rgba(184, 220, 238, 0.22);
  box-shadow: inset 3px 0 0 #b8dcee;
}

.h2p-nav-id {
  flex: 0 0 1.2em;
  text-align: right;
  font-size: 0.8rem;
  opacity: 0.6;
}

.h2p-nav-text {
  text-align: left;
  min-width: 0;
  word-break: break-word;
}

.h2p-body {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding-left: 1rem;
  user-select: text;
}

.h2p-article {
  text-align: left;
  line-height: 1.6;
  padding-right: 0.5rem;
}

.h2p-title {
  font-size: 1.25rem;
  font-weight: 500;
  margin: 0 0 0.75rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgba(184, 220, 238, 0.35);
}

.h2p-article h3 {
  font-size: 1rem;
  font-weight: 500;
  margin: 1.1rem 0 0.35rem;
}

.h2p-article p {
  margin: 0.35rem 0;
}

.h2p-article ul {
  margin: 0.35rem 0;
  padding-left: 1.3rem;
}

.h2p-article li {
  margin: 0.15rem 0;
}

.h2p-article code {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0.2rem;
  padding: 0 0.3rem;
  font-size: 0.9em;
}

.h2p-article kbd {
  display: inline-block;
  padding: 0 0.35em;
  border: 1px solid rgba(184, 220, 238, 0.5);
  border-radius: 0.25rem;
  background: rgba(0, 0, 0, 0.3);
  font-family: monospace;
  font-size: 0.85em;
  line-height: 1.4;
}

/* 需要单独强调的一段话 */
.h2p-note {
  background: rgba(255, 215, 0, 0.08);
  border-left: 3px solid #ffd700;
  border-radius: 0 0.25rem 0.25rem 0;
  padding: 0.35rem 0.6rem;
  opacity: 0.95;
}
</style>
