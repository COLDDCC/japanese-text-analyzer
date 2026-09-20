# Wakachi

贴一段日文，逐词切开，每个词标出读音、原形、词性和英文释义。

全部在浏览器里跑。没有后端，没有 API key，也没有调用成本——分词器和词典都是静态文件。

[English](README.md)

## 做了什么

- 用 [kuromoji.js](https://github.com/takuyaa/kuromoji.js)（IPA 词典）切词，
  放在 Web Worker 里跑，长文本不卡界面。
- 含汉字的词，头上加 ruby 注音。
- 实词正常字色 + 细下划线；助词、助动词和标点调淡。
- 点词弹出详情：原文、读音、原形（「行き → 行く」）、词性、活用形，
  以及 JMdict 里最多 3 条英文释义。
- 界面中 / EN 切换，选择存在浏览器本地。
- 单次最多 5,000 字。

## 跑起来

```bash
npm install
npm run dev
```

然后打开命令行打印出来的地址。**直接双击 index.html 打不开**——词典要走 HTTP 加载。

```bash
npm run build     # 打包成静态站点，输出到 dist/
npm run preview   # 本地预览 dist/
npm test          # 单元测试 + 验收测试句
```

首次加载要拉 kuromoji 约 18MB 的词典，要等几秒，页面有进度条；之后浏览器会缓存。

## 各部分怎么串起来

```
粘贴文本
  → worker.js        kuromoji 切词
  → kana.js          片假名读音转平假名
  → pos-map.js       kuromoji 词性标签转成中 / EN 标签，
                     并判断哪些是需要查词典的实词
  → lookup.js        实词查 JMdict
  → render.js        词块、ruby、详情栏
```

| 路径 | 内容 |
| --- | --- |
| `src/worker.js` | 分词 Worker，带词典加载进度 |
| `src/lookup.js` | JMdict 查询、分片缓存、匹配规则 |
| `src/render.js` | 词块流和详情栏的 DOM |
| `src/pos-map.js` | kuromoji 词性 / 活用标签 → 中 / EN 标签 |
| `src/kana.js` | 假名转换，以及「这个词要不要注音」 |
| `src/i18n.js` | 所有界面文案 |
| `src/shard.js` | 构建脚本和浏览器必须一致的那个哈希 |
| `scripts/build-dict.mjs` | 生成 JMdict 分片（见下） |
| `scripts/prepare-kuromoji.mjs` | 把 kuromoji 词典复制进 `public/` |

### 词典为什么要分片

JMdict 的常用词条加起来约 14MB JSON，一次性加载太重。构建脚本把每个词条的
**所有写法**（汉字写法和假名写法）做哈希、对 256 取模，一个桶写一个文件。
查词时只拉它所在的那个文件，约 52KB，拉过的分片留在内存里复用。

### 查词匹配规则

有一个坑：kuromoji 给的是**原文**的读音，不是原形的读音——「行き」给的是 イキ，
不是「行く」的 イク。所以规则是：

1. 先用原形查，查不到用原文，再查不到用读音。
2. 词**没有**变形时，再用读音筛一遍。这是「今日」きょう 和「今日」こんにち 分得开的原因。
3. 词**变形过**时，忽略读音，按分片顺序取——常用词条排在前面。
4. 都匹配不到（人名、生僻词、网络用语），显示 "No entry found"，不报错。

## 重新生成词典数据

两份词典都是生成的，不用手工维护。

kuromoji 词典由 `npm run dict:kuromoji` 从 `node_modules` 里复制出来，
`dev` 和 `build` 会自动跑，**不进版本库**。

`public/dict/jmdict/` 里的 JMdict 分片**进了版本库**，所以部署只需要 `npm run build`。
要更新它们：

```bash
npm run dict:jmdict                 # JMdict 常用词条（约 4.6 万条），v1 发的就是这份
node scripts/build-dict.mjs --all   # 全量词典（约 19.1 万条，约 54MB）
```

脚本会从 PyPI 下载 [`jamdict-data`](https://pypi.org/project/jamdict-data/)
——打包成单个 SQLite 文件的 JMdict——并缓存在 `node_modules/.cache/jmdict/`。
需要命令行有 `tar` 和 `xz`。

## 部署到 Cloudflare Pages

| 设置项 | 值 |
| --- | --- |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |

`public/_headers` 会跟着站点一起发布，让边缘节点把 `dict/kuromoji/*` 当成
`application/octet-stream` 来发，这样它就不会给本来就是 gzip 的文件再加
`Content-Encoding: gzip`。

这个「重复解压」的坑值得记一下：kuromoji 自己会解压 `.gz` 词典文件，
如果托管平台也声明它们是 gzip，浏览器会先解压一次，kuromoji 再解压就报错。
Wakachi 在解压前会检查 gzip magic bytes，所以两种情况都能跑——
但换了新平台看到 `invalid gzip data`，就是这里的问题。

## 设计

视觉系统——方格纸底、直角卡片、Anybody 配 IBM Plex、蓝色管结构、绿色管确认、红色管警示——
抄的是 [COLDDCC/design-reference](https://github.com/COLDDCC/design-reference)
里的 `graph-paper-site`。

有两处是改过的，不是照搬：

- **字体改成自托管**，放在 `public/fonts/`，不走 Google Fonts。这个工具界面是中文的，
  读者大概率在 `fonts.googleapis.com` 解析不了的地方；一个主打"纯静态、没有后端"的站，
  不该因为一个 CDN 就垮掉。只带了 latin 子集（6 个字重共 165KB），中日文走系统字体。
- **加了暗色模式。** 参考站只有亮色，所以暗色是把同一套系统换到夜里：结构不变，
  三个强调色不变，只是不刺眼。

## v1 的已知限制

- IPA 词典切得偏细，有些复合词会被拆开（「東京都庁」会散架），v1 接受这个限制。
- 释义取词条前 3 条，义项多的词只能看到开头几条。
- 人名和网络用语不在 JMdict 常用集里，会显示 "No entry found"。
- 首次加载慢——约 18MB 分词词典——之后走缓存。

## 后续路线

- **v2** — 变形拆解：「行きました = 行く + ます + た」，逐段解释。
- **v3** — 熟词表：以原形为 key 存在浏览器本地，之后只高亮生词。
- **v4** — 生词导出成 Anki 卡片 / CSV。

## 许可

代码是 MIT，见 [LICENSE](LICENSE)。

它分发的数据不是：

- **JMdict** 版权属于
  [Electronic Dictionary Research and Development Group](https://www.edrdg.org/)，
  以 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 使用。
  `public/dict/jmdict/` 里的分片是它的衍生作品。
- **kuromoji.js** 和它的 IPA 词典是 Apache 2.0。
- `public/fonts/` 里的 **Anybody**、**IBM Plex Sans**、**IBM Plex Mono**
  是 SIL Open Font License 1.1，见 `public/fonts/LICENSE.txt`。

两者都在页脚署名了——许可证要求的就是这个，请保留。
