# da-studio

`da-studio` 是图片标注工具集合，包含三类产物：

- 组件包：Vue 3 标注组件、比对组件、组件样式。
- 引擎包：Canvas 2D 标注控制器、图层和类型。
- Electron 应用：数据集管理、图片导入、标注、保存和导出。

## 技术栈

- Vue 3 + TypeScript
- Canvas 2D
- Tailwind CSS 3
- Vite library build
- Electron + Element Plus + SQLite

## 独立开发

环境要求：Node.js 22.12+、pnpm 10+。

```bash
pnpm install
pnpm dev              # 组件调试工作台
pnpm dev:app          # Electron 开发模式
```

构建组件包、引擎包或桌面应用：

```bash
pnpm build
pnpm build:engine
pnpm build:app
```

## 项目结构

```txt
da-studio/
  src/                         # 可复用库源码
    components/                # CanvasAnnotator、ComparisonPanel、ComparisonOverlay
    composables/               # useComparison
    engine/                    # 纯标注引擎，独立从 da-studio/engine 导出
    matcher/                   # 轨迹匹配、重采样、包围盒计算
    index.ts                   # 组件包根入口，不直接导出底层引擎类
  dev/                         # 组件调试工作台，不进入库入口
  electron/                    # Electron 桌面应用
    main/                      # BrowserWindow、IPC、SQLite、文件存储、菜单
      db/
      ipc/
      menu/
      protocols/
      storage/
    preload/                   # contextBridge 暴露给 renderer 的安全 API
    renderer/                  # Electron Vue 页面和应用样式
      assets/
      components/
      pages/
      public/
      utils/
    shared/                    # main/preload/renderer 共享类型
  scripts/
    generate-app-icons.mjs     # 从 SVG 生成 png/ico/icns 应用图标
  build/
    components/                # pnpm build 输出
    engine/                    # pnpm build:engine 输出
    app/                       # pnpm build:app 输出
```

## 构建产物

| 命令                | 产物                | 说明                                                                          |
| ------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `pnpm build:engine` | `build/engine`      | 只构建纯引擎入口 `da-studio/engine`。                                         |
| `pnpm build`        | `build/components`  | 构建组件包根入口 `da-studio` 和 `da-studio/style.css`，不直接导出底层引擎类。 |
| `pnpm build:app`    | `build/app/release` | 生成当前平台 Electron 应用安装包和解包目录。                                  |

辅助命令：

```bash
pnpm dev              # 组件调试工作台
pnpm dev:app          # Electron 开发模式
pnpm build:app:dir    # 只生成当前平台解包目录
pnpm build:app:win
pnpm build:app:mac
pnpm build:app:linux
```

`better-sqlite3` 是 native addon。稳定的跨平台发布方式是在对应平台分别打包：Windows 构建 Windows 包，macOS 构建 macOS 包，Linux 构建 Linux 包。

## 包入口

| 入口                  | 产物来源                         | 说明                                                   |
| --------------------- | -------------------------------- | ------------------------------------------------------ |
| `da-studio`           | `build/components`               | Vue 组件、组件相关类型、比对 composable、matcher API。 |
| `da-studio/engine`    | `build/engine`                   | 底层 Canvas 标注引擎类、引擎工具和引擎类型。           |
| `da-studio/style.css` | `build/components/da-studio.css` | 组件样式。                                             |

## 组件包

组件包用于在 Vue 应用里直接接入标注 UI。它不直接导出 `AnnotationController`、`ImageLayer`、`ShapeLayer`，需要底层控制器时从 `da-studio/engine` 引入。

当前标注类型包括矩形、点、折线、多边形、平滑曲线、圆形/椭圆、位图 Mask 和立方体。Mask 支持独立选取、涂抹、橡皮擦、多边形创建/反向裁剪及跨分组融合；标注列表支持按分组/工具类型组合筛选，以及单项、全部或当前筛选结果隐藏。图像亮度、对比度、饱和度可通过底栏弹窗调节，调节只影响显示。

