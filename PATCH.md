# MOECISH Design System — Patch 對 `MOECISH/` Next.js 專案

這份 patch 說明你本機 `MOECISH/` 程式碼中，**需要補的缺口**。你現有的 tokens 與這套設計系統已經 95% 對齊，這邊只列「差異」與「建議新增」的部分，可直接複製貼上。

---

## 1. `src/app/globals.css` — 在 `:root` 加入色階變數

你目前的 `:root` 只有 surface / border / text / focus-ring。把下列直接貼到 `:root` 最後一行 `--font-mono: ...;` 之後（`}` 之前）：

```css
  /* ===== Color scales (CSS variables for use outside Tailwind) ===== */
  --primary-50:  #f2f6fb; --primary-100: #e0ebf5; --primary-200: #bfd4e8;
  --primary-300: #95b7d6; --primary-400: #6d9bc3; --primary-500: #5487bd;
  --primary-600: #3e72a8; --primary-700: #2f5b88; --primary-800: #254868;
  --primary-900: #1a334a; --primary-950: #0f2233;

  --sage-50:  #f4f7f4; --sage-100: #e5ede5; --sage-200: #c7d6c7;
  --sage-300: #a3bba5; --sage-400: #809f83; --sage-500: #678669;
  --sage-600: #526e55; --sage-700: #405743; --sage-800: #2e4030;

  --success-50: #f1f7f2; --success-100: #dceadc;
  --success-500: #5a9e72; --success-600: #468459; --success-700: #366946;

  --warning-50: #fcf7eb; --warning-100: #f6e6c3;
  --warning-500: #d08b3b; --warning-600: #b0722c; --warning-700: #895923;

  --danger-50: #fbf0f0; --danger-100: #f2d6d6;
  --danger-500: #b8585a; --danger-600: #9b4548; --danger-700: #7a3537;

  --neutral-0:   #ffffff; --neutral-25:  #fcfcfc; --neutral-50:  #f7f7f7;
  --neutral-100: #f0f0f0; --neutral-150: #e8e8e8; --neutral-200: #dddddd;
  --neutral-300: #c7c7c7; --neutral-400: #a0a0a0; --neutral-500: #6b6b6b;
  --neutral-600: #515151; --neutral-700: #3a3a3a; --neutral-800: #242424;
  --neutral-900: #121212;

  /* ===== Role accent (sidebar strip + avatar ring) ===== */
  --role-admin:      var(--primary-400);
  --role-auditor:    var(--sage-400);
  --role-respondent: var(--neutral-300);
  --role-supervisor: var(--warning-400);

  /* ===== Motion ===== */
  --dur-fast: 80ms;
  --dur-base: 180ms;
  --dur-slow: 250ms;
  --ease-smooth:   cubic-bezier(.4, 0, .2, 1);
  --ease-out-expo: cubic-bezier(.16, 1, .3, 1);

  /* ===== Focus (add danger variant) ===== */
  --focus-ring-danger: 0 0 0 3px rgba(184, 88, 90, 0.18);

  /* ===== Radii ===== */
  --radius-xs: 4px;  --radius-sm: 6px;  --radius:    8px;
  --radius-md: 10px; --radius-lg: 12px; --radius-xl: 14px;
  --radius-2xl:18px; --radius-3xl:24px;
```

---

## 2. `tailwind.config.ts` — 補 sage 的完整 950 色階

你的 `sage` 停在 900。為了和 `primary` 對齊（同樣到 950），在 `sage` 的 `900` 後面加：

```ts
        sage: {
          // ...existing 50–900
          900: '#1f2c20',
          950: '#131c14',   // ← 新增
        },
```

（非必要 — 目前 sage-900 已夠用。列出來只為完整性。）

---

## 3. `tailwind.config.ts` — 補 semantic 色的中間階

`success / warning / danger` 目前只有 `50 / 100 / 500 / 600 / 700`。補齊 `200 / 300 / 400` 可以讓「部分符合」chip 這類 UI 有更柔的邊色可用：

```ts
        success: {
          50: '#f1f7f2', 100: '#dceadc',
          200: '#bfd9c4', 300: '#97c1a2', 400: '#73ac83',
          500: '#5a9e72', 600: '#468459', 700: '#366946',
        },
        warning: {
          50: '#fcf7eb', 100: '#f6e6c3',
          200: '#ecd08a', 300: '#e0b65b', 400: '#d89c45',
          500: '#d08b3b', 600: '#b0722c', 700: '#895923',
        },
        danger: {
          50: '#fbf0f0', 100: '#f2d6d6',
          200: '#e3b0b1', 300: '#d28789', 400: '#c36e70',
          500: '#b8585a', 600: '#9b4548', 700: '#7a3537',
        },
```

