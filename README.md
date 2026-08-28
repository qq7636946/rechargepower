# rechargepower

台普威能源（RechargePower）網站 3D 頁面的線上預覽用 repo。

## 內容

| 檔案 | 說明 |
| --- | --- |
| `3d-our-business.html` | Our Business 3D 場景頁（three.js r170，走 CDN importmap） |
| `textures/` | 場景貼圖，實際載入的是 `tex-atlas.png`（UV 圖集） |
| `index.html` | 導向 `3d-our-business.html` 的入口頁 |

## 線上預覽

GitHub Pages 啟用後：

- https://qq7636946.github.io/rechargepower/
- https://qq7636946.github.io/rechargepower/3d-our-business.html

## 本機預覽

因為頁面用 ES module importmap 載入 three.js，必須透過 HTTP 伺服器開啟，不能直接雙擊檔案：

```
npx serve .
```
