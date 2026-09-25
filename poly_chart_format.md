# polymorphite 自制谱面格式分析报告

> 分析对象：`data.win`（GameMaker Studio 2 2024.14，非 YYC），核心函数 `gml_GlobalScript_load_chart`。
> 谱面数据实际存放在工作目录下的 `charts.pmb` 打包文件中，本报告同时说明如何解包/回包。

---

## 1. 谱面文件在哪

谱面不是 `data.win` 内的资源，而是外部打包文件：

- 打包文件：`charts.pmb`（zlib 压缩的自定义 bundle）
- 谱面路径规则：`ReleaseCharts/{chart_id}/chart{difficulty}.pcd`
  - `chart_id`：歌曲标识，例如 `dayglass`、`elegant`、`kuiper`、`plasma`、`prisma_tutorial`、`weekend`
  - `difficulty`：难度索引，整数，常见为 `0`~`3`（Demo 里各歌曲数量不等，见 §9）
- 事件脚本（可选）：`ReleaseCharts/{chart_id}/event_redirects.txt`
- 歌曲元数据：`files.pmb` 内的 `Files/song_information.pd`（TSV），含 `chart_id`、`offset`、`perspective`、`fmod_folder` 等

游戏中加载谱面的调用（`cc` 对象 Create 事件）：

```gml
chart = load_chart(
    GetBundleAsset(global.chart_archive,
        string("ReleaseCharts/{0}/chart{1}.pcd", play.chart_id, play.difficulty)),
    play.enemy_attack,
    play.enemy_defense);
```

---

## 2. `.pmb` 打包格式（解包 / 回包）

`.pmb` 是 zlib 压缩的缓冲区（GameMaker 的 `buffer_compress`，zlib 头 `78 9C`）。
解压后（`buffer_decompress`）的布局如下（大端序 `buffer_u64` / `buffer_u32`）：

```
偏移 0      : u64  filecount（文件数量）
偏移 8      : u64  map_size（文件索引表字节长度）
偏移 16     : 文件索引表，filecount 项，每项：
                 string filename
                 u32    file_start   （文件内容在内容区的起始偏移）
                 u32    file_length  （文件内容字节长度）
偏移 16 + map_size : 文件内容区（各文件按 file_start 顺序拼接）
```

读取时（`GetBundleAsset`）：
- `masteroffset = map_size + 16`
- 某文件内容 = 内容区从 `file_start` 起、长 `file_length` 的字节，即实际偏移 `file_start + masteroffset`

提取示例（PowerShell 已验证可用）：

```powershell
$bytes = [System.IO.File]::ReadAllBytes("charts.pmb")
$ms = New-Object System.IO.MemoryStream(,$bytes[2..($bytes.Length-1)])   # 跳过 2 字节 zlib 头
$ds = New-Object System.IO.Compression.DeflateStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
# 读取后按上表结构切出各文件即可
```

回包时用 GameMaker 的 `buffer_compress`，或者任意能生成 zlib 流的工具，按上面布局写出后再压缩。
（Demo 内还内置了 `BundlePackerHandler` 与 `scene_bundler` 打包工具，其 `write_bundle` 即按此结构生成。）

---

## 3. `.pcd` 谱面文本格式

`.pcd` 是纯文本，每行一个物件，**以行首字母区分类型**，字段用逗号 `,` 分隔。
`load_chart` 用 `string_starts_with` 判断行首前缀：

| 前缀 | 含义 | 是否被 Demo 实际使用 |
|:---:|:---|:---:|
| `n` | Note 音符 | ✅ |
| `h` | Hazard 危害带 | ✅ |
| `c` | Chip 芯片 | ✅ |
| `f` | Flick 滑动音符 | ✅ |
| `t` | Timing 变速标记 | ❌（解析但未被玩法代码消费）|
| `l` | Lock 锁定标记 | ❌（解析但未被玩法代码消费，实际谱面中无 `l,` 行）|

字段全部通过 `real()` 转成数字；除 `t,` 行外，**每行末尾通常还有 1~2 个被忽略的尾字段**
（Demo 的 `load_chart` 不读取它们，推测是编辑器留下的 hitsound/元数据，可忽略，回包时保留或删除均可）。

