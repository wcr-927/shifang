# 数据与素材

示例包使用平水韵部名称、声调、格律排列等结构化事实。编排选取首页古诗、范词及测试用字，省去现代辞典的逐条释义、正文鉴赏和网站排版。五绝、七绝、五律和七律的基础谱式均可用于编辑。词谱选择如梦令、浣溪沙、卜算子、菩萨蛮、念奴娇、水调歌头和忆江南各一体。例诗、范词采用古代作者作品，按公共领域原作处理。示例用韵清单按字形排序，其频次不代表历史语料统计。

私有书籍、全文语料、现代鉴赏文章和网页整页存档只用于原维护环境。使用者可以从应用的“阅读”入口导入自己有权使用的 EPUB。导入资料不会加入代码仓库。格律规则包和阅读书库用途不同。

## 载入自备规则与图片

规则包根目录须含下列文件。它们采用与示例相同的 JSON 结构。

```text
src/rules/{metre,pingze,rhyme,reading_rules,reading_explanations,rhyme_usage}.json
src/ci/{forms,cilin}.json
```

在仓库外准备自有或已获许可的规则包，在同一终端设置环境变量再启动或构建：

```sh
export SHIFANG_DATA_DIR="/absolute/path/to/your-rule-pack"
npm run dev
```

可选变量 `SHIFANG_ART_DIR` 指向图片目录，结构为 `home/landscape.png`、`home/mist.png`、`publication/mountain.jpeg`、`publication/bamboo.jpeg`、`publication/water.jpeg`。开发和构建会复制这些指定文件，产生的副本已加入 Git 忽略规则。若要恢复示例，请退出应用、运行 `unset SHIFANG_DATA_DIR SHIFANG_ART_DIR`，再重新启动。

更换规则包会改变可选词牌、支持的字和对应读法。使用不同数据测试时可将 `SHIFANG_DEV_USER_DATA` 指向新的本地目录。提交 PR 前请以默认示例运行测试。发布 App 前应在全新检出中使用默认示例构建，避免把自备资料装进可下载文件。
