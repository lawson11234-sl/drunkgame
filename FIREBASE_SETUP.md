# Firebase 联网设置

这个项目已经支持 Firebase Realtime Database。

## 你需要做什么

1. 打开 Firebase 控制台，创建一个项目。
2. 在项目里创建一个 Web App。
3. 开启 Realtime Database。
4. 把 Firebase 给你的配置复制到 `firebase-config.js`。

## 配置位置

打开 `firebase-config.js`，把空字符串替换成 Firebase 给你的值：

```js
window.FIREBASE_CONFIG = {
  apiKey: "你的 apiKey",
  authDomain: "你的 authDomain",
  databaseURL: "你的 databaseURL",
  projectId: "你的 projectId",
  storageBucket: "你的 storageBucket",
  messagingSenderId: "你的 messagingSenderId",
  appId: "你的 appId"
};
```

## 测试用数据库规则

开发测试时可以先用：

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

这个规则方便测试，但不是长期正式规则。正式上线前应该加更严格的限制。

## 怎么确认已经联网

打开首页，如果看到“线上同步已开启”，就说明 Firebase 配置被识别了。

如果看到“当前是本地试玩”，说明 `firebase-config.js` 还没有填好。
