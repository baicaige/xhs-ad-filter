# xhs-ad-filter

小红书广告评论规则库、审核后台、油猴脚本和 Chrome 插件。它适合个人维护：浏览时自动发现疑似广告，进入本地待审核池，审核通过后用 GitHub API 写回仓库，GitHub Pages 再把最新规则同步到所有设备。

## 文件结构

```text
xhs-ad-filter
├── rules.json             # 生效关键词和正则规则
├── authors.json           # 作者黑名单
├── notes.json             # 帖子黑名单
├── pending.json           # 静态示例待审核库
├── admin.html             # GitHub Pages 管理后台
├── xhs-filter.user.js     # 油猴脚本
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
5. 通过后，后台会调用 GitHub Contents API 更新：
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

## Fine-grained PAT

管理后台需要一个 Fine-grained Personal Access Token。建议仅授权此仓库：

- Repository access: `baicaige/xhs-ad-filter`
- Contents: `Read and write`
- Metadata: `Read`

Token 只保存在当前浏览器的 `localStorage`，不会写入仓库。为了安全，建议单独创建低权限 token，并定期轮换。

## 管理后台使用

打开 `admin.html` 后填写：

- Owner: `baicaige`
- Repo: `xhs-ad-filter`
- Branch: `main`
- Token: GitHub Fine-grained PAT

待审核数据来源有三种：

- 油猴脚本写入的 `localStorage.pending_ads`
- Chrome 插件写入的 `chrome.storage.local.pending_ads`
- 手动粘贴广告文本后点击“提取特征”

审核通过时，后台会自动合并关键词、作者和帖子 ID，并去重提交。

## Chrome 插件安装

1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本仓库的 `extension/` 目录
5. 在插件选项里确认规则地址，默认使用 GitHub Pages

插件会在小红书页面隐藏或标记疑似广告评论，并把新广告样本写入待审核池。

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
  "regex": ["CA\\d{2,8}"]
}
```

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

## 下一步建议

- 增加 GitHub Action + Issue 工作流，允许无 PAT 的协作者提交待审核样本。
- 给规则增加命中次数和最近命中时间，便于淘汰过期规则。
- 把管理后台接入 Cloudflare Worker，避免 PAT 暴露在浏览器环境中。
