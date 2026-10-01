# 参考项目素材登记表

核对日期：2026-09-27。登记对象是工作区外的只读快照：ECHO `d25d5c97aa1950514bc4299c9820e9a038287bb5`、Folia `9cf822015328e47ee5e22061213010a70b4ec5c9`。

本表对资源目录中的图片、图标、字体、音频和视频文件记录相对路径、字节数及 SHA-256。统计不包含 `.git`、生成的 `build/`、代码、JSON 配置/插件清单、README 中的远程图片 URL 和 ECHO 的 `private/`；没有读取用户 `PersonalConfig/`。哈希用于识别快照内重复和核对 Ome 是否误收同一文件，不代表授权或来源证明。

## 摘要与采用状态

| 快照 | 文件范围 | 文件数 | 合计大小 | 许可与素材说明 | Ome 处理 |
| --- | --- | ---: | ---: | --- | --- |
| ECHO Community | `build-resources/`、`src/`、`examples/` | 19 | 13,294,407 B（12.68 MiB） | 代码为 LGPL-3.0-only；ECHO README 明确第三方材料另循各自条款。品牌图、角色图、Nyan Cat 图、字体和示例素材没有在登记范围找到逐文件授权说明 | 全部保留在外部只读快照；不复制、不打包 |
| Folia | `assets/`、`public/`、`img/`、`src/`、`packaging/` | 42 | 16,064,937 B（15.32 MiB） | 代码为 AGPL-3.0。Cappella 头像与表情目录的 README 声称共 24 张图为 GPT Image2 生成且可自由使用；这是上游说明，不作独立权利认定。占位封面、预览图、站点/平台图标和打包图标未见一致的逐文件许可登记 | 全部保留在外部只读快照；不复制、不打包 |
| Ome 当前应用图标 | `src-tauri/icons/` | 2 | 45,797 B | 属于当前仓库资源；本登记不推断图标作者或外部许可 | 继续由现有 Tauri 配置使用 |

在上述 61 个参考素材中，未发现与 Ome 两个应用图标 SHA-256 完全相同的文件。Ome 的可视化继续使用独立编写的 Preact/CSS/Canvas；参考交互可以独立实现，不依赖参考图像或字体。界面验收截图位于 `artifacts/`，属于开发证据，不作为应用静态素材或随包内容；第七十批歌词双副字幕截图为 `lyrics-dual-before-1280.png`、`lyrics-dual-stage-after-1280.png`、`lyrics-dual-stage-after-470.png` 与 `lyrics-dual-plain-stage-470.png`。

2026-09-27 文件级复核：重新枚举登记范围后，ECHO 19/19 与 Folia 42/42 的路径、字节数和 SHA-256 全部匹配，无遗漏、未登记文件或内容差异。另检查 Ome 的 `src/`、`src-tauri/icons/`、`public/`、`assets/` 与 `dev-preview/` 中的图片/图标/字体/音频/视频文件，共 2 个，均为应用自有图标；与参考素材哈希匹配数为 0。参考仓库快照和应用可发布媒体资源均未新增或更改。

2026-09-26 第五十五批偏好迁移只增加 TypeScript、CSS 与测试，不复制 Folia/ECHO 图像、图标、字体、音频或视频；资产文件数量、许可范围与应用包资源未变化。

2026-09-26 第五十六批视觉器色彩选择使用 Canvas 程序化色彩，不复制 Folia/ECHO 图像、图标、字体、音频或视频；桌面和窄屏验收截图存于 `artifacts/`，不进入应用静态资源或安装包。

ECHO 快照内部存在内容重复：`build-resources/icons/logo1.png`、`softwarelogo.png` 与 `src/renderer/assets/echo-startup-logo.png` 哈希相同；`lmao.jpeg` 在两处相同；两个字体文件各有一份字节相同的副本。文件清单仍按路径逐项登记，以保留快照中的真实占用情况。

## ECHO 文件级清单