### 安装使用

```ts
import {
  CanvasAnnotator,
  ComparisonPanel,
  ComparisonOverlay,
  DEFAULT_GROUPS,
  useComparison,
  comparableShapes,
  matchTrajectory,
  resample,
  computeBBox,
  computeOBB,
  dist,
  dist2
} from 'da-studio'
import type { Shape, Meta, Group, MatchResult, MatcherOptions } from 'da-studio'
import 'da-studio/style.css'
```

### 公开 API

| API                                  | 类型       | 说明                                                         |
| ------------------------------------ | ---------- | ------------------------------------------------------------ |
| `CanvasAnnotator`                    | Vue 组件   | 标注工具主组件。                                             |
| `ComparisonPanel`                    | Vue 组件   | 轨迹比对控制面板，支持 sticky、teleport、movable 和 offset。 |
| `ComparisonOverlay`                  | Vue 组件   | 比对结果叠加层。                                             |
| `ModeIcon` / `ToolIcon`              | Vue 组件   | 标注模式和工具图标。                                         |
| `DEFAULT_GROUPS`                     | `Group[]`  | 默认四组颜色配置。                                           |
| `useComparison()`                    | composable | 管理模板/测试图形选择、比对状态和 Worker 计算。              |
| `comparableShapes(shapes)`           | function   | 过滤可比对图形。                                             |
| `matchTrajectory(a, b, options?)`    | function   | 轨迹比对。                                                   |
| `resample(points, spacing, closed?)` | function   | 按弧长重采样。                                               |
| `computeBBox(points)`                | function   | 计算 AABB。                                                  |
| `computeOBB(points)`                 | function   | 计算 OBB。                                                   |
| `dist(a, b)` / `dist2(a, b)`         | function   | 计算点距离。                                                 |

公开类型：

```ts
import type {
  ModeType,
  InteractionMode,
  Point,
  Group,
  Shape,
  Meta,
  BBox,
  OBB,
  MatchResult,
  MatcherOptions
} from 'da-studio'
```

### 最小用例

```vue
<template>
  <CanvasAnnotator
    v-model="shapes"
    image-src="/images/demo.jpg"
    initial-mode="rect"
    interaction-mode="draw"
    @change="handleChange"
    @load="handleLoad"
    @error="handleError"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CanvasAnnotator } from 'da-studio'
import type { Meta, Shape } from 'da-studio'
import 'da-studio/style.css'

const shapes = ref<Shape[]>([])

function handleChange(nextShapes: Shape[], meta: Meta) {
  console.log(nextShapes, meta)
}

function handleLoad() {
  console.log('image loaded')
}

function handleError(error: Error) {
  console.error(error)
}
</script>
```

### 自定义工具和分组

```vue
<template>
  <CanvasAnnotator
    ref="annotatorRef"
    v-model="shapes"
    :groups="groups"
    :enabled-modes="['rect', 'polygon']"
    :readonly="readonly"
  />

  <button @click="save">保存</button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CanvasAnnotator } from 'da-studio'
import type { Group, Shape } from 'da-studio'

const annotatorRef = ref<InstanceType<typeof CanvasAnnotator> | null>(null)
const readonly = ref(false)
const shapes = ref<Shape[]>([])

const groups: Group[] = [
  {
    name: 'red',
    stroke: '#e53935',
    fill: 'rgba(229,57,53,0.12)',
    fillHover: 'rgba(229,57,53,0.04)',
    label: '红'
  },
  {
    name: 'yellow',
    stroke: '#f9a825',
    fill: 'rgba(249,168,37,0.12)',
    fillHover: 'rgba(249,168,37,0.04)',
    label: '黄'
  },
  {
    name: 'blue',
    stroke: '#1e88e5',
    fill: 'rgba(30,136,229,0.12)',
    fillHover: 'rgba(30,136,229,0.04)',
    label: '蓝'
  },
  {
    name: 'green',
    stroke: '#43a047',
    fill: 'rgba(67,160,71,0.12)',
    fillHover: 'rgba(67,160,71,0.04)',
    label: '绿'
  }
]

function save() {
  const nextShapes = annotatorRef.value?.getShapes() ?? []
  const meta = annotatorRef.value?.getMeta()
  console.log(nextShapes, meta)
}
</script>
```

