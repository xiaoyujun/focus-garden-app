# B站解析重置说明

面向在线播放器的 B 站解析模块重构方案，统一为“视频解析”入口，并补齐后台播放、清晰度切换、下载链接、评论与 UP 主主页访问等能力。

## 背景与目标
- 现有逻辑区分“视频/音频解析”，交互割裂，后台播放体验不足，且缺少评论与关注入口。
- 重置后仅保留“视频解析”模式：同一解析结果同时提供视频播放、后台收听、清晰度选择与下载链接。
- 提供评论区浏览、UP 主主页查看、已关注 UP 主主页入口，保证登录态下的个人化内容。

## 功能范围
- 解析入口：粘贴链接/搜索，自动提取 BV/AV/CID，拉取分 P 信息与可用清晰度。
- 播放体验：内嵌视频播放 + 后台播放（锁屏/切后台继续），支持画质切换，Mini Player 常驻。
- 下载与外部打开：列出直链（视频流/音频流/分段 durl），可复制/系统浏览器打开。
- 评论区：展示热度/时间排序的主评论与楼中楼，分页加载。
- UP 主主页：展示基本资料、稿件/合集列表、数据概览；关注页可浏览自己关注的 UP 主主页。

## 交互流程（概述）
1. **解析**：输入链接/关键词 → 解析 BV → 展示封面/标题/分 P → 默认选第 1 P。
2. **播放**：点击播放 → 加载选定画质的视频流；切后台时保持音频轨播放，Mini Player 展示控制。
3. **画质切换**：在播放器内选择清晰度，立即用对应流重建播放，不中断进度（同源 DASH 可无缝）。
4. **下载/外部打开**：在“下载”折叠区列出可用直链（标注清晰度/码率/大小），提供复制、浏览器打开。
5. **评论**：切换到评论 Tab，按热度/时间加载评论，可展开楼中楼、继续翻页，支持跳转 B 站原页。
6. **UP 主**：点击作者头像或“查看主页”进入 UP 主页，展示简介/粉丝/播放数、最新投稿和合集；“关注” Tab 展示已关注 UP 主列表，点击进入对应主页。

## 解析与播放方案
- **统一解析**：仅保留 `getPlayUrl(bvid, cid)` 路径，解析结果包含 `accept_quality`、DASH 视频/音频与备选直链 durl；`parseMode` 作为后端代理/直连策略，不再区分音频模式。
- **后台播放策略**  
  - Web：`<video>` 播放 DASH，注册 Media Session（封面/标题/控制），监听 `visibilitychange`，切后台时保留音轨播放；提供“仅音频”开关切换至音频流节能。  
  - 原生（Capacitor）：复用全局播放 store，维持前台服务通知/锁屏控件；切后台时只保留音频流，暂停视频画面渲染以节电。  
  - Mini Player：底部常驻播放条 + 抽屉式播放列表，可切集/调速/快进快退/切画质。
- **画质/音质选择**：基于 `accept_quality` + `QUALITY_MAP` 渲染下拉；切换后重新取流并保持当前播放时间（记录 `currentTime`，切流后 seek）。

## 下载与外部打开
- 下载区展示：`视频流（分辨率/码率/编码）`、`音频流（码率/编码）`、`分段直链 durl`。  
- 操作：复制链接 / 使用 `window.open`（Web）或 `Browser.open`（Capacitor）外部打开。可提供“代理直链”与“原始直链”切换提示 Referer 限制。  
- 批量：多 P 时提供“一键导出列表”复制（含标题、P 序号、清晰度、URL），替换原有音频批量缓存入口。

## 评论区
- 接口：使用 `/x/v2/reply/wbi/main`（主评论，需 WBI 签名与登录）与 `/x/v2/reply/reply`（楼中楼），参数 `type=1`、`oid=aid`。按 `mode=3`（热度）/`mode=2`（时间）切换。  
- 展示：主楼内容、点赞数、回复数、时间；楼中楼懒加载，超过阈值显示“展开更多”。  
- 交互：支持跳转“在 B 站查看”链接；暂不做发表/点赞，避免风控，交互按钮置灰提示“仅浏览”。

## UP 主主页与关注
- **UP 主主页**：复用 `getUploaderInfo/getUploaderStat/getUploaderVideos`，补充合集/系列入口，展示粉丝、播放、获赞等概览；列表支持按时间/播放量排序与分页。
- **关注入口**：新增“关注” Tab，使用 `getFollowingVideos` 拉取动态投稿；点击卡片跳转到对应 UP 主主页；需登录态。
- **入口位置**：解析结果卡片、播放器内作者头像、UserPanel 中的 Tab 均应可触达。

## 状态与存储调整
- 播放 store 升级为统一“在线视频播放器”状态（保留原音频进度记忆但改为按 `bvid+cid` 存储）；序列化内容包含：当前视频/播放列表/当前清晰度/仅音频开关/进度。  
- 缓存策略：`getVideoInfo` 30 分钟，`getPlayUrl` 5 分钟；画质切换命中缓存时直接复用。评论分页缓存当前页游标以便返回。  
- 错误兜底：未登录时提示登录；获取高码率失败自动降级到下一级清晰度；后台播放被系统杀死时给出“返回应用继续播放”提示。