`load_chart` 对每个 `timing` 都会加上 `global.options.note_offset`（默认 0，见 §8），
`hold_info.start_timing` / `hold_info.end_timing` 同样加上该偏移。

---

### 3.1 Note 音符 `n,`

```
n,timing,color,type,x_pos[,end_timing,end_x,ease]
```

| 位置 | 字段 | 说明 |
|:-:|:-|:-|
| 1 | `timing` | 音符时间（毫秒，float）|
| 2 | `color` | 0 = colorless（单点/长条），1 = wide（整轨）|
| 3 | `type` | 见 §4：0=normal，1=critical，2=ex，3=hold |
| 4 | `x_pos` | 横向位置，0~100（见 §6）。wide 音符此处被强制改为 50，可忽略 |
| 5~7 | `end_timing,end_x,ease` | **仅 type=3（hold）时读取**：长条末端时间、末端 x、缓动 id（§7）|

实谱样例（来自 `dayglass/chart0.pcd`）：

```
n,2743,0,0,50,1                       # 普通音符 t=2743, x=50（尾字段 1 被忽略）
n,12686,0,3,56.25,13371,34.38,1,0     # hold：56.25 → 13371ms 时移到 34.38，ease=1（inSine）
n,72343,0,1,45.35,0                   # critical 音符
n,17571,0,2,50,0                      # ex 音符
n,136941,1,1,0,0                      # wide critical（x_pos 无效，实际按整轨判定）
```

---

### 3.2 Hazard 危害带 `h,`

```
h,start_timing,end_timing,start_x_left,end_x_left,ease_left,start_x_right,end_x_right,ease_right
```

| 字段 | 说明 |
|:-|:-|
| `start_timing` / `end_timing` | 危害带开始 / 结束时间 |
| `start_x_left` / `end_x_left` | 左边界在开始 / 结束时的 x（0~100）|
| `ease_left` | 左边界的缓动 id（§7）|
| `start_x_right` / `end_x_right` | 右边界在开始 / 结束时的 x |
| `ease_right` | 右边界的缓动 id |

危害带是一条随时间从 `[start_x_left,start_x_right]` 过渡到 `[end_x_left,end_x_right]` 的梯形区域，
左右边界各自独立缓动。玩家心脏（playerheart）x 落在区域内且未无敌时受伤。
`ease_left`/`ease_right` 同时为 0 时渲染按 2 段处理（近直线）。

实谱样例：

```
h,1371,2743,100,100,26,100,81.25,26,1
```

---

### 3.3 Chip 芯片 `c,`

```
c,timing,x_pos
```

| 字段 | 说明 |
|:-|:-|
| `timing` | 芯片到达判定线的时间 |
| `x_pos` | 芯片横坐标（0~100）|

玩家需要在芯片接近时把鼠标（玩家心脏）移动到该 x 附近（`|x_pos - 玩家xpos| <= 10`）才能收集，
随后芯片自动吸附玩家（lerp 追踪）。判定窗口见 §5。实谱样例：`c,1886,59.38,1`（尾字段 1 被忽略）。

---

### 3.4 Flick 滑动音符 `f,`

```
f,timing,dir,x_pos
```

| 字段 | 说明 |
|:-|:-|
| `timing` | 时间 |
| `dir` | 滑动方向：0 = 左滑，1 = 右滑 |
| `x_pos` | 横坐标（0~100）|

需要用鼠标朝指定方向快速甩动（`window_mouse_get_delta_x()` 超过阈值 6，且 0.5s 内）才能命中。
实谱样例：`f,24000,0,50,0`（左滑）、`f,25371,1,68.75,0`（右滑）。

---

### 3.5 Timing 变速标记 `t,`（Demo 中未生效）

```
t,timing,tempo
```

| 字段 | 说明 |
|:-|:-|
| `timing` | 时间 |
| `tempo` | 速度（BPM 数值）|