| 相对路径 | 字节 | SHA-256 |
| --- | ---: | --- |
| `build-resources/icons/lmao.jpeg` | 134,219 | `4087672c0997cae5c375c9137d9fd134e8bdb2b95ed07d56b484b11a964ac0e8` |
| `build-resources/icons/logo.png` | 804,396 | `c63cc2c572852c6cd917ebc3ab99856116b9a508325812e2e342d91375e40f68` |
| `build-resources/icons/logo1.png` | 938,752 | `8fd1dda721bf257a0fb319dd8846acd1080a968ef9c35c83e6a4cfe86ef43241` |
| `build-resources/icons/software.ico` | 127,547 | `13beb1a6ec06226d27bf24c9b7ae5468fe42759db6be5cdf306c1df2fa6b1052` |
| `build-resources/icons/software.png` | 685,654 | `26cf69d71f417127d85a16ec71fa90742574152c484a164b2e2451bbb1a7a2f9` |
| `build-resources/icons/softwarelogo.png` | 938,752 | `8fd1dda721bf257a0fb319dd8846acd1080a968ef9c35c83e6a4cfe86ef43241` |
| `examples/author-please-be-gentle.jpg` | 1,310,770 | `4ec1605fe15163bdf5d9c473009cf67fe7d308bb0dc4a69753a9c37d32efb75a` |
| `examples/exp.gif` | 1,882,820 | `08a44558061e40e0a49b4c8849aaf310efe4e54d49a9e492428c751c270a6e5a` |
| `examples/star-history.svg` | 2,486 | `6dbc004caecfc3b306a1995d642a15084247e76dddb86283129b783592551a25` |
| `src/fonts/站酷快乐体2016修订版.ttf` | 1,637,800 | `14a7b79cce1523f822f15fc3858ac5981d19f50bebe902c89ea0bbce3643ea03` |
| `src/fonts/Monocraft.ttf` | 210,192 | `c3906e842d1b7e99947abcc5ae3c8b409abf8cefd1006cbba1890f1096e132f2` |
| `src/renderer/assets/echo-startup-logo.png` | 938,752 | `8fd1dda721bf257a0fb319dd8846acd1080a968ef9c35c83e6a4cfe86ef43241` |
| `src/renderer/assets/final-theme-character-hero-clean.png` | 738,577 | `7686a0794a41a4f22889fef39cff3b2abffa9bb4c969b204de8dd44a02d7bdb3` |
| `src/renderer/assets/final-theme-character-hero.png` | 647,635 | `f08fa924d7fd02bc7833e694ad519a1ddec2503630dc2947520f6d269365af1d` |
| `src/renderer/assets/lmao.jpeg` | 134,219 | `4087672c0997cae5c375c9137d9fd134e8bdb2b95ed07d56b484b11a964ac0e8` |
| `src/renderer/assets/nyancat-rainbow.png` | 175,240 | `7bcf7c3d8fe4896e81a92bba636074c05beb69bbcfba62ad2802ef3f8a545fd6` |
| `src/renderer/assets/nyancat-thumb.png` | 138,604 | `69726f0f15e9a2483d95731498e58df5fde5de76fcbf8e276df8354f57027755` |
| `src/renderer/assets/fonts/echo-monocraft.ttf` | 210,192 | `c3906e842d1b7e99947abcc5ae3c8b409abf8cefd1006cbba1890f1096e132f2` |
| `src/renderer/assets/fonts/echo-zcool-happy.ttf` | 1,637,800 | `14a7b79cce1523f822f15fc3858ac5981d19f50bebe902c89ea0bbce3643ea03` |

## Folia 文件级清单