### Matcher 用例

```ts
import { matchTrajectory, resample, computeBBox, computeOBB } from 'da-studio'
import type { MatcherOptions, Point } from 'da-studio'

const template: Point[] = [
  { x: 10, y: 20 },
  { x: 80, y: 42 },
  { x: 140, y: 64 }
]

const test: Point[] = [
  { x: 12, y: 21 },
  { x: 78, y: 45 },
  { x: 139, y: 67 }
]

const options: MatcherOptions = {
  spacing: 2,
  delta: 3,
  pct: 0.03,
  closed: false
}

const result = matchTrajectory(template, test, options)
const sampled = resample(template, 2)
const bbox = computeBBox(template)
const obb = computeOBB(template)

console.log(result, sampled, bbox, obb)
```

### CanvasAnnotator Props

| Prop              | 类型              | 默认值           | 说明                                           |
| ----------------- | ----------------- | ---------------- | ---------------------------------------------- |
| `imageSrc`        | `string`          | `''`             | 背景图片地址。为空时使用内置示例背景。         |
| `initialMode`     | `ModeType`        | `'rect'`         | 初始标注类型。                                 |
| `interactionMode` | `InteractionMode` | `'draw'`         | 初始交互模式，`draw` 或 `select`。             |
| `readonly`        | `boolean`         | `false`          | 只读模式。                                     |
| `modelValue`      | `Shape[]`         | `[]`             | 标注数据，支持 `v-model`。                     |
| `groups`          | `Group[]`         | `DEFAULT_GROUPS` | 分组配置，最多 4 组可用 `Alt + 1/2/3/4` 切换。 |
| `enabledModes`    | `ModeType[]`      | 全部八种标注类型 | 启用的标注类型。                               |

### CanvasAnnotator Events

| Event               | 参数                            | 说明                 |
| ------------------- | ------------------------------- | -------------------- |
| `update:modelValue` | `(shapes: Shape[])`             | `v-model` 更新。     |
| `change`            | `(shapes: Shape[], meta: Meta)` | 标注或视图状态变化。 |
| `load`              | `()`                            | 背景图片加载完成。   |
| `error`             | `(error: Error)`                | 背景图片加载失败。   |

### CanvasAnnotator Ref

| 方法                                | 返回值                                                     | 说明                                             |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `getShapes()`                       | `Shape[]`                                                  | 当前图形。                                       |
| `getMeta()`                         | `Meta`                                                     | 当前视图和工具状态。                             |
| `completeCurrent()`                 | `void`                                                     | 完成当前折线、多边形或曲线。                     |
| `loadShapes(shapes, meta)`          | `void`                                                     | 载入图形和视图状态。                             |
| `loadAnnotationState(shapes, meta)` | `void`                                                     | 载入完整标注状态并重置历史基线。                 |
| `getShortcutState()`                | `{ canUndo; canRedo; hasSelected; canComplete; canClear }` | 菜单和快捷键状态。                               |
| `engine()`                          | `AnnotationController \| null`                             | 获取底层控制器。类型从 `da-studio/engine` 引入。 |

### ComparisonPanel