`load_chart` 会解析进 `chart_data.timings`，但 Demo 玩法代码没有任何地方消费它
（`tempo` 引用仅出现在 `ChartData`/`load_chart` 及菜单背景动画里，与谱面无关）。
Demo 的节奏/节拍来自 FMOD 事件（见 §8）。实谱样例：`t,0,175`、`t,0,140`。

---

### 3.6 Lock 锁定标记 `l,`（Demo 中未使用）

```
l,timing,is_lock,x_pos
```

`load_chart` 会解析进 `chart_data.locks`（`Lock { timing, is_lock, x_pos }`），
但 Demo 没有任何代码读取它，实际发布的谱面中也**不存在**以 `l,` 开头的行。
推测是后续版本用于“锁定玩家位置”的预留格式，自制谱可忽略。

---

## 4. Note `type` 音符类型

来自 `o_note` 的 `load_model()` 与判定代码：

| type | 名称 | 模型 | 判定窗口 | 备注 |
|:-:|:-|:-|:-|:-|
| 0 | normal | `note.gmmod` | `note_timing` | 普通音符 |
| 1 | critical | `note.gmmod`（换色）| `critical_note_timing` | 判定更严（±15ms 完美），`max_critical` 计数 |
| 2 | ex | `exnote.gmmod` | `ex_note_timing` | 宽松判定（±100ms 内都是 PERFECT）|
| 3 | hold | `note.gmmod` | `note_timing` | 长条（见 §5）|

> `color == 1`（wide）时无论 type 都用 `widenote.gmmod` 模型。

---

## 5. 判定窗口（毫秒，`dist = timing - true_time`，判定用 `-dist = true_time - timing`）

判定表定义在 `cc` Create 事件：

```
note_timing          = [[-200,-150],[-150,-100],[-100,-60],[-60,-30],[-30,30],[30,60],[60,100],[100,150],[150,999]]
critical_note_timing = [[-200,-120],[-120,-80],[-80,-40],[-40,-15],[-15,15],[15,40],[40,80],[80,120],[120,999]]
ex_note_timing       = [[-100,100],[100,999]]
flick_note_timing    = [-2,100]
chip_timing          = [-100,100]
```

| 判定 | normal / hold | critical | ex |
|:-|:-:|:-:|:-:|
| MISS（早）| -200 ~ -150 | -200 ~ -120 | — |
| GOOD（早）| -150 ~ -100 | -120 ~ -80 | — |
| GREAT（早）| -100 ~ -60 | -80 ~ -40 | — |
| PERFECT（早）| -60 ~ -30 | -40 ~ -15 | — |
| PERFECT（正中）| -30 ~ 30 | -15 ~ 15 | -100 ~ 100 |
| PERFECT（晚）| 30 ~ 60 | 15 ~ 40 | — |
| GREAT（晚）| 60 ~ 100 | 40 ~ 80 | — |
| GOOD（晚）| 100 ~ 150 | 80 ~ 120 | — |
| MISS（晚）| 150 ~ 999 | 120 ~ 999 | 100 ~ 999 |

（数值为 `true_time - timing`，负数=早，正数=晚，单位 ms。）

- **Flick**：命中窗口为「早 2ms ~ 晚 100ms」，且需正确方向动量；晚于 100ms 为 MISS。
- **Chip**：可提前约 100ms 锁定（需玩家在芯片 x 附近 10 单位内），到达判定线（`dist<=0`）且已锁定则收集；晚于 100ms 为 MISS。

---

## 5.1 Hold 长条连接逻辑

`load_chart` 在读完所有音符后，会把 **colorless 的长条**按规则连成多段：

- 单个 hold 音符的 `hold_info` = `{ start_timing, end_timing, start_x, end_x, ease }`
  （start 就是该音符自身 timing/x_pos）。
- 连接条件：**上一段末尾的 `end_timing == 下一音符的 timing` 且 `end_x == 下一音符的 x_pos`**。
- 满足即把下一音符的 `hold_info` 追加到 `hold_segments`，并把下一音符标记删除。

因此一条多段长条在谱面里被写成**一串 type=3 的音符**，每段的 `end_timing/end_x` 精确等于下一段的 `timing/x_pos`。
实谱中的多段 hold 链示例：