| 相对路径 | 字节 | SHA-256 |
| --- | ---: | --- |
| `assets/placeholder_cover-2.jpg` | 266,015 | `15ddbe9c08672eb361d88d9137c8800635f651b4441b0dfad45f6129a3ca9fab` |
| `assets/placeholder_cover.jpg` | 283,339 | `b6723bb8925ee1bbdd01385a2919398433b8265709410a915e39008f91dbb1c8` |
| `img/1.png` | 1,057,426 | `814a60fdeac54f0e464b04c21b6c69d6f6987ab626b70abe7313fa42df4daa80` |
| `img/head2.png` | 2,147,171 | `8eb35eea2f47c531437d3581ebc79027bbafaf59e75ea6f3a5236b3dce3c63a9` |
| `img/preview-cad.png` | 527,134 | `8d7283a3a87ba7fba685553b768ab6cd02c9ed0930881ae3d51cca647b8a3315` |
| `img/preview-cappella.jpg` | 105,827 | `9242386668aa489a23bd315783dc26f4e503dc6b0a50ff120383521a880fea6a` |
| `img/preview-diorama.png` | 579,807 | `08fc1c7677bba68cd6107f817238fea4ce1f14829cdcd7b8c3ee7e344fcce012` |
| `img/preview-fume.png` | 872,460 | `54be2c826d3c4e35ab2d7d10a4f7b9bdb07a6da04c490cbeb3703a369962fafe` |
| `img/preview-lumi.png` | 497,898 | `dca8d73686fb497bc3833d8a10c733dd42d67e58913d26afde134ebc37f48381` |
| `img/preview-pat.png` | 537,838 | `5e05170249c5f770cc7ddf76eda73a4dde040fd223aeda2305a8b4147252646c` |
| `img/preview-pendolo.png` | 1,735,168 | `561a8581b745ad03e402f02bcdf1ca0406c7ee14d17af85e3ac8196199d60262` |
| `img/preview-tilt.png` | 90,894 | `fdee2b7c2f11369869f516c60d0e79a33542c77364538dd426d141aea7a6c305` |
| `img/visualizer.png` | 3,645,512 | `5f395a4f024d9406923c111add8fad919b31b967f67ada5487e6909d39673563` |
| `packaging/aur/folia-major-bin/folia-major.png` | 52,408 | `cffe4a4fe5608706e2522de3b4cd8cc174357a9310493f107553794831312054` |
| `public/icon.svg` | 1,507 | `4c5c58a5665f1f7c18dbf5c17e8bd5c63cd34be5e63e4109a5992c2f6b9603e3` |
| `src/assets/discord.png` | 17,920 | `73f16810c6e4a6316477c00f01b66f819608fd73e6cab32555acf4e293d70e16` |
| `src/assets/providers/qq.svg` | 755 | `c13e8dd5eaf00440d121972685b6e84cc07ab54ad669e473dc76f2d4cd38d9ba` |
| `src/assets/providers/wechat.svg` | 655 | `42168143aa193d811e5fa407a700a9b493c416f5ceb74825de465dd31d02e4be` |
| `src/components/visualizer/cappella/avatar/avatar10.png` | 115,463 | `4035121ed3b22b5003f4e27ba6e9c6aeecdebd507efa061892f8875e6ef3a959` |
| `src/components/visualizer/cappella/avatar/avatar11.png` | 111,145 | `25a068ab205b3a88c05a46a4ad046057b0051237f565c428eec22f7c503e8e28` |
| `src/components/visualizer/cappella/avatar/avatar12.png` | 107,763 | `f15f4965291ab9d60e74a1efa157863eac50dbe7a1d5f12352d692eb944ffe9e` |
| `src/components/visualizer/cappella/avatar/avatar13.png` | 99,334 | `adcd0e06daba7a66c9e5999996bc2bb321b2387e22b1e1e98fbbe358ecddb08d` |
| `src/components/visualizer/cappella/avatar/avatar14.png` | 96,385 | `fd53c1e576ba63c8b4b0a9850ae92534fe7a29fc4f7965617ea9dffaa6622145` |
| `src/components/visualizer/cappella/avatar/avatar15.png` | 99,891 | `5da23256a79ffd82fa3730fe47608894864fb71ec439bf6e9c320aafa49e9d02` |
| `src/components/visualizer/cappella/avatar/avatar16.png` | 89,248 | `3dffc23427ba4d7815e9b4a8f2924588898a76bf67fab208461d60c61135a37c` |
| `src/components/visualizer/cappella/avatar/avatar17.png` | 104,869 | `785c65510dbc65f55643285d696b3ebbe8393ae810dd3f4b139a9d4abbc2a391` |
| `src/components/visualizer/cappella/avatar/avatar2.png` | 96,930 | `0a4e767889ed4edd5bd44f01eeee798f97469890b375d7c19b94ff974f689505` |
| `src/components/visualizer/cappella/avatar/avatar3.png` | 93,992 | `d152b38874a2a9673daf3c5d74a14ff4857cb819444abb05e3ace024cf897eb4` |
| `src/components/visualizer/cappella/avatar/avatar4.png` | 99,584 | `45f76f9d6fe69f9fd19f527546caccc1575521b4ffa751b2021e6e6295b1fae1` |
| `src/components/visualizer/cappella/avatar/avatar5.png` | 101,333 | `de40095f9d92bcfe76556e29b16de31fdcef245a88c655a4724917ca5388c06d` |
| `src/components/visualizer/cappella/avatar/avatar6.png` | 113,937 | `a43f830abac8aa239514b774949a3f0f90e34bdaae2bc05ab6955f9af9f13a0a` |
| `src/components/visualizer/cappella/avatar/avatar8.png` | 112,120 | `06e484382164fff797b5556debc0d0bff135a63acbc21a4ef3f6f2bf4bd24913` |
| `src/components/visualizer/cappella/avatar/avatar9.png` | 111,309 | `4b69364b216cd650ba242cb2a0cfbc88c14b8a5009f1b24fb7fd38651699e565` |
| `src/components/visualizer/cappella/emo/happy1.png` | 234,098 | `40a14a6681c64d021f0551a6b952b3d4f18c19a70ab3fe22a345eb2632829b51` |
| `src/components/visualizer/cappella/emo/love1.png` | 232,145 | `52c721eacb9eddf163fa1400845f4a8c061185c8ec461488a6736af01325bb34` |
| `src/components/visualizer/cappella/emo/normal1.png` | 226,498 | `4c187b4cc9d845505debff2cd8920f6f2ef2ccd6f38276c8257fb293a3460fe1` |
| `src/components/visualizer/cappella/emo/sleepy1.png` | 189,843 | `5936e72c149668218b00b3c8be31ceab983f0b4170fbf432d9855620a41e82b9` |
| `src/components/visualizer/cappella/emo/sleepy2.png` | 231,772 | `9fcd10b701c32cd4cd7929b8a869597ffc4ffc299ebedcd1672a472d414b18a5` |
| `src/components/visualizer/cappella/emo/sleepy3.png` | 217,251 | `2933a5cb993b9bb013cb1eab28195b1f9dd0efc49b8c78c7924c863bf92dd340` |
| `src/components/visualizer/cappella/emo/vibe1.png` | 238,340 | `3a9031b76924ef3b9b4e7a308f4adbcce01a893a818ed71fe224d9e8bfe4d969` |
| `src/components/visualizer/cappella/emo/vibe2.png` | 260,266 | `00d9ea690ac2ece66b2f3346faaaab64c4cd5ebb365b2501fcabaacc7b0b70a6` |
| `src/components/visualizer/cappella/emo/vibe3.png` | 261,687 | `73875a9d190f9a0b4799af650cdbc2f53103baa59c78adf03aedd57b26dc5346` |

