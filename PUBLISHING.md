# 上架到 DSH 插件市场 · 操作步骤

包已经做好并可发布。剩下两步需要你自己的 GitHub 账号（我这边没有凭据，也不能代你操作账号）。

## 前置：把 `<你的GitHub用户名>` 换成实际用户名

`package.json` 和下面的 YAML 里出现的 `<你的GitHub用户名>` 都要替换。

---

## 第一步：建仓库并推送

在 GitHub 上新建一个仓库，名字叫 **`dsh-download-indicator`**（公开），不要初始化 README（本地已经有了）。

然后在本目录执行：

```powershell
cd F:\training\dsh-download-indicator
git config user.name  "你的名字"
git config user.email "你的邮箱"
git remote add origin https://github.com/<你的GitHub用户名>/dsh-download-indicator.git
git branch -M main
git push -u origin main
```

---

## 第二步：给精选列表提 PR

上架不需要单独申请什么账号，**插件列表就是那个 awesome 仓库** —— 加一个 YAML 文件就完事。

1. Fork [`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
2. 在你的 fork 里新建文件：
   **`data/plugins/<你的GitHub用户名>__dsh-download-indicator.yml`**
3. 内容（把用户名替换掉）：

```yaml
url: https://github.com/<你的GitHub用户名>/dsh-download-indicator
name: <你的GitHub用户名>/dsh-download-indicator
category: ui
description:
  en: Draggable semi-transparent download-progress widget that shows only while files are still growing, with live speed and remembered position.
  zh: 半透明可拖动的下载进度浮窗，只在文件正在增长时出现，显示实时速度并记住位置。
icon: https://raw.githubusercontent.com/<你的GitHub用户名>/dsh-download-indicator/main/icon.png
```

4. 提 PR，标题例如 `Add <你的GitHub用户名>/dsh-download-indicator`

合并后站点和市场会自动收录，通常一天内生效。**不要**去手工改上面那两个 README —— 它们由 `data/plugins/*.yml` 生成。

### 分类取值

`category: ui` 对应列表里的 **UI Enhancements**。其他合法值：
`agi` `ui` `usage` `theme` `model` `identity` `session` `memory` `tools` `wsl` `browser` `vision` `voice` `docs` `skill` `workflow` `git` `notify` `dev` `security` `remote` `market` `fun`

### 评审会看什么

- 能用 `dsh plugin add` 装上
- 行为和那一行描述一致
- 分类放对
- 有人维护

描述里**不要吹**做不到的功能 —— 他们的评审会照着描述去核对源码。

---

## 可选：发布到 npm

列表同时支持 npm 条目（市场里能一键安装）。如果想让安装命令更短：

```powershell
cd F:\training\dsh-download-indicator
npm login
npm publish --access public
```

发布后安装命令变成 `dsh plugin --profile web add dsh-download-indicator`，不再需要 `link:` 路径。

> 注意：npm 包名 `dsh-download-indicator` 如果已被占用，改 `package.json` 的 `name` 字段后重新提交。

---

## 一个补充建议

列表能给的是曝光，但用户装之前会点进仓库看。仓库里最该补的是一张**界面截图**（浮窗长什么样），放进 `assets/` 并在 README 里引用 —— 比多写两段文字管用。
