# rechargepower

網站頁面的線上預覽用 repo。

## 內容

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 入口，列出可預覽的頁面 |
| `index-earth.html` | 首頁，含捲動編排與地球場景；內嵌 `3d-our-business.html` |
| `3d-our-business.html` | Our Business 等角 3D 場站（three.js r170，走 CDN importmap） |
| `textures/` | 3D 場站貼圖，實際載入 19 張，`tex-atlas.png` 為 UV 圖集 |
| `images/` | 首頁圖片與影片 |
| `3D/` | BESS 深度／邊緣圖與貨櫃材質圖 |
| `js/bess-scroll.js` | BESS 捲動編排 |
| `logo2.gltf` | 標誌 3D 模型（buffer 內嵌） |

## 線上預覽

- https://qq7636946.github.io/rechargepower/

## 本機預覽

頁面用 ES module importmap 載入 three.js，必須透過 HTTP 伺服器開啟，不能直接雙擊檔案：

```
npx serve .
```