```
n,35914,0,3,34.38,35920,62.5,0,0
n,35920,0,3,62.5,36000,62.5,0,0
n,36000,0,3,62.5,36005,40.63,0,0
...
```

> 注意：连接逻辑只遍历 `notes.colorless`，**wide 长条不会被连成多段**。

---

## 6. `x_pos` 坐标系统

`cc` 定义了两个换算函数：

```gml
perc_to_x(arg0) = 90 + (220 * (arg0 / 100))   // 百分比 → 像素 x（90 ~ 310）
x_to_perc(arg0) = ((arg0 - 90) / 220) * 100   // 像素 x → 百分比
```

- `x_pos` 取值 **0 ~ 100**，0 = 最左（90px），50 = 正中（200px），100 = 最右（310px）。
- 玩家鼠标移动范围被 `clamp(x, 100, 300)`，对应 `xpos` 约 4.5 ~ 95.5。
- 判定线在屏幕 y = 190，音符 `y = 190 - ((dist/10) * true_scroll_speed)`，即音符从上方下落。
- wide 音符 `x_pos` 在生成时被强制为 50，判定时 `beamwidth = 220`（覆盖整条轨道），
  以玩家心脏位置为 `basex`，因此 wide 音符无视横向位置。

---

## 7. Easing 缓动表（`ease` 字段取值 0~30）

用于 hold 的 `ease` 与 hazard 的 `ease_left`/`ease_right`。是 GameMaker 内置缓动函数的索引：

| id | 函数 | id | 函数 | id | 函数 |
|:-:|:-|:-:|:-|:-:|:-|
| 0 | linear | 11 | outCirc | 22 | inExpo |
| 1 | inSine | 12 | inOutCirc | 23 | outExpo |
| 2 | outSine | 13 | inElastic | 24 | inOutExpo |
| 3 | inOutSine | 14 | outElastic | 25 | inBack |
| 4 | inCubic | 15 | inOutElastic | 26 | outBack |
| 5 | outCubic | 16 | inQuad | 27 | inOutBack |
| 6 | inOutCubic | 17 | outQuad | 28 | inBounce |
| 7 | inQuint | 18 | inOutQuad | 29 | outBounce |
| 8 | outQuint | 19 | inQuart | 30 | inOutBounce |
| 9 | inOutQuint | 20 | outQuart | | |
| 10 | inCirc | 21 | inOutQuart | | |

实谱中 hold 常用 `0/1/4/5`，hazard 常用 `26`（outBack）等。

---

## 8. 时间与偏移模型

- 音频引擎是 FMOD Studio，事件路径 `event:/charts/{fmod_folder}/{chart_id}`。
- `true_time`（毫秒）由 FMOD DSP 时钟计算：`true_time = ((samples/48000) + pause_offset) * 1000 - chart_offset`。
- 两处偏移：
  - `chart_offset = play.song.offset`（每首歌的偏移，来自 `song_information.pd`），在 FMOD 第一拍回调时设置。
  - `global.options.note_offset`（玩家“Timing Offset”校准，默认 0，范围 -500~500），`load_chart` 里加到每个音符时间上。
- 谱面里的 `t,` 变速标记不生效；实际节拍来自 FMOD 的 tempo/bar/beat 回调（`cc` 的 Other-70 事件）。
- 另有 `global.options.visual_offset`（默认 0）在选项里定义，但 Demo 的 `load_chart` 未使用。

---

## 9. 键位与玩法操作

| 物件 | 操作 |
|:-|:-|
| colorless 音符 / 长条 | 按下 A / S / D / F（65/83/68/70）任意键命中下一个无色音符；长条需按住，全部松开（且未到长条结束）会断（MISS）|
| wide 音符 | 按 SHIFT 或 SPACE |
| flick | 鼠标朝 `dir` 方向快速甩动（左=0 / 右=1）|
| chip | 移动鼠标让玩家心脏对准芯片 x 位置 |
| hazard | 避开红色区域（区域来自左右边界插值）|

辅助选项：`note_assist`（自动命中音符）、`hazard_assist`（危害不掉血）。

