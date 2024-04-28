# 幕客设计稿转html代码

## 开始使用

1. 编译

```bash
git clone https://github.com/bgfist/idoc2html.git
cd idoc2html
npm install
npm run script
```

生成的脚本在 `dist` 目录下，可以通过live-server启动一个本地服务器，访问 `http://127.0.0.1:5500/dist/script.js` 进行测试。

2. 添加chrome书签脚本

在chrome书签管理器界面，添加新书签，网址为：

```js
javascript: document.head.appendChild(
    (script => [script, (script.src = 'http://127.0.0.1:5500/dist/script.js')])(
        document.createElement('script')
    )[0]
);
```

3. 使用

在chrome浏览器中，打开一个幕客设计稿网页，点击新添加的书签，根据右下角的指示生成html代码。
