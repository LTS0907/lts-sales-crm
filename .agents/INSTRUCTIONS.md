# lts-sales-crm

株式会社ライフタイムサポートの営業CRM + 名刺管理 + サブスク請求システム。
Next.js 16 + Prisma + Neon PostgreSQL で動作。

本番: https://lts-sales-crm.vercel.app

---

## 技術スタック

| 用途 | 技術 |
|------|------|
| フロント/API | Next.js 16 (App Router) |
| 認証 | NextAuth v4 (Google OAuth) |
| DB | Neon PostgreSQL + Prisma 5 |
| デプロイ | Vercel |
| 外部API | Google Workspace (Drive/Sheets/Gmail/Calendar/Tasks) |
| AI | Google Gemini |

---

## 🔒 データ構造変更時のバックアップ連動ルール【最重要】

**Prisma スキーマ (`prisma/schema.prisma`) を変更したら、必ず以下を同時に更新する：**

### チェックリスト（スキーマ変更のたびに）

1. **Prisma マイグレーションファイル作成**
   - `prisma/migrations/YYYYMMDDHHMMSS_xxx/migration.sql` を追加
   - `prisma db push` ではなく `prisma migrate dev --create-only` を使用（Railway/本番 deploy 対応）

2. **バックアップスクリプトの更新** (`src/lib/backup.ts`)
   - `dumpAllTables()` に新しいテーブルの `findMany()` を追加
   - 戻り値オブジェクトにテーブル名エントリを追加

3. **Google Sheets バックアップ側のシート追加**
   - スプシ（`1XozVEvNAEl4kTJCJsu4OqfKNKpv3bloIjrWvn3XJEZI`）に同名のシートを手動 or `gws sheets spreadsheets batchUpdate` で追加
   - シート無しだと `Unable to parse range: XXX!A1` エラーで失敗する

4. **復元スクリプトの更新** (`scripts/backup/decrypt-backup.ts`)
   - `order` 配列（FK依存解消順）に新テーブル名を追加
   - deleteMany の順序（親→子）にも追加

5. **TypeScript 型の再生成**
   - `npx prisma generate` で Prisma Client 型を更新
   - ビルド確認: `npx next build`

6. **動作確認**
   - ローカルで `POST /api/backup/run` を叩いて 3層すべて成功することを確認
   - エラー: `{ "errors": [...] }` が空配列であること

### 既存の対象テーブル（17種類）
Contact / Note / Exchange / Subscription / BillingRecord / AccountsReceivable / Revenue / PaymentTransaction / PaymentAllocation / ServicePhase / Contract / Group / GroupMember / Meeting / MeetingParticipant / FollowUpLog / TaskLink

### バックアップ構成
- **L1**: Neon Point-in-Time Recovery（7日・自動）
- **L2**: GitHub暗号化ダンプ（`LTS0907/lts-sales-crm-backup`、毎日 JST 02:00）
- **L3**: Google Sheets エクスポート（スプシID: `1XozVEvNAEl4kTJCJsu4OqfKNKpv3bloIjrWvn3XJEZI`、毎日 JST 02:00）
- **トリガー**: `vercel.json` の cron → `/api/backup/run` → `src/lib/backup.ts`

### 違反したらどうなる？
- バックアップが部分的にしか取れない → データ消失時に復旧不能
- Vercel cron で errors が発生 → 無言で失敗し続ける
- **必ずスキーマ変更と同じPRで backup.ts も更新すること**

---

## .env ファイルの取り扱い禁止

`.env` ファイルの読み取り・書き込み・作成・編集・削除・コピー・移動など、一切の操作を**禁止**する。
`.env` ファイルの内容をユーザーに表示することも禁止。
環境変数の確認が必要な場合は、ユーザーに口頭で確認すること。
