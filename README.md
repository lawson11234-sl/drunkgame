# 吹牛骰网页工具

一个适合朋友聚会使用的吹牛骰网页工具。

## 功能

- 线上模式：创建房间、加入房间、隐藏骰子、页面内报数、开盅判断输赢。
- 面对面模式：创建房间、加入房间、只负责摇骰、开盅和统计，报数由玩家现场喊。
- 支持简单斋规则。
- 像素酒馆风界面。

## 本地预览

```bash
python3 -m http.server 5173 --bind 127.0.0.1
```

然后打开：

```text
http://localhost:5173/
```

## Firebase 联网

如果要让不同手机真正共享同一个房间，需要配置 Firebase Realtime Database。

配置说明见：

```text
FIREBASE_SETUP.md
```

没有填写 Firebase 配置时，网页会以本地试玩模式运行。
