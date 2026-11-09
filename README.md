<img src="assets/brand/shifang.png" alt="采章图标" width="96">

# 采章 Caizhang

采章是一款本地运行的 macOS 诗词创作与阅读应用。写五绝、七律或填词时，可以逐字对照谱式、选择多音字读法、查看同韵字。阅读时可以导入自己的 EPUB，在原文旁看鉴赏、摘录句子、写读书笔记。原创作品可归入文集，排成图片或 PDF。

## 开始开发

当前验证平台为 Apple Silicon Mac。安装 Xcode Command Line Tools（如尚未安装，运行 `xcode-select --install`），准备 Git 和 **Node.js 24.19.0** 及其附带的 npm。下载或克隆此仓库，在包含 `package.json` 的目录执行：

```sh
node --version
npm ci
npm run dev
```

首次安装需要联网获取 npm 包和 Electron。默认无需 API Key、数据库服务器或环境变量。开发命令启动本机 Vite 服务和 Electron 窗口，使用 5173 端口。正常退出开发会话可在终端按 Ctrl+C。开发数据写入本检出目录的 `.development/user-data`，正式包沿用更名前的开源版用户目录。

## 示例资料

开箱提供四种近体诗的16个基础谱式、15个词谱示例和100篇首页推荐诗词，以及可用于查字、选音和用韵的精简数据。第一次打开书架时，可通过“添书”导入自己有权使用的 EPUB。书内能否分出作者、原文、注释和鉴赏，取决于电子书结构。读音或格律缺乏依据时，应用会保留待确认状态。

本仓库附带作者生成并同意公开的首页山水、雾层和导出背景图。示例资料、私有资料的加载方法以及授权范围见 [数据与素材](docs/data.md)。

## 检查和打包

```sh
npm run check
npm run build
npm run package:mac
```

`check` 运行前后端 TypeScript 检查和单元、组件回归。测试按文件串行执行。构建产生 `dist/` 和 `dist-electron/`。Mac 打包命令生成 `release/mac-arm64/采章开源版.app` 并执行本地 ad-hoc 签名。该产物适合开发者自行运行。面向公众分发时需要单独安排 Developer ID 签名及公证。

## 项目结构

| 目录 | 职责 |
|---|---|
| src/pages、src/components | 创作、阅读、摘记、文集与导航界面 |
| src/poetry、src/ci | 平仄、韵脚、谱式分析与读音解析 |
| src/features、src/shared | 编辑状态、保存协调、导出及进程间通信类型 |
| electron | 桌面窗口、SQLite 迁移、备份恢复、EPUB 解析与导出 |
| data/sample | 可独立使用的示例规则、词谱与背景图 |
| scripts、tests | 数据准备、构建、本地签名及回归测试 |

技术栈为 Electron、React、TypeScript、Vite、SQLite 和 ProseMirror。除依赖安装与开发服务器外，日常创作和阅读使用本地文件。Windows、Linux、Intel Mac 和手机端尚未在本次发布中验证。

贡献方式见 [CONTRIBUTING](CONTRIBUTING.md)，当前版本见 [CHANGELOG](CHANGELOG.md)。项目自有代码采用 [MIT](LICENSE)。第三方组件的版权、许可和素材来源见 [NOTICE](NOTICE.md)。