## Ome 当前应用图标

| 仓库相对路径 | 字节 | SHA-256 |
| --- | ---: | --- |
| `src-tauri/icons/icon.ico` | 41,086 | `2559d53716ff665936e17fbd20a6c7eb7bcc50f824c71846f30310ed77f30611` |
| `src-tauri/icons/icon.png` | 4,711 | `e64e4f98f741744e975875a84f0adf4e54f9a84ddf7b9b02cd9db24f6fcd9483` |

2026-09-26 第七十一批歌词点击定位仅修改前端组件、样式和测试；验收截图 `artifacts/stage-lyric-seek-after.png` 仅作开发证据；未新增图标、字体、音频、视频或打包静态资源。
2026-09-26 第七十二批全曲歌词浏览的基线/验收截图为 `artifacts/stage-lyrics-before-1280.png`、`artifacts/stage-lyrics-before-470.png`、`artifacts/stage-lyrics-after-1280.png` 与 `artifacts/stage-lyrics-after-470.png`，均仅作开发证据；未新增应用图标、字体、音频、视频或打包静态资源。
2026-09-26 第七十三批桌面歌词配色截图为 `output/playwright/desktop-lyrics-after-component-horizontal.png`（真实 Preact 组件、Tauri mock）和 `output/playwright/desktop-lyrics-after-component-vertical.png`（同一组件的竖排 CSS 位置预览夹具）；仅作开发证据，未新增应用图标、字体、音频、视频或打包静态资源。
2026-09-26 P1 鼠标可见性复核截图为 `output/playwright/cursor-qa-library-1280.png`；headless 浏览器中系统光标由浏览器/系统绘制，不会进入页面截图，此截图仅记录演示页面和跟随装饰层状态，不作为系统光标像素证据，也不进入应用包。
2026-09-26 第七十四批光标失焦稳定性基线/验收截图为 `output/playwright/cursor-blur-before-v2.png`、`output/playwright/cursor-focus-after-1280.png`；仅记录浏览器页面与跟随装饰层，不含系统光标像素，也不进入应用包。
2026-09-27 第八十二批远程专辑列表/详情与扫码预览验收截图为 `artifacts/remote-albums-after-1280.png`、`artifacts/remote-albums-after-650.png`、`artifacts/remote-albums-after-650-scrolled.png`、`artifacts/remote-album-detail-after-1280.png`、`artifacts/remote-album-detail-after-650.png`、`artifacts/qr-login-browser-preview-disabled.png`；仅作开发证据，不进入应用包。本批没有新增或复制上游静态图像、字体、音频、视频或其他打包资源。
2026-09-27 第八十四批 Jellyfin 搜索/播放仅新增 Rust/TypeScript 代码与测试；没有新增样式、媒体、参考项目源码或其他打包资源，构建产物仍按忽略规则留在本机。
2026-09-27 第八十五批 Emby 搜索/播放复用远程媒体代码，仅新增 Rust/TypeScript 代码与测试；没有新增样式、媒体、参考项目源码或其他打包资源，构建产物仍按忽略规则留在本机。
2026-09-27 第八十六批 Jellyfin 原生歌词复用现有歌词舞台和桌面歌词组件，仅新增 Rust/TypeScript 代码与测试；没有新增样式、媒体、参考项目源码或其他打包资源，构建产物仍按忽略规则留在本机。
2026-09-27 第八十七批 Jellyfin/Emby 只读专辑与歌单浏览复用现有专辑、歌单和 TrackList 组件，仅新增 Rust/TypeScript 代码与测试；没有新增或复制上游静态图像、字体、音频、视频、依赖或其他打包资源。验收截图只作为开发证据保留。
第八十七批开发截图：`output/remote-album-grid-after-1280.png`、`output/remote-album-detail-after-1280.png`、`output/remote-album-detail-after-720.png`、`output/remote-playlists-after-720.png`、`output/remote-playlist-detail-after-720.png`；扫码浏览器提示复核：`output/qr-login-browser-preview-current.png`。这些文件不进入应用包。
2026-09-27 第八十八批可选 MV 的开发截图：`artifacts/mv-stage-after-1280x720.png`、`artifacts/mv-stage-after-470.png`；仅作验收证据。实现只新增前端状态/组件与样式，没有新增或复制上游图像、字体、音频、视频、依赖或打包资源。

