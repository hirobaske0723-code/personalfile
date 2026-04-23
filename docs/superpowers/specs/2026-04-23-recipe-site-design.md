# レシピ管理サイト 設計書

**作成日:** 2026-04-23  
**対象リポジトリ:** hirobaske0723-code/personalfile  
**方針:** Notion をバックエンドDBとして使い、URLからのレシピ自動取り込み・画像差し替えに対応した個人用レシピ管理ページを追加する。

---

## 背景・目的

作りたい料理のレシピを1か所にまとめ、外部サイトのURLを貼るだけで自動取り込みできる仕組みを構築する。自分で作った際は完成写真に差し替え可能。

---

## アーキテクチャ

### 新設ファイル

| ファイル | 役割 |
|---------|------|
| `recipe.html` | レシピ一覧・追加・編集UI |
| `api/recipe-get.js` | Notionからレシピ一覧を取得 |
| `api/recipe-save.js` | レシピ作成・更新（pageId なし→作成、あり→更新） |
| `api/recipe-import.js` | URL取得→Gemini解析→レシピ情報返却 |
| `api/recipe-upload-image.js` | 画像ファイル→imgbb→永続URL返却 |

### 既存ファイルへの変更

なし。既存のNotion連携パターンを踏襲するのみ。

---

## Notionデータベース構造

データベース名: **レシピ** （ユーザーが手動で作成）

| プロパティ名 | Notion型 | 備考 |
|------------|---------|------|
| 料理名 | タイトル | 必須 |
| カテゴリ | セレクト | 和食 / 洋食 / 中華 / イタリアン / その他 |
| 難易度 | セレクト | 簡単 / 普通 / 難しい |
| 調理時間 | 数値 | 分単位 |
| 材料 | テキスト | 改行区切りで複数材料 |
| 手順 | テキスト | 改行区切りでステップ |
| メモ | テキスト | 自由メモ |
| 画像 | URL | 料理の画像URL |
| ソースURL | URL | 取り込み元レシピサイトURL |

---

## 環境変数

| 変数名 | 用途 | 既存/新規 |
|--------|------|----------|
| `NOTION_TOKEN` | Notion API認証 | 既存 |
| `NOTION_RECIPE_DATABASE_ID` | レシピDB専用ID | 新規 |
| `GEMINI_API_KEY` | URL解析用AI | 既存 |
| `IMGBB_API_KEY` | 画像アップロード | 新規 |

---

## コンポーネント詳細

### `api/recipe-get.js`

Notion DBからレシピ一覧を取得して返す。

```
GET /api/recipe-get
→ Notion DB (NOTION_RECIPE_DATABASE_ID) をクエリ
→ 全レシピを配列で返す
```

レスポンス例:
```json
[
  {
    "id": "notion-page-id",
    "name": "肉じゃが",
    "category": "和食",
    "difficulty": "普通",
    "cookingTime": 40,
    "ingredients": "じゃがいも 3個\n牛肉 200g\n...",
    "steps": "1. じゃがいもを切る\n2. ...",
    "memo": "",
    "imageUrl": "https://...",
    "sourceUrl": "https://cookpad.com/..."
  }
]
```

### `api/recipe-save.js`

レシピの作成・更新を行う。`pageId` の有無で分岐。

```
POST /api/recipe-save
body: { pageId?, name, category, difficulty, cookingTime, ingredients, steps, memo, imageUrl, sourceUrl }

pageId なし → Notion に新規ページ作成
pageId あり → 既存ページを PATCH で更新
```

### `api/recipe-import.js`

URLからレシピ情報を自動抽出する。

```
POST /api/recipe-import
body: { url }

1. fetch(url) でHTMLを取得
2. HTMLをテキストに変換（scriptタグ・styleタグを除去）
3. Gemini(gemini-2.0-flash)に以下を依頼:
   「このHTMLから料理名・材料・手順・メイン画像URLをJSONで返してください」
4. JSON解析して返す
```

レスポンス例:
```json
{
  "name": "肉じゃが",
  "ingredients": "じゃがいも 3個\n牛肉 200g",
  "steps": "1. じゃがいもを切る\n2. 炒める",
  "imageUrl": "https://example.com/niku-jaga.jpg"
}
```

エラー時: `{ "error": "..." }`

### `api/recipe-upload-image.js`

画像をimgbbにアップロードして永続URLを返す。

```
POST /api/recipe-upload-image
body: { image: base64文字列, fileName }

→ imgbb API (https://api.imgbb.com/1/upload) に送信
→ 永続URLを返す
```

レスポンス: `{ "url": "https://i.ibb.co/..." }`

### `recipe.html`

UIフロー:

```
一覧画面（カード形式）
  ├─ [+ URLから取り込む]
  │   → モーダル: URL入力
  │   → 解析中スピナー
  │   → 編集フォームにオートフィル
  │   → [保存]
  ├─ [+ 手動で追加]
  │   → 編集フォーム（空）
  │   → [保存]
  └─ カードをクリック
      → 詳細表示（材料・手順・メモ）
      → [編集] → 編集フォームに既存値
      → [画像を差し替え]
          → ファイル選択
          → imgbbアップロード
          → Notionの画像URLを更新
```

---

## エラーハンドリング

| ケース | 対応 |
|--------|------|
| URL取得失敗（CORS・タイムアウト） | 「URLを取得できませんでした」を表示 |
| Gemini解析失敗 | 「解析に失敗しました。手動で入力してください」を表示し、空フォームを開く |
| imgbbアップロード失敗 | 「画像のアップロードに失敗しました」を表示 |
| Notion保存失敗 | 「保存に失敗しました」を表示 |

---

## セットアップ手順（Vercelデプロイ後にユーザーが実施）

1. Notionで「レシピ」データベースを上記スキーマで作成
2. Notionインテグレーションにデータベースを共有
3. Vercel環境変数に `NOTION_RECIPE_DATABASE_ID` と `IMGBB_API_KEY` を追加
4. `index.html` にレシピページへのリンクを追加（任意）
