# 雪音Katto

<p align="center"><img src="public/katto-icon.webp" alt="雪音Katto" width="120" /></p>

**雪音Katto** 是 [Wizard Forest Studio](https://github.com/Isha70852) 的純前端影音處理工具。轉檔、壓縮、分割影片，標記說話片段、整理字幕時間軸，全部都在你的瀏覽器裡完成，檔案不會上傳到任何伺服器。

「Katto」是日文「切（カット）」的羅馬拼音。

👉 **線上使用：<https://isha70852.github.io/yokinoKatto/>**

## 功能

| 功能 | 說明 |
|---|---|
| 轉檔 | 影片轉 MP4、M4V、MOV、WebM、MKV、TS，也能抽出 M4A、MP3、WAV、OGG、AAC、FLAC 音訊 |
| 壓縮 | 依解析度、畫質或自訂位元率壓縮，先預估輸出大小再開始；支援 GPU 硬體編碼 |
| 分割 | 在時間軸上切出片段，可以邊預覽邊調整起訖點，一次匯出多段 |
| 說話標記 | 手動或自動（語音偵測）標記有人說話的片段，分類後匯出 |
| 字幕 | 整理字幕時間軸並匯出 |

介面支援繁體中文、简体中文、English、日本語，也可以切換淺色或深色模式。

## 隱私

所有處理都在瀏覽器內進行（WebCodecs、FFmpeg.wasm），檔案不會離開你的裝置。網站只會在瀏覽器裡記住語言與深淺色的選擇。

## 瀏覽器需求

建議使用最新版的 Chrome 或 Edge，可以用 WebCodecs 與 GPU 加速。其他瀏覽器會改用 FFmpeg.wasm，速度比較慢；GitHub Pages 無法開啟 SharedArrayBuffer，所以 FFmpeg 會以單執行緒模式運作。

## 開發

需要 Node.js 20.19 以上（建議 22）。

```bash
npm install
npm run dev
```

開發伺服器會開在 `http://localhost:5173/yokinoKatto/`。

```bash
npm run build   # 輸出到 dist/
```

## 部署

推送到 `main` 分支後，GitHub Actions（`.github/workflows/deploy.yml`）會自動建置並發布到 GitHub Pages。網站路徑設定在 `vite.config.js` 的 `base: '/yokinoKatto/'`，repo 改名時要一起修改。

## 授權

[MIT](LICENSE) © Wizard Forest Studio