## 具体实现拆解
### 前端改动（Vue）
- `src/views/OnlinePlayer.vue`
  - 取消“音频解析”分支，统一走视频解析；`parseModeOptions` 仅控制代理/直连，不再影响 UI 分叉。
  - 播放器区域改为 `<video>` + Mini Player，同步 `accept_quality` 渲染画质下拉；切换时记录 `currentTime`，重建源后 `seek`.
  - “下载”折叠区：使用解析结果中的 `videos/audios/durl` 渲染表格，提供复制、`window.open`/`Browser.open` 按钮。
  - 新增“评论” Tab：调用评论接口（见下）分页展示主评论/楼中楼；未登录时显示登录提示。
  - 新增“关注” Tab：调用 `getFollowingVideos` 列表，卡片点击进入 UP 主主页。
  - 作者头像、ParsedVideoPanel 等点击事件统一路由到 `UploaderSpace`，透传 `mid/name`。
- `src/components/GlobalAudioPlayer.vue` & `src/stores/onlineAudioStore.js`
  - Store 添加 `currentQuality`、`audioOnly` 状态；存储/恢复包含 `bvid+cid` 键的进度与清晰度。
  - 切后台（`visibilitychange`）时保持音频流播放；原生平台触发前台服务通知，Web 注册 Media Session。
  - 画质切换方法：`setQuality(qn)` 重新获取播放地址并保持进度，失败降级到下一级。
- `src/components/UploaderSpace.vue` / `UserPanel.vue`
  - 增加“合集/系列”分区、按播放量排序；入口支持从解析卡片和关注列表进入。

### 服务层改动
- `src/services/bilibiliService.js`
  - 保留 `getPlayUrl(bvid, cid, quality)` 为唯一解析函数；返回结构包含 `accept_quality`、`videos`、`audios`、`durl`。
  - 新增评论接口封装：  
    - `getReplies({ oid, page=1, mode='hot' })` 对应 `/x/v2/reply/wbi/main?type=1&oid=aid&mode=3|2`。  
    - `getSubReplies({ root, oid, page=1 })` 对应 `/x/v2/reply/reply`.  
    - 入参需自动携带登录 Cookie，未登录抛错。
  - Uploader 扩展：`getUploaderCollections(mid)`、`getUploaderSeasons(mid)` 作为合集/系列入口。
  - Following 动态已存在 `getFollowingVideos`，在登录校验失败时抛出“请先登录 B 站”。
- `src/services/bilibiliAuth.js`
  - 确保 WBI 签名/CSRF 可用于评论接口；若缺失，需新增签名逻辑或后端代理。

### 后端代理（如需要）
- 复用 `/api/bili`、`/api/bili-search` 代理；若前端缺少 WBI 签名，增加 `/api/bili-comment` 代理评论接口，传递 Cookie/Referer/Origin。
- 代理需支持跨域 `Range`/`Referer` 头以便下载直链在浏览器正常打开。

### 数据结构调整
- 播放状态存储示例（localStorage/Preferences）：
```json
{
  "currentVideo": { "bvid": "BV1xx", "cid": 123, "title": "...", "cover": "..." },
  "currentPlaylist": [ { "bvid": "...", "cid": 1, "title": "...", "page": 1 } ],
  "currentIndex": 0,
  "currentQuality": 80,
  "audioOnly": false,
  "volume": 1,
  "playbackRate": 1
}
```
- 评论分页缓存：`commentCache[oid][mode] = { page, replies[] }`，返回时优先展示缓存再加载下一页。

### 验收用例（可直接走查）
- 解析：BV 链接 → 展示分 P 与清晰度；未登录提示登录。
- 播放：前台流畅，切后台 60s 不断流；从后台返回进度连续；画质切换保持进度。
- 下载：下载区显示视频/音频/durl 直链，复制/外部打开可用。
- 评论：热度/时间切换正常；楼中楼懒加载；未登录时提示。
- UP 主：作者头像可跳转主页；关注 Tab 展示已关注 UP 投稿并可进入主页。
- 状态：刷新页面恢复播放列表、进度、清晰度、仅音频开关。

## 待确认与风险
- 评论接口需 WBI 签名，现有签名实现是否可复用；若不行需后端代理支持。  
- 原生后台播放是否需要额外前台服务通知或系统白名单指引。  
- 8K/杜比/HDR 等高码率可能受账号权限或版权限制，需提示“账号暂无权限”。

## 验收清单
- 解析：任意 BV 链接可解析，分 P 正常显示，未登录给出提示。  
- 播放：前台播放流畅，切后台 1 分钟内不断流，返回后进度连续；画质切换保持进度。  
- 下载：能看到视频/音频直链，复制和外部打开均可用。  
- 评论：热度/时间排序可切换，主楼与楼中楼分页正常，无登录时明确提示。  
- UP 主：解析卡片可跳转到 UP 主主页，关注 Tab 能展示已关注 UP 的投稿列表并可进入对应主页。  
- 状态：刷新页面后播放列表、进度、画质、仅音频开关能恢复。