---

## 10. 派生数据（不是谱面内容）

`load_chart` 在读取完成后计算以下字段，**无需手工编写**：

- `chart_data.maxcombo`：无色音符、wide、chip、flick 计数（hold 多段额外计入）。
- `chart_data.damagecombo[]` 与 `chart_data.enemyhealth`：由敌人攻防与各音符权值推算出的总血量，
  `play.enemy_health = chart_data.enemyhealth`。
- `play.skill_bar_required`：由 `play.used_character.chg` 与敌人防御换算。

因此自制谱只需关心 §3 的物件行即可，血量/连击等由引擎计算。

---

## 11. 各歌曲谱面清单（Demo 实测）

从 `charts.pmb` 解包后可见：

```
ReleaseCharts/dayglass/chart0.pcd ~ chart3.pcd   (4 个难度)
ReleaseCharts/elegant/chart0.pcd ~ chart3.pcd    (4)
ReleaseCharts/kuiper/chart0.pcd ~ chart2.pcd     (3)
ReleaseCharts/plasma/chart0.pcd ~ chart3.pcd     (4)
ReleaseCharts/prisma_tutorial/chart0.pcd         (1，教程) + event_redirects.txt
ReleaseCharts/weekend/chart0.pcd ~ chart2.pcd    (3)
```

各类型行数量统计（全部谱面合计）：`n,` 约 2.6 万行，`h,` 约 2.6 万行，`c,` 约 6 千行，`f,` 约 1 千行，`t,` 19 行，`l,` 0 行。

---

## 12. `event_redirects.txt`（可选，教程/特殊事件）

格式：每行 `事件标记名,唯一事件名`，逗号分隔。加载谱面时读取：

```gml
// load_event_redirects
str = string_split(file_text_read_string(file), ",");
redir = [str[0], str[1]];           // [marker_name, unique_event]
if (str[0] == "on_load") run_unique_event(str[1]);
```

- `on_load,xxx`：进入对局立即执行 `xxx`。
- 其余条目在 FMOD 标记（marker，`name` 匹配 `str[0]`）触发时执行 `str[1]`。
- `run_unique_event` 内置了一系列 `tutorial_*` 事件（显示对话、锁定/解锁玩家、显示引导等）。

自制普通谱通常不需要此文件；教程谱 `prisma_tutorial` 使用它来编排对话引导。

---

## 13. 制作自制谱的关键结论

1. **最小可用谱面**只需按 §3 写 `n,` / `h,` / `c,` / `f,` 行；`t,`/`l,` 当前无效可忽略。
2. 时间单位是**毫秒**（float），`x_pos` 是 **0~100** 的百分比横坐标。
3. hold 长条要写成**首尾相接的 type=3 音符链**（`end_timing`/`end_x` 精确等于下一段 `timing`/`x_pos`）。
4. 每行末尾多余字段是 Demo 忽略的编辑器元数据，回包时保留或删除均可。
5. 谱面必须放进 `charts.pmb`（zlib 压缩 bundle，结构见 §2），路径 `ReleaseCharts/{chart_id}/chart{difficulty}.pcd`；
   歌曲需在 `files.pmb` 的 `Files/song_information.pd`（TSV）中登记，并匹配 FMOD 事件 `event:/charts/{fmod_folder}/{chart_id}`。
6. 全局时间偏移由「歌曲 offset + 玩家 note_offset」共同决定，谱面时间轴以 FMOD 音频为准。

---

### 附：核心数据结构（来自 `load_chart` / 构造器）

```gml
ChartData { notes:{colorless:[], wide:[]}, flicks:[], chips:[], hazards:[], timings:[], locks:[], maxcombo, damagecombo[], enemyhealth }
Note     { timing, color, type, x_pos, hold_info{}, hold_segments[] }
Hazard   { start_timing, end_timing, start_x_left, end_x_left, ease_left, start_x_right, end_x_right, ease_right }
Chip     { timing, x_pos }
Flick    { timing, dir, x_pos }
Lock     { timing, is_lock, x_pos }
Timing   { timing, tempo }
```
