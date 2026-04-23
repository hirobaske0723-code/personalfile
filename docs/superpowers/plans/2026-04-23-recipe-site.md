# レシピ管理サイト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notionをバックエンドとして使い、URLから自動取り込み・画像差し替えができる個人用レシピ管理ページを追加する。

**Architecture:** Vercelのサーバーレス関数(api/*.js)でNotion APIとのやり取りを行い、recipe.htmlがVanilla JSでそれらを呼び出す。URLからのレシピ取り込みはGemini(gemini-2.0-flash)で解析し、画像差し替えはimgbbに保存する。

**Tech Stack:** Vanilla HTML/CSS/JS、Vercel Serverless Functions (ES Modules)、Notion API v2022-06-28、Gemini API、imgbb API

---

## ファイル構成

| ファイル | 変更種別 | 責務 |
|---------|---------|------|
| `api/recipe-get.js` | 新規作成 | Notionからレシピ一覧を取得・整形して返す |
| `api/recipe-save.js` | 新規作成 | レシピをNotionに作成(pageIdなし)または更新(pageIdあり) |
| `api/recipe-import.js` | 新規作成 | URLのHTMLをフェッチしGeminiでレシピ情報を抽出 |
| `api/recipe-upload-image.js` | 新規作成 | base64画像をimgbbにアップロードして永続URLを返す |
| `recipe.html` | 新規作成 | レシピ一覧・追加・編集・画像差し替えUI |

---

## Task 1: api/recipe-get.js — Notionからレシピ取得

**Files:**
- Create: `api/recipe-get.js`

- [ ] **Step 1: `api/recipe-get.js` を作成する**

```javascript
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { NOTION_TOKEN, NOTION_RECIPE_DATABASE_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_RECIPE_DATABASE_ID) {
    return res.status(500).json({ error: 'env not set' });
  }

  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_RECIPE_DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sorts: [{ property: '料理名', direction: 'ascending' }],
        }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(200).json({ error: data.message });

    const recipes = (data.results || []).map(page => ({
      id: page.id,
      name: page.properties['料理名']?.title?.[0]?.plain_text || '',
      category: page.properties['カテゴリ']?.select?.name || '',
      difficulty: page.properties['難易度']?.select?.name || '',
      cookingTime: page.properties['調理時間']?.number || null,
      ingredients: page.properties['材料']?.rich_text?.map(t => t.plain_text).join('') || '',
      steps: page.properties['手順']?.rich_text?.map(t => t.plain_text).join('') || '',
      memo: page.properties['メモ']?.rich_text?.map(t => t.plain_text).join('') || '',
      imageUrl: page.properties['画像']?.url || '',
      sourceUrl: page.properties['ソースURL']?.url || '',
    }));

    res.status(200).json(recipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 2: 動作確認（Notionデータベースがある場合）**

ローカルでVercel Dev が動いていれば:
```bash
curl http://localhost:3000/api/recipe-get
```
Expected: `[]` または レシピ配列（DBが空なら空配列）

環境変数未設定の場合: `{"error":"env not set"}` が返ることを確認。

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/hirob/personalfile"
git add api/recipe-get.js
git commit -m "feat: recipe-get - Notionからレシピ一覧を取得するAPI"
```

---

## Task 2: api/recipe-save.js — レシピ作成・更新

**Files:**
- Create: `api/recipe-save.js`

- [ ] **Step 1: `api/recipe-save.js` を作成する**

```javascript
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { NOTION_TOKEN, NOTION_RECIPE_DATABASE_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_RECIPE_DATABASE_ID) {
    return res.status(500).json({ error: 'env not set' });
  }

  const { pageId, name, category, difficulty, cookingTime, ingredients, steps, memo, imageUrl, sourceUrl } = req.body || {};
  if (!name) return res.status(400).json({ error: '料理名は必須です' });

  // Notion rich_text は1要素あたり2000文字制限のため分割
  function toRichText(text) {
    if (!text) return [];
    const chunks = [];
    for (let i = 0; i < text.length; i += 1990) {
      chunks.push({ text: { content: text.slice(i, i + 1990) } });
    }
    return chunks;
  }

  const properties = {
    '料理名': { title: [{ text: { content: name } }] },
    'カテゴリ': category ? { select: { name: category } } : { select: null },
    '難易度': difficulty ? { select: { name: difficulty } } : { select: null },
    '調理時間': { number: cookingTime ? Number(cookingTime) : null },
    '材料': { rich_text: toRichText(ingredients) },
    '手順': { rich_text: toRichText(steps) },
    'メモ': { rich_text: toRichText(memo) },
    '画像': { url: imageUrl || null },
    'ソースURL': { url: sourceUrl || null },
  };

  try {
    let response;
    if (pageId) {
      // 更新
      response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      });
    } else {
      // 新規作成
      response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: NOTION_RECIPE_DATABASE_ID },
          properties,
        }),
      });
    }

    const data = await response.json();
    if (!response.ok) return res.status(200).json({ error: data.message || 'Notion error' });
    res.status(200).json({ ok: true, id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 2: 動作確認**

```bash
curl -X POST http://localhost:3000/api/recipe-save \
  -H "Content-Type: application/json" \
  -d '{"name":"テスト料理","category":"和食","difficulty":"簡単","cookingTime":30,"ingredients":"材料A","steps":"手順1","memo":"","imageUrl":"","sourceUrl":""}'
```
Expected: `{"ok":true,"id":"..."}` （NotionにページIDが返る）

env未設定時: `{"error":"env not set"}` を確認。

- [ ] **Step 3: Commit**

```bash
git add api/recipe-save.js
git commit -m "feat: recipe-save - レシピのNotion作成・更新API"
```

---

## Task 3: api/recipe-import.js — URLからレシピ自動解析

**Files:**
- Create: `api/recipe-import.js`

- [ ] **Step 1: `api/recipe-import.js` を作成する**

```javascript
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    // HTMLを取得
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeImporter/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!pageRes.ok) return res.status(200).json({ error: `URLの取得に失敗しました (${pageRes.status})` });
    const html = await pageRes.text();

    // HTMLを平文に変換（script/style/タグを除去）
    const plainText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000); // Geminiのトークン制限対策

    // 画像URLを抽出（og:imageを優先）
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const ogImageUrl = ogImageMatch ? ogImageMatch[1] : '';

    const prompt = `以下はレシピサイトのHTMLをテキスト変換したものです。
料理のレシピ情報をJSONで抽出してください。

テキスト:
${plainText}

以下のJSON形式のみで返してください（余分なテキスト不要）:
{
  "name": "料理名",
  "category": "和食 または 洋食 または 中華 または イタリアン または その他",
  "difficulty": "簡単 または 普通 または 難しい",
  "cookingTime": 調理時間（分・整数・不明なら null）,
  "ingredients": "材料リスト（改行区切り、例: じゃがいも 3個\\n牛肉 200g）",
  "steps": "調理手順（改行区切り、例: 1. じゃがいもを切る\\n2. 炒める）"
}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const geminiData = await geminiRes.json();

    if (geminiData.error) {
      return res.status(200).json({ error: `解析エラー: ${geminiData.error.message}` });
    }
    if (!geminiData.candidates?.length) {
      return res.status(200).json({ error: '解析結果が取得できませんでした' });
    }

    const text = geminiData.candidates[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ error: 'レシピ情報を抽出できませんでした。手動で入力してください。' });

    const recipe = JSON.parse(jsonMatch[0]);
    recipe.imageUrl = ogImageUrl; // og:imageを追加
    recipe.sourceUrl = url;

    res.status(200).json(recipe);
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(200).json({ error: 'URLの取得がタイムアウトしました' });
    }
    res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 2: 動作確認**

```bash
curl -X POST http://localhost:3000/api/recipe-import \
  -H "Content-Type: application/json" \
  -d '{"url":"https://cookpad.com/recipe/1234567"}'
```
Expected: `{"name":"...","ingredients":"...","steps":"...","imageUrl":"...","sourceUrl":"..."}` 形式のJSON

- [ ] **Step 3: Commit**

```bash
git add api/recipe-import.js
git commit -m "feat: recipe-import - URLからGeminiでレシピを自動抽出するAPI"
```

---

## Task 4: api/recipe-upload-image.js — 写真をimgbbにアップロード

**Files:**
- Create: `api/recipe-upload-image.js`

- [ ] **Step 1: `api/recipe-upload-image.js` を作成する**

```javascript
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { IMGBB_API_KEY } = process.env;
  if (!IMGBB_API_KEY) return res.status(500).json({ error: 'IMGBB_API_KEY not set' });

  const { image, fileName } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image is required' });

  try {
    const formData = new URLSearchParams();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', image); // base64文字列
    if (fileName) formData.append('name', fileName);

    const uploadRes = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    const data = await uploadRes.json();

    if (!data.success) {
      return res.status(200).json({ error: data.error?.message || '画像のアップロードに失敗しました' });
    }

    res.status(200).json({ url: data.data.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 2: 動作確認**

```bash
# 1x1 ピクセルの最小PNG（base64）で確認
curl -X POST http://localhost:3000/api/recipe-upload-image \
  -H "Content-Type: application/json" \
  -d '{"image":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","fileName":"test.png"}'
```
Expected: `{"url":"https://i.ibb.co/..."}` 形式のURL

- [ ] **Step 3: Commit**

```bash
git add api/recipe-upload-image.js
git commit -m "feat: recipe-upload-image - 写真をimgbbにアップロードするAPI"
```

---

## Task 5: recipe.html — レシピ管理UI

**Files:**
- Create: `recipe.html`

- [ ] **Step 1: `recipe.html` を作成する**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>レシピ — BASE</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<meta name="theme-color" content="#080c14">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, 'Hiragino Kaku Gothic ProN', 'BIZ UDGothic', sans-serif;
    background: #080c14;
    background-image:
      radial-gradient(ellipse at 15% 40%, rgba(251,146,60,0.07) 0%, transparent 55%),
      radial-gradient(ellipse at 85% 10%, rgba(239,68,68,0.07) 0%, transparent 55%);
    min-height: 100vh;
    color: #f0f0f0;
    padding: 0 0 80px;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 20px;
    max-width: 900px;
    margin: 0 auto;
  }
  .back-link {
    color: rgba(255,255,255,0.45);
    text-decoration: none;
    font-size: 0.85rem;
    letter-spacing: 0.05em;
  }
  .back-link:hover { color: #f0f0f0; }
  .header h1 { font-size: 1.4rem; font-weight: 700; }
  .add-btn {
    background: linear-gradient(135deg, #fb923c, #ef4444);
    color: white;
    border: none;
    border-radius: 20px;
    padding: 8px 18px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.03em;
  }
  .add-btn:hover { opacity: 0.85; }

  /* ── Filter bar ── */
  .filter-bar {
    max-width: 900px;
    margin: 0 auto 20px;
    padding: 0 20px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .filter-btn {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.6);
    border-radius: 16px;
    padding: 5px 14px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .filter-btn.active, .filter-btn:hover {
    background: rgba(251,146,60,0.2);
    border-color: rgba(251,146,60,0.5);
    color: #fb923c;
  }

  /* ── Recipe grid ── */
  .grid {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }
  .card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.15s;
  }
  .card:hover { transform: translateY(-2px); border-color: rgba(251,146,60,0.35); }
  .card-img {
    width: 100%;
    height: 160px;
    object-fit: cover;
    background: rgba(255,255,255,0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
  }
  .card-img img { width: 100%; height: 100%; object-fit: cover; }
  .card-body { padding: 14px; }
  .card-name { font-size: 1rem; font-weight: 600; margin-bottom: 6px; }
  .card-meta { display: flex; gap: 6px; flex-wrap: wrap; }
  .badge {
    font-size: 0.68rem;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(251,146,60,0.15);
    color: #fb923c;
  }
  .badge.diff-easy { background: rgba(34,197,94,0.15); color: #4ade80; }
  .badge.diff-hard { background: rgba(239,68,68,0.15); color: #f87171; }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: rgba(255,255,255,0.3);
    grid-column: 1 / -1;
  }
  .empty-state p { font-size: 0.9rem; margin-top: 8px; }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.7);
    display: none;
    align-items: flex-start;
    justify-content: center;
    z-index: 100;
    overflow-y: auto;
    padding: 20px 16px;
  }
  .modal-overlay.open { display: flex; }
  .modal {
    background: #111827;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    width: 100%;
    max-width: 560px;
    padding: 28px 24px;
    position: relative;
    margin: auto;
  }
  .modal-title {
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 20px;
  }
  .close-btn {
    position: absolute;
    top: 16px; right: 16px;
    background: none;
    border: none;
    color: rgba(255,255,255,0.4);
    font-size: 1.4rem;
    cursor: pointer;
    line-height: 1;
  }
  .close-btn:hover { color: #f0f0f0; }

  /* ── Form ── */
  .form-group { margin-bottom: 16px; }
  .form-group label {
    display: block;
    font-size: 0.78rem;
    color: rgba(255,255,255,0.5);
    margin-bottom: 5px;
    letter-spacing: 0.04em;
  }
  .form-group input, .form-group select, .form-group textarea {
    width: 100%;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 10px 13px;
    color: #f0f0f0;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
    border-color: rgba(251,146,60,0.5);
  }
  .form-group select option { background: #111827; }
  .form-group textarea { resize: vertical; min-height: 90px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* URL取り込みセクション */
  .import-section {
    background: rgba(251,146,60,0.07);
    border: 1px solid rgba(251,146,60,0.2);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 20px;
  }
  .import-section label {
    font-size: 0.78rem;
    color: rgba(255,255,255,0.5);
    display: block;
    margin-bottom: 6px;
  }
  .import-row { display: flex; gap: 8px; }
  .import-row input {
    flex: 1;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 9px 12px;
    color: #f0f0f0;
    font-size: 0.85rem;
    outline: none;
  }
  .import-btn {
    background: rgba(251,146,60,0.2);
    border: 1px solid rgba(251,146,60,0.4);
    color: #fb923c;
    border-radius: 8px;
    padding: 9px 14px;
    font-size: 0.82rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .import-btn:hover { background: rgba(251,146,60,0.3); }
  .import-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .import-status { font-size: 0.78rem; margin-top: 6px; color: rgba(255,255,255,0.4); }
  .import-status.error { color: #f87171; }

  /* 画像プレビュー */
  .image-preview-wrap {
    position: relative;
    margin-bottom: 8px;
  }
  .image-preview {
    width: 100%;
    height: 140px;
    object-fit: cover;
    border-radius: 10px;
    background: rgba(255,255,255,0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.2);
    font-size: 0.82rem;
    overflow: hidden;
  }
  .image-preview img { width: 100%; height: 100%; object-fit: cover; }
  .replace-btn {
    display: inline-block;
    margin-top: 6px;
    font-size: 0.78rem;
    color: rgba(255,255,255,0.4);
    cursor: pointer;
    text-decoration: underline;
  }
  .replace-btn:hover { color: #fb923c; }
  #image-file-input { display: none; }
  .upload-status { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 4px; }
  .upload-status.error { color: #f87171; }

  /* 詳細表示 */
  .detail-img {
    width: 100%; height: 200px; object-fit: cover;
    border-radius: 12px; margin-bottom: 16px;
    background: rgba(255,255,255,0.05);
    display: flex; align-items: center; justify-content: center;
    font-size: 3rem; overflow: hidden;
  }
  .detail-img img { width: 100%; height: 100%; object-fit: cover; }
  .detail-section { margin-bottom: 18px; }
  .detail-section h3 {
    font-size: 0.75rem;
    color: rgba(255,255,255,0.4);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .detail-section p {
    font-size: 0.9rem;
    line-height: 1.7;
    color: rgba(255,255,255,0.85);
    white-space: pre-wrap;
  }
  .detail-actions {
    display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap;
  }

  /* ボタン共通 */
  .btn-primary {
    background: linear-gradient(135deg, #fb923c, #ef4444);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 11px 24px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    margin-top: 8px;
  }
  .btn-primary:hover { opacity: 0.88; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost {
    background: rgba(255,255,255,0.07);
    color: rgba(255,255,255,0.6);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px;
    padding: 10px 20px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .btn-ghost:hover { background: rgba(255,255,255,0.12); color: #f0f0f0; }

  /* ローディング */
  .loading { text-align: center; padding: 60px; color: rgba(255,255,255,0.3); }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    display: inline-block;
    width: 24px; height: 24px;
    border: 2px solid rgba(255,255,255,0.15);
    border-top-color: #fb923c;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    margin-bottom: 10px;
  }
</style>
</head>
<body>

<div class="header">
  <a href="/" class="back-link">← BASE</a>
  <h1>🍳 レシピ</h1>
  <button class="add-btn" onclick="openAddModal()">+ 追加</button>
</div>

<div class="filter-bar" id="filter-bar">
  <button class="filter-btn active" onclick="setFilter('')" data-cat="">すべて</button>
  <button class="filter-btn" onclick="setFilter('和食')" data-cat="和食">和食</button>
  <button class="filter-btn" onclick="setFilter('洋食')" data-cat="洋食">洋食</button>
  <button class="filter-btn" onclick="setFilter('中華')" data-cat="中華">中華</button>
  <button class="filter-btn" onclick="setFilter('イタリアン')" data-cat="イタリアン">イタリアン</button>
  <button class="filter-btn" onclick="setFilter('その他')" data-cat="その他">その他</button>
</div>

<div class="grid" id="recipe-grid">
  <div class="loading"><div class="spinner"></div><br>読み込み中...</div>
</div>

<!-- 詳細モーダル -->
<div class="modal-overlay" id="detail-modal">
  <div class="modal">
    <button class="close-btn" onclick="closeModal('detail-modal')">×</button>
    <div id="detail-content"></div>
  </div>
</div>

<!-- 追加・編集モーダル -->
<div class="modal-overlay" id="edit-modal">
  <div class="modal">
    <button class="close-btn" onclick="closeModal('edit-modal')">×</button>
    <div class="modal-title" id="edit-modal-title">レシピを追加</div>

    <!-- URL取り込みセクション -->
    <div class="import-section" id="import-section">
      <label>URLからレシピを取り込む</label>
      <div class="import-row">
        <input type="url" id="import-url" placeholder="https://cookpad.com/recipe/..." />
        <button class="import-btn" id="import-btn" onclick="importFromUrl()">解析</button>
      </div>
      <div class="import-status" id="import-status"></div>
    </div>

    <!-- フォーム -->
    <form id="recipe-form" onsubmit="saveRecipe(event)">
      <input type="hidden" id="form-page-id" />

      <!-- 画像 -->
      <div class="form-group">
        <label>料理の画像</label>
        <div class="image-preview-wrap">
          <div class="image-preview" id="image-preview">画像なし</div>
        </div>
        <input type="hidden" id="form-image-url" />
        <span class="replace-btn" onclick="document.getElementById('image-file-input').click()">📷 写真を差し替え</span>
        <input type="file" id="image-file-input" accept="image/*" onchange="uploadImage(this)" />
        <div class="upload-status" id="upload-status"></div>
      </div>

      <div class="form-group">
        <label>料理名 *</label>
        <input type="text" id="form-name" required placeholder="例：肉じゃが" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>カテゴリ</label>
          <select id="form-category">
            <option value="">選択なし</option>
            <option value="和食">和食</option>
            <option value="洋食">洋食</option>
            <option value="中華">中華</option>
            <option value="イタリアン">イタリアン</option>
            <option value="その他">その他</option>
          </select>
        </div>
        <div class="form-group">
          <label>難易度</label>
          <select id="form-difficulty">
            <option value="">選択なし</option>
            <option value="簡単">簡単</option>
            <option value="普通">普通</option>
            <option value="難しい">難しい</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>調理時間（分）</label>
        <input type="number" id="form-cooking-time" placeholder="例：30" min="1" />
      </div>

      <div class="form-group">
        <label>材料</label>
        <textarea id="form-ingredients" placeholder="じゃがいも 3個&#10;牛肉 200g&#10;玉ねぎ 1個"></textarea>
      </div>

      <div class="form-group">
        <label>手順</label>
        <textarea id="form-steps" rows="5" placeholder="1. じゃがいもを切る&#10;2. 炒める"></textarea>
      </div>

      <div class="form-group">
        <label>メモ</label>
        <textarea id="form-memo" rows="2" placeholder="ポイントや感想など"></textarea>
      </div>

      <input type="hidden" id="form-source-url" />

      <button type="submit" class="btn-primary" id="save-btn">保存する</button>
    </form>
  </div>
</div>

<script>
  let allRecipes = [];
  let currentFilter = '';

  // ── データ取得 ──
  async function loadRecipes() {
    try {
      const res = await fetch('/api/recipe-get');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      allRecipes = data;
      renderGrid();
    } catch (e) {
      document.getElementById('recipe-grid').innerHTML =
        `<div class="empty-state">⚠️ 読み込みに失敗しました<p>${e.message}</p></div>`;
    }
  }

  // ── フィルター ──
  function setFilter(cat) {
    currentFilter = cat;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });
    renderGrid();
  }

  // ── 一覧描画 ──
  function renderGrid() {
    const filtered = currentFilter
      ? allRecipes.filter(r => r.category === currentFilter)
      : allRecipes;

    const grid = document.getElementById('recipe-grid');
    if (!filtered.length) {
      grid.innerHTML = `<div class="empty-state">🍽️ レシピがありません<p>「+ 追加」からレシピを登録しましょう</p></div>`;
      return;
    }

    grid.innerHTML = filtered.map(r => `
      <div class="card" onclick='openDetail(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
        <div class="card-img">
          ${r.imageUrl
            ? `<img src="${escHtml(r.imageUrl)}" alt="${escHtml(r.name)}" onerror="this.parentNode.textContent='🍳'">`
            : '🍳'}
        </div>
        <div class="card-body">
          <div class="card-name">${escHtml(r.name)}</div>
          <div class="card-meta">
            ${r.category ? `<span class="badge">${escHtml(r.category)}</span>` : ''}
            ${r.difficulty ? `<span class="badge diff-${r.difficulty === '簡単' ? 'easy' : r.difficulty === '難しい' ? 'hard' : ''}">${escHtml(r.difficulty)}</span>` : ''}
            ${r.cookingTime ? `<span class="badge">⏱ ${r.cookingTime}分</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  // ── 詳細モーダル ──
  function openDetail(recipe) {
    const el = document.getElementById('detail-content');
    el.innerHTML = `
      <div class="detail-img" id="detail-img-wrap">
        ${recipe.imageUrl
          ? `<img src="${escHtml(recipe.imageUrl)}" alt="${escHtml(recipe.name)}" onerror="this.parentNode.textContent='🍳'">`
          : '🍳'}
      </div>
      <div style="margin-bottom:6px;">
        <div style="font-size:1.3rem;font-weight:700;margin-bottom:8px;">${escHtml(recipe.name)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${recipe.category ? `<span class="badge">${escHtml(recipe.category)}</span>` : ''}
          ${recipe.difficulty ? `<span class="badge">${escHtml(recipe.difficulty)}</span>` : ''}
          ${recipe.cookingTime ? `<span class="badge">⏱ ${recipe.cookingTime}分</span>` : ''}
        </div>
      </div>
      ${recipe.ingredients ? `<div class="detail-section"><h3>材料</h3><p>${escHtml(recipe.ingredients)}</p></div>` : ''}
      ${recipe.steps ? `<div class="detail-section"><h3>手順</h3><p>${escHtml(recipe.steps)}</p></div>` : ''}
      ${recipe.memo ? `<div class="detail-section"><h3>メモ</h3><p>${escHtml(recipe.memo)}</p></div>` : ''}
      ${recipe.sourceUrl ? `<div style="margin-top:8px;"><a href="${escHtml(recipe.sourceUrl)}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.3);font-size:0.75rem;">🔗 元のレシピサイト</a></div>` : ''}
      <div class="detail-actions">
        <button class="btn-ghost" onclick='openEditModal(${JSON.stringify(recipe).replace(/'/g, "&#39;")})'>✏️ 編集</button>
        <button class="btn-ghost" onclick='openImageReplace(${JSON.stringify(recipe).replace(/'/g, "&#39;")})'>📷 画像差し替え</button>
      </div>
    `;
    openModal('detail-modal');
  }

  // ── 画像差し替え（詳細モーダルから） ──
  let replacingRecipe = null;
  function openImageReplace(recipe) {
    replacingRecipe = recipe;
    closeModal('detail-modal');
    openEditModal(recipe);
    // editモーダルが開いたら画像変更ボタンにフォーカス
    setTimeout(() => document.getElementById('image-file-input').click(), 200);
  }

  // ── 追加モーダル ──
  function openAddModal() {
    document.getElementById('edit-modal-title').textContent = 'レシピを追加';
    document.getElementById('import-section').style.display = '';
    resetForm();
    openModal('edit-modal');
  }

  // ── 編集モーダル ──
  function openEditModal(recipe) {
    document.getElementById('edit-modal-title').textContent = 'レシピを編集';
    document.getElementById('import-section').style.display = 'none';
    fillForm(recipe);
    openModal('edit-modal');
    closeModal('detail-modal');
  }

  function fillForm(recipe) {
    document.getElementById('form-page-id').value = recipe.id || '';
    document.getElementById('form-name').value = recipe.name || '';
    document.getElementById('form-category').value = recipe.category || '';
    document.getElementById('form-difficulty').value = recipe.difficulty || '';
    document.getElementById('form-cooking-time').value = recipe.cookingTime || '';
    document.getElementById('form-ingredients').value = recipe.ingredients || '';
    document.getElementById('form-steps').value = recipe.steps || '';
    document.getElementById('form-memo').value = recipe.memo || '';
    document.getElementById('form-image-url').value = recipe.imageUrl || '';
    document.getElementById('form-source-url').value = recipe.sourceUrl || '';
    updateImagePreview(recipe.imageUrl);
  }

  function resetForm() {
    document.getElementById('recipe-form').reset();
    document.getElementById('form-page-id').value = '';
    document.getElementById('form-image-url').value = '';
    document.getElementById('form-source-url').value = '';
    document.getElementById('import-url').value = '';
    document.getElementById('import-status').textContent = '';
    document.getElementById('upload-status').textContent = '';
    updateImagePreview('');
  }

  function updateImagePreview(url) {
    const wrap = document.getElementById('image-preview');
    if (url) {
      wrap.innerHTML = `<img src="${escHtml(url)}" onerror="this.parentNode.textContent='画像なし'" />`;
    } else {
      wrap.textContent = '画像なし';
    }
  }

  // ── URLインポート ──
  async function importFromUrl() {
    const url = document.getElementById('import-url').value.trim();
    if (!url) return;
    const btn = document.getElementById('import-btn');
    const status = document.getElementById('import-status');
    btn.disabled = true;
    status.textContent = '🔍 解析中...';
    status.className = 'import-status';
    try {
      const res = await fetch('/api/recipe-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) {
        status.textContent = `⚠️ ${data.error}`;
        status.className = 'import-status error';
        return;
      }
      fillForm({ ...data, id: '' });
      status.textContent = '✅ 取り込み完了。内容を確認してください。';
    } catch (e) {
      status.textContent = `⚠️ 通信エラー: ${e.message}`;
      status.className = 'import-status error';
    } finally {
      btn.disabled = false;
    }
  }

  // ── 画像アップロード ──
  async function uploadImage(input) {
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.getElementById('upload-status');
    statusEl.textContent = '📤 アップロード中...';
    statusEl.className = 'upload-status';
    try {
      const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/recipe-upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, fileName: file.name }),
      });
      const data = await res.json();
      if (data.error) {
        statusEl.textContent = `⚠️ ${data.error}`;
        statusEl.className = 'upload-status error';
        return;
      }
      document.getElementById('form-image-url').value = data.url;
      updateImagePreview(data.url);
      statusEl.textContent = '✅ アップロード完了';
    } catch (e) {
      statusEl.textContent = `⚠️ エラー: ${e.message}`;
      statusEl.className = 'upload-status error';
    }
    input.value = '';
  }

  // ── 保存 ──
  async function saveRecipe(e) {
    e.preventDefault();
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = '保存中...';
    try {
      const payload = {
        pageId: document.getElementById('form-page-id').value || undefined,
        name: document.getElementById('form-name').value.trim(),
        category: document.getElementById('form-category').value,
        difficulty: document.getElementById('form-difficulty').value,
        cookingTime: document.getElementById('form-cooking-time').value
          ? Number(document.getElementById('form-cooking-time').value) : null,
        ingredients: document.getElementById('form-ingredients').value.trim(),
        steps: document.getElementById('form-steps').value.trim(),
        memo: document.getElementById('form-memo').value.trim(),
        imageUrl: document.getElementById('form-image-url').value || '',
        sourceUrl: document.getElementById('form-source-url').value || '',
      };
      const res = await fetch('/api/recipe-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        alert(`保存に失敗しました: ${data.error}`);
        return;
      }
      closeModal('edit-modal');
      await loadRecipes();
    } catch (e) {
      alert(`通信エラー: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '保存する';
    }
  }

  // ── モーダル制御 ──
  function openModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = '';
  }
  // オーバーレイクリックで閉じる
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) closeModal(el.id);
    });
  });

  // ── ユーティリティ ──
  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  loadRecipes();
</script>
</body>
</html>
```

- [ ] **Step 2: ブラウザで動作確認**

```bash
# Vercel Dev で起動（ローカル確認の場合）
# vercel dev
```

ブラウザで `http://localhost:3000/recipe.html` を開き以下を確認:
- レシピ一覧が「読み込み中...」→「レシピがありません」に変わる
- 「+ 追加」ボタンをクリックするとモーダルが開く
- URL欄にレシピサイトのURLを入力して「解析」を押すとフォームが埋まる
- フォームに手動入力して「保存する」を押すとNotionに保存される

- [ ] **Step 3: Commit**

```bash
git add recipe.html
git commit -m "feat: recipe.html - レシピ管理UIを追加（一覧・追加・編集・画像差し替え）"
```

---

## Task 6: index.html にリンクを追加

**Files:**
- Modify: `index.html`

- [ ] **Step 1: index.html のリンクリストにレシピを追加**

`index.html` の既存のリンクリスト（`.links` クラスの中）にレシピページへのリンクを追加する。

既存のリンクの末尾に追加（他のリンクと同じ形式で）:
```html
<a href="/recipe.html" class="link-card">
  <span class="link-icon">🍳</span>
  <span class="link-text">
    <span class="link-title">レシピ</span>
    <span class="link-desc">作りたい料理をまとめる</span>
  </span>
</a>
```

**注意:** `index.html` の既存リンクカードの構造を確認してから、同じ構造で追加すること。`index.html` を読んでから編集すること。

- [ ] **Step 2: ブラウザでホームからレシピページに遷移できることを確認**

`http://localhost:3000/` を開き、レシピカードが表示され、クリックで `recipe.html` に遷移することを確認。

- [ ] **Step 3: Commit & Push**

```bash
git add index.html
git commit -m "feat: index.html にレシピページへのリンクを追加"
git push
```

---

## セルフレビュー

**スペックカバレッジ確認:**
- ✅ `api/recipe-get.js` — Task 1
- ✅ `api/recipe-save.js` — Task 2（create/update兼用）
- ✅ `api/recipe-import.js` — Task 3（URL→Gemini解析、og:image抽出）
- ✅ `api/recipe-upload-image.js` — Task 4（imgbb）
- ✅ `recipe.html` — Task 5（一覧・カテゴリフィルター・追加・編集・画像差し替え）
- ✅ index.html リンク追加 — Task 6
- ✅ Notionプロパティ全9種類すべてカバー

**型整合性確認:**
- `recipe-get.js` が返す `id` フィールド = `recipe-save.js` の `pageId` として使用 ✅
- `recipe-import.js` が返すフィールド名（`name`, `ingredients`, `steps`, `imageUrl`, `sourceUrl`）= `fillForm()` で参照するフィールド名 ✅
- `recipe-upload-image.js` が返す `{ url }` = `uploadImage()` で `data.url` として参照 ✅
