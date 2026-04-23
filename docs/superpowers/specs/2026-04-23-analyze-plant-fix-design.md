# 家庭菜園 画像解析バグ修正 設計書

**作成日:** 2026-04-23  
**対象ファイル:** `api/analyze-plant.js`  
**症状:** 画像解析結果が「解析に失敗しました」と表示される（エラーC）

---

## 原因

Gemini API がエラーレスポンス・空レスポンスを返した場合に握り潰している。

1. `data.error` のチェックがないため、APIエラーの内容が画面に出ない
2. `data.candidates` が空（安全フィルター等）のケースが未ハンドリング
3. モデル名 `gemini-2.0-flash-lite` が非推奨・変更されている可能性

---

## 修正内容

**ファイル:** `api/analyze-plant.js`（1ファイルのみ）

### 1. モデル変更
```
gemini-2.0-flash-lite → gemini-2.0-flash
```

### 2. Gemini APIエラーチェックを追加
```javascript
if (data.error) {
  return res.status(200).json({ error: `解析エラー: ${data.error.message || JSON.stringify(data.error)}` });
}
```

### 3. candidates 空チェックを追加
```javascript
if (!data.candidates?.length) {
  return res.status(200).json({ error: '解析結果が取得できませんでした（画像を変えてお試しください）' });
}
```

---

## エラーハンドリングフロー（修正後）

```
Gemini API 呼び出し
  → data.error あり    → 「解析エラー: {内容}」を返す  ← 新規
  → candidates が空   → 「解析結果が取得できませんでした」を返す  ← 新規
  → JSON 取り出せない  → 「解析に失敗しました」（既存）
  → 正常              → 結果オブジェクトを返す（既存）
```