```vue
<template>
  <div class="relative">
    <CanvasAnnotator ref="annotatorRef" v-model="shapes">
      <template #canvas-overlay>
        <ComparisonOverlay
          v-if="result"
          :result="result"
          :get-meta="() => annotatorRef?.getMeta() ?? defaultMeta"
        />
      </template>
    </CanvasAnnotator>

    <ComparisonPanel
      :shapes="shapes"
      :template-idx="templateIdx"
      :test-idx="testIdx"
      :result="result"
      :loading="loading"
      :teleport="false"
      :sticky="true"
      :movable="true"
      :offset="{ top: 16, right: 16 }"
      @select-template="templateIdx = $event"
      @select-test="testIdx = $event"
      @compare="compare(shapes)"
      @clear-result="clearResult"
      @clear="clear"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CanvasAnnotator, ComparisonOverlay, ComparisonPanel, useComparison } from 'da-studio'
import type { Meta, Shape } from 'da-studio'

const annotatorRef = ref<InstanceType<typeof CanvasAnnotator> | null>(null)
const shapes = ref<Shape[]>([])
const defaultMeta: Meta = { scale: 1, translateX: 0, translateY: 0, mode: '', group: '' }
const { templateIdx, testIdx, result, loading, compare, clearResult, clear } = useComparison()
</script>
```

`ComparisonPanel` Props：

| Prop          | 类型                                                               | 默认值                   | 说明                                       |
| ------------- | ------------------------------------------------------------------ | ------------------------ | ------------------------------------------ |
| `shapes`      | `Shape[]`                                                          | 必填                     | 当前标注数据。                             |
| `templateIdx` | `number \| null`                                                   | 必填                     | 模板标注索引。                             |
| `testIdx`     | `number \| null`                                                   | 必填                     | 测试标注索引。                             |
| `result`      | `MatchResult \| null`                                              | 必填                     | 比对结果。                                 |
| `loading`     | `boolean`                                                          | 必填                     | 比对计算中状态。                           |
| `teleport`    | `boolean \| string`                                                | `false`                  | 是否 Teleport 到 `body` 或指定选择器。     |
| `sticky`      | `boolean`                                                          | `false`                  | 绝对定位不占文档流，否则相对定位占文档流。 |
| `movable`     | `boolean`                                                          | `false`                  | 是否允许拖动面板。                         |
| `offset`      | `{ top?: number; right?: number; bottom?: number; left?: number }` | `{ top: 12, right: 12 }` | 定位偏移。                                 |

`ComparisonPanel` Events：

| Event             | 参数            | 说明                                         |
| ----------------- | --------------- | -------------------------------------------- |
| `select-template` | `(idx: number)` | 选择模板标注。                               |
| `select-test`     | `(idx: number)` | 选择测试标注。                               |
| `compare`         | `()`            | 请求执行比对。                               |
| `clear-result`    | `()`            | 清除旧结果，组件内部会在输入稳定后防抖更新。 |
| `clear`           | `()`            | 清空面板状态。                               |

`ComparisonOverlay` Props：

| Prop      | 类型          | 说明                   |
| --------- | ------------- | ---------------------- |
| `result`  | `MatchResult` | 比对结果。             |
| `getMeta` | `() => Meta`  | 获取当前画布视图状态。 |

### 样式变量

组件使用 Tailwind 类和 CSS 变量组织样式。宿主应用通过祖先节点覆盖变量，不需要穿透组件内部结构。

```css
.my-annotator-theme {
  --da-annotator-bg: rgba(238, 240, 232, 0.72);
  --da-annotator-panel-bg: #fffefa;
  --da-annotator-canvas-bg: #fffefa;
  --da-annotator-text: #151916;
  --da-annotator-muted: #667067;
  --da-annotator-border: #d9ddd2;
  --da-annotator-border-strong: #c6ccbf;
  --da-annotator-tool-bg: rgba(255, 255, 250, 0.72);
  --da-annotator-tool-hover-bg: rgba(9, 16, 18, 0.075);
  --da-annotator-selected-bg: rgba(9, 16, 18, 0.12);
  --da-annotator-selected-border: #62715c;
  --da-annotator-primary-bg: #62715c;
  --da-annotator-danger-bg: #d93f49;
}
```

常用变量：

