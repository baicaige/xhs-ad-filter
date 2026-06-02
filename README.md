# xhs-ad-filter

小红书广告评论规则库、审核后台、油猴脚本和 Chrome 插件。它适合个人维护：浏览时自动发现疑似广告，进入本地待审核池，审核通过后通过 Cloudflare Worker 写回仓库，GitHub Pages 再把最新规则同步到所有设备。

## 文件结构

```text
xhs-ad-filter
├── rules.json             # 生效关键词和正则规则
├── authors.json           # 作者黑名单
├── notes.json             # 帖子黑名单
├── pending.json           # 静态示例待审核库
├── admin.html             # GitHub Pages 管理后台
├── xhs-filter.user.js     # 油猴脚本
├── worker/                # Cloudflare Worker 中转 API
├── .github/ISSUE_TEMPLATE # 广告样本 Issue 表单
├── .github/workflows/     # Issue 自动进入待审核池
├── docs/                  # 手动启用 workflow 等运维说明
└── extension/             # Chrome 插件
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── options.html
    ├── options.js
    ├── popup.html
    └── popup.js
```

## 工作流

1. 安装 `xhs-filter.user.js` 或加载 `extension/` Chrome 插件。
2. 浏览小红书时，脚本会匹配广告关键词、邀请码、黑名单作者和帖子 ID。
3. 疑似广告会写入浏览器本地待审核池 `pending_ads`。
4. 打开 `admin.html`，在“广告审核中心”里点“通过”或“忽略”。
5. 通过后，后台会调用 Cloudflare Worker，Worker 再用 GitHub token secret 更新：
   - `rules.json`
   - `authors.json`
   - `notes.json`
6. GitHub Pages 发布最新规则，其他设备下次刷新规则即可同步。

## GitHub Pages

仓库开启 GitHub Pages 后，可直接访问：

```text
https://baicaige.github.io/xhs-ad-filter/admin.html
https://baicaige.github.io/xhs-ad-filter/rules.json
https://baicaige.github.io/xhs-ad-filter/authors.json
https://baicaige.github.io/xhs-ad-filter/notes.json
```

## Cloudflare Worker

为了避免在公开 GitHub Pages 页面里暴露 GitHub PAT，写入 GitHub 的能力放在 Cloudflare Worker 中：

```text
admin.html
  ↓ Authorization: Bearer ADMIN_KEY
Cloudflare Worker
  ↓ GITHUB_TOKEN secret
GitHub Contents API
  ↓
rules.json / authors.json / notes.json / pending.json
```

Worker 文件位于 `worker/xhs-rules-api.js`，接口如下：

- `GET /health`：健康检查
- `GET /rules`：读取规则、作者、帖子和 GitHub Issue 待审核池
- `POST /submit`：插件上报疑似广告到 `pending.json`，需要 `Authorization: Bearer SUBMIT_KEY`
- `POST /approve`：审核通过并写回 GitHub，需要 `Authorization: Bearer ADMIN_KEY`
- `POST /hit`：命中统计写回接口，默认关闭，只有设置 `ALLOW_PUBLIC_HITS=true` 才会启用

需要配置的 Worker secret：

- `GITHUB_TOKEN`：Fine-grained PAT，只授权本仓库 `Contents: Read and write`
- `ADMIN_KEY`：后台口令，用于保护 `/approve`
- `SUBMIT_KEY`：插件上报口令，用于保护 `/submit`

Worker 普通变量：

- `GITHUB_OWNER=baicaige`
- `GITHUB_REPO=xhs-ad-filter`
- `GITHUB_BRANCH=main`
- `ALLOW_PUBLIC_HITS=false`

## Fine-grained PAT

Worker 需要一个 Fine-grained Personal Access Token。建议仅授权此仓库：

- Repository access: `baicaige/xhs-ad-filter`
- Contents: `Read and write`
- Metadata: `Read`

PAT 只应保存为 Cloudflare Worker 的 `GITHUB_TOKEN` secret，不应填写到 `admin.html`，也不应写入浏览器存储。为了安全，建议单独创建低权限 token，并定期轮换。

## 管理后台使用

打开 `admin.html` 后填写：

- Worker API: Cloudflare Worker 地址
- 后台口令: `ADMIN_KEY`

待审核数据来源有三种：

- 油猴脚本写入的 `localStorage.pending_ads`
- Chrome 插件写入的 `chrome.storage.local.pending_ads`
- 手动粘贴广告文本后点击“提取特征”

审核通过时，后台会自动合并关键词、作者和帖子 ID，并去重提交。

## 无 PAT 协作者提交

仓库提供了 GitHub Issue 表单：`提交广告样本`。

协作者或普通用户不需要 PAT，只要创建广告样本 Issue 即可。`.github/workflows/issue-to-pending.yml` 会自动：

1. 解析广告内容、作者、帖子 ID 和来源链接。
2. 自动提取关键词和邀请码。
3. 写入 `pending.json`。
4. 在 Issue 下留言说明是否已加入待审核池。

然后你打开 `admin.html` 刷新规则库，就能看到来自 Issue 的待审核样本。

如果本机无法推送 workflow 文件，可按 `docs/manual-workflow-upload.md` 在 GitHub 网页手动创建 `.github/workflows/issue-to-pending.yml`。

## Chrome 插件安装

1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本仓库的 `extension/` 目录
5. 在插件选项里确认规则地址，默认使用 GitHub Pages

插件会在小红书页面隐藏或标记疑似广告评论，并把新广告样本写入待审核池。

插件支持三种疑似广告处理模式：

- `仅加入本地待审核池`：默认模式，不访问 Worker。
- `上报到 Worker 待审核池`：填写 Worker API 和 `SUBMIT_KEY` 后，疑似广告会写入远端 `pending.json`。
- `直接通过并写入规则库`：填写 Worker API 和 `ADMIN_KEY` 后，疑似广告会直接调用 `/approve` 写入正式规则库。建议只在你自己使用、规则质量稳定后开启。

页面右下角会显示本页 `屏蔽 / 疑似 / 上报` 统计。被隐藏的广告会留下红色占位提示；疑似但未命中正式规则的评论会被黄色标记，便于人工判断。

## 油猴脚本安装

1. 安装 Tampermonkey / Violentmonkey。
2. 新建脚本，粘贴 `xhs-filter.user.js`。
3. 保存后访问小红书。
4. 脚本会自动加载 GitHub Pages 上的规则，并把疑似广告写入 `localStorage.pending_ads`。

## 规则格式

`rules.json`

```json
{
  "keywords": ["复制口令", "启动小红书"],
  "regex": ["CA\\d{2,8}"],
  "stats": {
    "keywords": {
      "复制口令": {
        "hitCount": 12,
        "lastHitAt": "2026-06-02T07:30:00.000Z"
      }
    },
    "regex": {}
  }
}
```

`stats.keywords` 记录规则命中次数和最近命中时间。当前默认在审核通过时为样本关键词增加一次命中；如果你确认要接受公开命中上报，可以把 Worker 变量 `ALLOW_PUBLIC_HITS` 设为 `true` 后接入 `/hit`。

`authors.json`

```json
{
  "authors": ["广州脱单搭子"]
}
```

`notes.json`

```json
{
  "notes": ["6a190f190000000035025494"]
}
```

## 后续优化

- 给 `/hit` 增加 Turnstile 或签名校验，再开放真实命中统计上报。
- 增加规则导出和过期规则清理视图。
- 把 Issue 审核通过后自动关闭，减少人工维护。