2026-09-27 第八十九批 WebDAV 只读曲库与搜索预览错误修复仅更改应用源代码、规格和测试；未新增或复制参考图像、图标、字体、音频、视频，也未改变应用包资源。新增/更新的验收证据不纳入应用媒体资产清单。
2026-09-27 第九十批 SMB 只读曲库仅新增应用源代码、固定版本 Rust 依赖、规格与测试；没有复制参考项目素材或用户音乐，也没有新增应用打包图像、图标、字体、音频、视频资源。
2026-09-27 第九十一批 MV 画质上限的基线/验收截图为 `artifacts/mv-quality-before-1280.png`、`artifacts/mv-quality-after-1280.png`、`artifacts/mv-quality-after-470.png`；它们仅为开发证据，不进入应用包。本批无新增或复制上游图像、字体、音频、视频或其他媒体资源。
2026-09-27 第九十二批本地 MV 候选的浏览器预览截图为 `artifacts/stage-local-video-after-1280.png`、`artifacts/stage-local-video-after-470.png`；仅作开发证据。实现仅新增 Rust/TypeScript 代码与测试，没有新增/复制媒体、参考项目源码或打包资源。预览使用在线曲目，因此按设计隐藏“在本地找 MV”；本地候选卡片由组件测试验证，真实 Tauri 曲库未连接。