| 变量                                                                                | 说明                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------ |
| `--da-annotator-bg`                                                                 | 标注组件外层背景。                         |
| `--da-annotator-panel-bg`                                                           | 工具栏和列表面板背景。                     |
| `--da-annotator-canvas-bg`                                                          | 画布容器背景。                             |
| `--da-annotator-text` / `--da-annotator-muted` / `--da-annotator-subtle`            | 文本颜色。                                 |
| `--da-annotator-border` / `--da-annotator-border-strong` / `--da-annotator-divider` | 边框和分割线。                             |
| `--da-annotator-tool-*`                                                             | 工具按钮默认、hover、active 状态。         |
| `--da-annotator-selected-*`                                                         | 选中状态。                                 |
| `--da-annotator-primary-*`                                                          | 完成按钮等主操作。                         |
| `--da-annotator-danger-*`                                                           | 删除按钮等危险操作。                       |
| `--da-compare-*`                                                                    | 对比面板背景、边框、按钮、通过和失败状态。 |

### 快捷键

| 操作                 | 快捷键                           | 说明                                       |
| -------------------- | -------------------------------- | ------------------------------------------ |
| 切换选择/绘制        | `Tab`                            | 在编辑已有图形和绘制新图形间切换。         |
| 八种标注工具         | `1` 到 `8`                       | 按工具栏顺序切换，受 `enabledModes` 影响。 |
| 切换分组             | `Alt + 1/2/3/4`                  | 对应最多四个分组。                         |
| 撤销                 | `Ctrl + Z`                       | 只读模式不可用。                           |
| 重做                 | `Ctrl + Y` 或 `Ctrl + Shift + Z` | 只读模式不可用。                           |
| 放大/缩小            | `Ctrl + =` / `Ctrl + -`          | 以当前视图中心缩放。                       |
| 重置缩放             | `Ctrl + 0`                       | 恢复默认视图。                             |
| 平移                 | `ArrowUp/Down/Left/Right`        | 按固定步长移动画布。                       |
| 完成折线/多边形/曲线 | `Enter`                          | 连续绘制中可用。                           |
| 删除选中图形         | `Backspace`                      | 只读模式不可用。                           |
| 清空全部图形         | `Delete`                         | 只读模式不可用。                           |

### 鼠标操作

| 场景     | 操作            | 方式                                              |
| -------- | --------------- | ------------------------------------------------- |
| 选择模式 | 选中图形        | 点击图形主体、线段或顶点。                        |
| 选择模式 | 移动图形        | 拖拽已选中的图形主体。                            |
| 选择模式 | 调整矩形尺寸    | 拖拽矩形四角或四边控制柄。                        |
| 选择模式 | 旋转矩形        | 拖拽矩形上方旋转控制点。                          |
| 选择模式 | 移动顶点        | 拖拽折线或多边形顶点。                            |
| 选择模式 | 插入顶点        | `Ctrl + 点击` 折线或多边形边缘。                  |
| 选择模式 | 删除顶点        | `Shift + 点击` 折线或多边形顶点。                 |
| 选择模式 | 快捷修改路径    | 从边/顶点开始，添加中途点，再点击边/顶点结束。    |
| 选择模式 | 合并多边形      | 依次选择两个相交多边形，结果沿用首选图形分组。    |
| 选择模式 | 矩形辅助编辑    | 使用路径或合并工具时，矩形自动转为四点多边形。    |
| 绘制模式 | 绘制矩形        | 按住左键拖拽。                                    |
| 绘制模式 | 绘制圆/椭圆     | 拉框创建正圆，完成后可独立调整两个轴。            |
| 绘制模式 | 绘制 Mask       | 使用可拖动的图标子工具栏选取、涂抹、擦除、多边形处理或融合。 |
| 绘制模式 | 绘制立方体       | 从背景面左上拖到前景面右下，完成后八点独立编辑。  |
| 绘制模式 | 绘制点          | 左键点击画布。                                    |
| 绘制模式 | 绘制折线/多边形 | 连续左键点击添加顶点，按 `Enter` 或完成按钮结束。 |
| 通用     | 缩放画布        | 鼠标滚轮。                                        |
| 通用     | 平移画布        | 右键拖拽。                                        |
| 通用     | 从列表定位图形  | 点击标注列表项。                                  |

