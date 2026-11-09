# 版权与再分发

项目自有代码与文档采用根目录 MIT 许可。软件许可不替第三方作品授予权利。示例中的古代诗词保留作者署名。声调和谱位等事实与现代编辑写作的注释在数据包中分别处理。项目未附现代鉴赏文章、商业书籍、抓取的网页整页或完整第三方辞典。

采章应用图标使用项目提供的三笔诗笺 PNG 原图，macOS 使用的 ICNS 由该图生成。首页山水、雾层和三幅导出背景由项目作者自行生成，作者已同意随本项目公开分发。代码的 MIT 许可范围另见根目录 LICENSE。字体使用系统字体族。项目没有附带字体文件、音频、模型权重或自动更新服务。

运行时依赖及其原始版权、许可证全文位于 assets/licenses/runtime-notices.txt。Lucide 的 ISC 声明与 Feather 的 MIT 原文一起分发，ProseMirror 各包分别保留原版权。saxes 6.0.0 的 npm 包声明 ISC，其许可全文取自上游版本标签。见 [saxes v6.0.0 LICENSE](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE)。

构建脚本从锁定的 npm 包刷新运行时声明。打包会另行从安装的 Electron 分发包复制 Electron LICENSE 和 Chromium 第三方声明到应用 Resources/licenses。Vite 和 esbuild 可在构建输出中注入辅助代码，其许可一并保留。安装开发工具时，其授权文本由各自 npm 包提供，完整版本及 SPDX 标识可查 package-lock.json。采用新依赖、替换图像或使用外部数据打包时，应重新核对分发范围。
