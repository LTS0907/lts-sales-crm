# バックアップ運用手順書

## 3層バックアップ体制

| 層 | 手段 | 頻度 | 保持期間 | リカバリ所要 |
|---|------|------|---------|------------|
| **L1** | Neon DB PITR（Point-In-Time Recovery） | リアルタイム | 24h〜30日（プラン依存） | 数分 |
| **L2** | GitHub暗号化ダンプ（AES-256-GCM） | 毎日 2:00 JST | Daily最新=30日、Archive=全保持 | 10〜30分 |
| **L3** | Google Sheets エクスポート | 毎日 2:00 JST | 上書き（1世代） | 目視確認用 |

## スケジュール

| Cron | パス | 実行 (Vercel Cron = UTC) | JST |
|------|------|--------------------------|-----|
| 日次バックアップ | `/api/backup/run` | `0 17 * * *` | 毎日 02:00 |
| 月次復元ドリル | `/api/backup/drill` | `0 18 1 * *` | 毎月1日 03:00 |

## 関連リソース

- **GitHub バックアップ用リポジトリ**: `LTS0907/lts-sales-crm-backup`
  - `dumps/YYYY-MM-DD.enc`: その日の最新（上書き、30日保持）
  - `dumps/archive/YYYY-MM-DD_HHMMSS.enc`: 履歴版（全保持）
- **Google Sheets**: https://docs.google.com/spreadsheets/d/1XozVEvNAEl4kTJCJsu4OqfKNKpv3bloIjrWvn3XJEZI/edit
- **Neon Console**: https://console.neon.tech/
- **BackupLog テーブル**: 管理画面 `/admin/backup-logs`（今後実装）または直接DB参照

## 必要な環境変数（Vercel）

| Key | 用途 |
|-----|------|
| `CRON_API_SECRET` | Vercel Cron → /api/backup/* の認証 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Sheets書き込み用（サービスアカウント） |
| `BACKUP_ENCRYPTION_PASSWORD` | AES-256-GCM 暗号化/復号用 |
| `GITHUB_BACKUP_TOKEN` | GitHub push用PAT |
| `GITHUB_BACKUP_REPO` | 例: `LTS0907/lts-sales-crm-backup` |
| `DISCORD_BACKUP_WEBHOOK_URL` | Discord通知先（未設定ならスキップ） |

## 通知

毎日のバックアップ完了時に Discord に以下が通知される:

```
✅ [BACKUP]
ステータス: SUCCESS
Sheets: ✅  GitHub: ✅
レコード合計: 312 行 (18 テーブル)
Daily: `dumps/2026-04-09.enc`
Archive: `dumps/archive/2026-04-09_020031.enc`
経過時間: 12.3秒
```

失敗時は `🚨 [BACKUP ERROR]` でアラート。

---

## 🔧 復元手順

### A. Neon PITR で戻す（最速、推奨）

1. https://console.neon.tech/ を開く
2. 該当プロジェクト → **Branches** → **Restore**
3. 戻したい日時を指定して新しいブランチを作成
4. 検証後、このブランチのエンドポイントを `DATABASE_URL` として Vercel に設定
5. Vercel を再デプロイ

### B. GitHub暗号化ダンプから戻す（PITR期間超過時）

```bash
# 1. ダンプをダウンロード
gh api repos/LTS0907/lts-sales-crm-backup/contents/dumps/2026-04-09.enc \
  --jq '.content' | base64 -d > /tmp/restore.enc

# 2. 復号＆内容確認（dry-run）
cd D:/scripts/lts-sales-crm
BACKUP_ENCRYPTION_PASSWORD="***" \
  npx tsx scripts/backup/decrypt-backup.ts /tmp/restore.enc

# 3. DBに書き戻す（※既存データ上書き！）
BACKUP_ENCRYPTION_PASSWORD="***" \
DATABASE_URL="postgresql://..." \
  npx tsx scripts/backup/decrypt-backup.ts /tmp/restore.enc --write
```

### C. 特定日時の状態を archive から取り出す

```bash
gh api repos/LTS0907/lts-sales-crm-backup/contents/dumps/archive/2026-04-09_020031.enc \
  --jq '.content' | base64 -d > /tmp/restore.enc
# 以降は B と同じ
```

---

## 🧪 復元ドリル（月1自動＋手動実行可）

毎月1日 03:00 JST に自動実行。手動で叩く場合:

```bash
curl -X POST https://incredible-warmth-production.up.railway.app/api/backup/drill \
  -H "Authorization: Bearer $CRON_API_SECRET"
```

- 実DBには書き込まない
- 最新ダンプを復号＆JSONパースして件数検証
- Discord に結果を投稿
- BackupLog テーブルに記録

---

## 🛠 トラブルシュート

### Discord 通知が来ない / バックアップが失敗している
1. BackupLog テーブルで直近の実行履歴を確認
2. Vercel ログで `/api/backup/run` のエラー内容を確認
3. よくある原因:
   - `GOOGLE_SERVICE_ACCOUNT_KEY` の期限切れ・権限不足
   - `GITHUB_BACKUP_TOKEN` の期限切れ
   - スプシ `1XozVE...EZI` が共有されていない

### PITRを使うべきか、GitHubダンプを使うべきか
- **< 30日以内の事故** → PITR（Neon）が最速。秒単位の粒度で戻せる
- **> 30日、または特定の論理的な状態に戻したい** → GitHub archive

### 「バックアップはあるけどデータが古い」問題（今回の事故）
- バックアップ機能は **データ存在時に導入** しないと意味がない
- 今後は、スキーマ変更のたびに `npm run check:backup-sync` を走らせる
- `pre-commit` hook で自動チェック推奨

---

## ✅ 運用チェックリスト（月1）

- [ ] Discord に月次ドリル通知が届いているか
- [ ] BackupLog で `status=SUCCESS` が連続しているか
- [ ] Neon PITR 期間が十分か（プラン見直し）
- [ ] GitHub `dumps/archive/` が肥大化しすぎていないか
- [ ] Google Sheets バックアップ先スプシに最新データがあるか