## 引擎包

引擎包用于自定义标注 UI 或直接接入 Canvas 控制器。

```ts
import {
  AnnotationController,
  ImageLayer,
  ShapeLayer,
  DEFAULT_GROUPS,
  buildGroupMap,
  deepCopy
} from 'da-studio/engine'
import type { ControllerOpts, Shape, Meta } from 'da-studio/engine'
```

| API                     | 类型      | 说明                                                                |
| ----------------------- | --------- | ------------------------------------------------------------------- |
| `AnnotationController`  | class     | 标注交互控制器。                                                    |
| `Viewport`              | class     | 共享视口状态，统一管理缩放/平移，通过 `onChange` 回调驱动图层重绘。 |
| `ImageLayer`            | class     | 背景图层，负责图片加载、视口裁剪绘制。                              |
| `ShapeLayer`            | class     | 图形图层，负责绘制、命中检测、顶点和控制柄处理。                    |
| `DEFAULT_GROUPS`        | `Group[]` | 默认分组。                                                          |
| `buildGroupMap(groups)` | function  | 将分组数组转为按 `name` 索引的对象。                                |
| `deepCopy(value)`       | function  | JSON 深拷贝工具。                                                   |

`AnnotationController` 常用方法：

| 方法                                                            | 说明                             |
| --------------------------------------------------------------- | -------------------------------- |
| `mount(bgCanvas, shapeCanvas, imageSrc?)`                       | 绑定 canvas 并加载图片。         |
| `loadImage(src)`                                                | 加载或切换背景图片。             |
| `setMode(mode)`                                                 | 设置绘制类型。                   |
| `setInteractionMode(mode)`                                      | 设置选择或绘制交互模式。         |
| `setReadonly(value)`                                            | 切换只读状态。                   |
| `setGroup(name)`                                                | 设置当前分组。                   |
| `zoom(delta)` / `resetZoom()` / `pan(dx, dy)`                   | 缩放、重置和平移。               |
| `fitImageToCanvas()`                                            | 将完整图片等比居中适配画布。     |
| `undo()` / `redo()`                                             | 撤销和重做。                     |
| `canUndo()` / `canRedo()`                                       | 查询历史栈状态。                 |
| `completePolygon()` / `completePolyline()` / `completeCurve()`  | 完成连续绘制。                   |
| `setImageAdjustments(value)`                                    | 调节底图亮度、对比度和饱和度。   |
| `toggleShapeVisibility(idx)` / `setAllShapesVisibility(hidden)` | 控制画布可见性。                 |
| `selectShapeByIndex(idx)` / `selectShape(x, y)`                 | 选中图形。                       |
| `setSelectedShapeGroup(name)`                                   | 修改选中图形分组。               |
| `deleteSelected()` / `clear()`                                  | 删除选中或清空全部。             |
| `getShapes()` / `getMeta()`                                     | 获取当前标注数据和视图状态。     |
| `setShapes(shapes)`                                             | 设置图形并写入历史基线。         |
| `loadAnnotationState(shapes, meta)`                             | 载入完整标注状态并重置历史基线。 |
| `destroy()`                                                     | 移除事件并释放控制器。           |

## Electron 应用

Electron 应用位于 `electron/`，使用 `src/` 的组件包作为标注工作台，在应用层实现数据集、图片文件、SQLite、IPC、路由页面和 Element Plus 风格。

### 运行和打包

```bash
pnpm dev:app
pnpm build:app
```

`dev:app` 会在启动前清理旧的构建产物（`rimraf build/app/dist build/app/dist-electron`）。`build:app` 会执行三步：

