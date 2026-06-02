# 手动启用 GitHub Action 工作流

如果本地 `git push` 因网络或 token 权限问题无法上传 `.github/workflows/issue-to-pending.yml`，可以在 GitHub 网页手动创建。

## 操作步骤

1. 打开仓库：`https://github.com/baicaige/xhs-ad-filter`
2. 点击 `Add file` -> `Create new file`
3. 文件名填写：

```text
.github/workflows/issue-to-pending.yml
```

4. 把本地文件 `.github/workflows/issue-to-pending.yml` 的全部内容粘贴进去。
5. Commit message 填写：

```text
Enable issue to pending workflow
```

6. 选择 `Commit directly to the main branch`。
7. 点击 `Commit changes`。

## 验证

1. 打开仓库 `Issues`。
2. 新建 Issue，选择 `提交广告样本` 模板。
3. 填写一段广告文本并提交。
4. 打开 `Actions`，确认 `Add ad issue to pending pool` 运行成功。
5. 检查 `pending.json` 是否新增样本。

## 常见问题

- 如果提示不能创建 workflow 文件，说明当前 GitHub token 缺少 `Workflows: Read and write`。
- 如果 Action 能运行但不能提交 `pending.json`，检查仓库 `Settings` -> `Actions` -> `General` -> `Workflow permissions` 是否允许 `Read and write permissions`。