---

## 4. `tailwind.config.ts` — 如已有 `focus-danger` 陰影 token 但沒在 CSS 變數裡，補上

你的 config 已經有 `focus-danger`，所以 `shadow-focus-danger` class 可用。CSS 裡用 `--focus-ring-danger` 變數（上面第 1 點已加）。兩邊現在齊全。

---

## 5. （可選）`globals.css` — 對外暴露 semantic 文字樣式 class

這些在你的程式碼裡還沒有。加上後，`<h1 className="ds-display-sm">` 這類原生 class 就可用，不必每次記憶 `text-display-sm font-semibold tracking-[-0.028em]`：

```css
@layer components {
  .ds-display-sm { @apply text-display-sm; }
  .ds-headline   { @apply text-headline; }
  .ds-title-lg   { @apply text-title-lg; }
  .ds-title      { @apply text-title; }
  .ds-body       { @apply text-body; }
  .ds-body-sm    { @apply text-body-sm; }
  .ds-label      { @apply text-label; }
  .ds-caption    { @apply text-caption text-text-muted; }
}
```

---

## Patch 影響範圍

- **不會破壞**任何現有元件 — 全部是**新增**。
- 舊的 `bg-primary-600`、`text-success-500` 等 class 照舊運作，色值完全相同。
- 新增後，你可以在 **純 CSS**（如 `Logo.tsx` 的 inline style）直接用 `var(--primary-600)`，不必再硬碼 `#3e72a8`。

---

## 套用步驟（完整教學）

### 前置

1. 關掉正在跑的 `npm run dev`（按 Ctrl+C）。
2. 用你慣用的編輯器（VS Code / Cursor）打開 `MOECISH/` 資料夾。
3. 先備份兩個檔案（保險）：
   ```bash
   cp src/app/globals.css src/app/globals.css.bak
   cp tailwind.config.ts tailwind.config.ts.bak
   ```

---

### 步驟 1 — 編輯 `src/app/globals.css`

1. 在編輯器打開 `src/app/globals.css`。
2. 找到這一行（大約第 27 行）：
   ```css
     --font-mono: var(--font-jetbrains), ui-monospace, 'SFMono-Regular', Menlo, monospace;
   }
   ```
3. 在 `--font-mono` 那行**之後、`}` 之前**，貼入本文件「第 1 點」整塊 CSS（從 `/* ===== Color scales ===== */` 到 `--radius-3xl:24px;`）。
4. 存檔（Cmd+S / Ctrl+S）。

---

### 步驟 2 — 編輯 `tailwind.config.ts`

1. 打開 `tailwind.config.ts`。
2. 找到 `success: { ... }` 區塊（大約第 35 行）。
3. 整段 `success / warning / danger` 三個物件**全部刪除**，把本文件「第 3 點」的三個完整版貼上去取代。
4. （可選）找到 `sage` 的 `900: '#1f2c20',` 那一行，後面加一行 `950: '#131c14',`。
5. 存檔。

---

### 步驟 3（可選）— 加 type helper class

1. 回到 `globals.css`。
2. 找到檔案裡現有的 `@layer components { ... }`（大約第 103 行，裡面有 `.kbd` 和 `.dotted-divider`）。
3. 在 `}` 之前貼入本文件「第 5 點」的 `.ds-*` 那幾行。
4. 存檔。

---

### 步驟 4 — 驗證

```bash
npm run dev
```

打開 http://localhost:3000

- **應該畫面完全不變**（因為只新增 token，沒改現有值）。
- 瀏覽器 console 不應有新的警告。
- 如果畫面壞掉 → 還原備份：
  ```bash
  mv src/app/globals.css.bak src/app/globals.css
  mv tailwind.config.ts.bak tailwind.config.ts
  ```

---

### 步驟 5 — 驗證新 token 可用

在任一頁面暫時加一個測試元素：

```tsx
<div className="bg-success-300 text-success-700 p-4">新色階測試</div>
<div style={{ background: 'var(--primary-600)', color: '#fff', padding: 16 }}>CSS 變數測試</div>
```

兩個都顯示正確 = 套用成功，刪掉測試碼即可。

---

### 步驟 6 — 刪備份

確定一切正常後：
```bash
rm src/app/globals.css.bak tailwind.config.ts.bak
```

完成。