1. `scripts/generate-app-icons.mjs` 从 `electron/renderer/public/icon.svg` 生成 `icon.png`、`icon.ico`、`icon.icns`。
2. `vite build --config vite.electron.config.ts` 构建 renderer（`root: 'electron/renderer'`）到 `build/app/dist`，构建 main、preload 到 `build/app/dist-electron`。
3. `electron-builder` 生成当前平台安装包和解包目录到 `build/app/release`。

Windows 产物示例：

```txt
build/app/release/
  win-unpacked/DA Studio.exe
  DA Studio Setup 1.0.0.exe
```

### Electron 目录职责

| 目录                                    | 说明                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `electron/main/window.ts`               | 创建窗口，开发时加载 Vite dev server，生产时加载构建后的 renderer HTML。 |
| `electron/main/ipc/`                    | 数据集、图片、标注、导入导出等 IPC handler。                             |
| `electron/main/db/`                     | SQLite 初始化、迁移和数据访问。                                          |
| `electron/main/storage/`                | 本地图片文件存储、MD5 去重和路径管理。                                   |
| `electron/main/menu/`                   | 应用菜单和标注快捷键状态同步。                                           |
| `electron/preload/`                     | 通过 `contextBridge` 暴露安全 API，renderer 不直接访问 Node。            |
| `electron/renderer/pages/`              | 数据集列表、详情、标注工作台、弹窗页面。                                 |
| `electron/renderer/assets/electron.css` | Electron 应用级样式和组件变量主题。                                      |
| `electron/shared/`                      | main/preload/renderer 共用类型。                                         |

### 应用功能

| 功能       | 说明                                                                             |
| ---------- | -------------------------------------------------------------------------------- |
| 数据集管理 | 创建、编辑、删除数据集，展示图片数、已标注和待标注数量。                         |
| 富文本描述 | 支持正文、标题、粗体、斜体、下划线、链接、撤销/重做和对齐。                      |
| 工具配置   | 每个数据集配置启用的标注工具。                                                   |
| 分组配置   | 每个数据集最多 4 个颜色分组。                                                    |
| 图片导入   | 导入本地图片，同一数据集内按 MD5 去重。                                          |
| 标注工作台 | 左侧待标注图片列表，中间画布自适应可用空间，并保留最小操作尺寸。                 |
| 状态控制   | 已标注图片可查看；无可标注数据时标注入口禁用；已有标注数据时编辑数据集入口禁用。 |
| 保存和跳过 | 保存当前图片的 shapes/meta 到 SQLite，或跳过并进入下一张。                       |
| 导出       | 支持原生 JSON、CSV、COCO、YOLO Detect/Segment、VOC、LabelMe、Bitmap Mask + RLE。 |

### 使用流程

1. 创建数据集，填写名称、描述、工具和分组。
2. 进入数据集详情导入图片。
3. 点击标注进入工作台。
4. 使用已启用的矢量、Mask 或立方体工具绘制图形。
5. 保存或跳过当前图片。
6. 在数据集详情查看状态。
7. 导出已标注数据。

### 导出格式

Mask 标注对象仅保存最终的 bbox 裁剪二值点阵（行优先 RLE），不保存画笔或裁剪路径，也不迁移旧路径型 Mask 数据。COCO 与 Bitmap Mask 导出会转换为列优先的压缩 RLE `counts`；bbox 外空白通过游程合并，不生成整图大小的中间位图。

JSON：

```json
[
  {
    "image_md5": "md5",
    "image_name": "example.png",
    "shapes": [],
    "meta": {}
  }
]
```

CSV：

```txt
image_md5,image_name,shape_type,group_id,x,y,w,h,rotation,points
```

导出时会把图形的 `group` 映射为当前数据集分组配置中的 `group_id`。

## 开发边界

- `src/` 只放可复用组件、引擎、matcher 和包导出面。
- `dev/` 只放组件调试工作台。
- `electron/` 只放桌面应用页面、IPC、SQLite、文件存储和 Electron 专属样式。
- Electron 应用通过组件 CSS 变量调整工具风格，不穿透覆盖组件内部结构。
