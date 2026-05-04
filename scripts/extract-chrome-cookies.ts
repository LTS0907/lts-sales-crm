/**
 * Mac の Chrome から lts-sales-crm.vercel.app の Cookie を抽出する
 *
 * 動作:
 *   1. Chrome の Cookies SQLite DB を /tmp にコピー（DB ロック回避）
 *   2. Keychain から Chrome Safe Storage password を取得
 *   3. PBKDF2 で AES-128 鍵を導出
 *   4. encrypted_value を AES-128-CBC で復号
 *   5. Playwright 用の Cookie 配列を JSON で出力
 *
 * 出力: tmp/mobile-audit/cookies.json
 */
import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'

const ROOT = path.resolve(__dirname, '..')
const OUTPUT = path.join(ROOT, 'tmp/mobile-audit/cookies.json')

const HOST_FILTER = 'lts-sales-crm.vercel.app'
const TMP_DB = '/tmp/chrome-cookies-extract.db'
const CHROME_DB = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies')

// Mac Chrome の暗号化パラメータ
const SALT = 'saltysalt'
const ITERATIONS = 1003
const KEY_LENGTH = 16
const IV = Buffer.alloc(16, 0x20) // 16バイトの space

function getKeychainPassword(): string {
  try {
    return execSync('security find-generic-password -wa "Chrome" 2>/dev/null')
      .toString()
      .trim()
  } catch (e) {
    throw new Error('Keychain から Chrome のパスワードを取得できませんでした。Keychain アクセス許可を確認してください')
  }
}

function decrypt(encryptedValue: Buffer, key: Buffer): string {
  // 'v10' or 'v11' プレフィックス（3バイト）を除去
  const ciphertext = encryptedValue.slice(3)
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, IV)
  decipher.setAutoPadding(true)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  // Chrome 130+: 復号後の先頭32バイトは SHA-256(host_key) のハッシュ → 除去
  // (Origin-bound cookie integrity check)
  // 古い Chrome でハッシュが無い場合は decrypted そのまま使う必要があるが、
  // 32バイトを除いた残りが utf-8 として valid かで判定する
  const withoutHash = decrypted.slice(32)
  const candidate = withoutHash.toString('utf-8')
  // valid utf-8 で先頭が printable なら hash 付きと判断
  if (/^[\x20-\x7E]/.test(candidate)) {
    return candidate
  }
  // 古い形式（ハッシュ無し）
  return decrypted.toString('utf-8')
}

function chromeTimeToUnix(chromeTimeMicros: number): number {
  // Chrome の時刻は 1601-01-01 からのマイクロ秒
  // Unix 時刻に変換
  if (chromeTimeMicros === 0) return -1 // session cookie
  return Math.floor(chromeTimeMicros / 1000000 - 11644473600)
}

function main() {
  // 1. Chrome の Cookies DB をコピー
  if (!fs.existsSync(CHROME_DB)) {
    throw new Error(`Chrome の Cookies DB が見つかりません: ${CHROME_DB}`)
  }
  fs.copyFileSync(CHROME_DB, TMP_DB)

  // 2. Keychain からパスワード取得
  const password = getKeychainPassword()

  // 3. PBKDF2 で鍵導出
  const key = crypto.pbkdf2Sync(password, SALT, ITERATIONS, KEY_LENGTH, 'sha1')

  // 4. SQLite から Cookie 取得
  const db = new Database(TMP_DB, { readonly: true })
  const rows = db
    .prepare(
      `SELECT name, value, host_key, path, expires_utc, is_secure, is_httponly, samesite, encrypted_value
       FROM cookies
       WHERE host_key LIKE ? OR host_key LIKE ?`
    )
    .all(`%${HOST_FILTER}%`, `%vercel.app%`) as Array<{
    name: string
    value: string
    host_key: string
    path: string
    expires_utc: number
    is_secure: number
    is_httponly: number
    samesite: number
    encrypted_value: Buffer
  }>

  // 5. 復号 + Playwright 用フォーマット
  const cookies = rows
    .map(r => {
      let value = r.value
      if (!value && r.encrypted_value && r.encrypted_value.length > 3) {
        try {
          value = decrypt(r.encrypted_value, key)
        } catch (e) {
          console.warn(`[skip] ${r.name}: decrypt失敗 ${(e as Error).message}`)
          return null
        }
      }
      const expires = chromeTimeToUnix(r.expires_utc)
      const sameSite =
        r.samesite === 0 ? 'None' as const : r.samesite === 1 ? 'Lax' as const : r.samesite === 2 ? 'Strict' as const : 'Lax' as const
      return {
        name: r.name,
        value,
        domain: r.host_key,
        path: r.path,
        expires: expires > 0 ? expires : -1,
        httpOnly: r.is_httponly === 1,
        secure: r.is_secure === 1,
        sameSite,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  // 6. JSON 出力
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, JSON.stringify(cookies, null, 2))
  console.log(`✅ ${cookies.length}件の Cookie を ${OUTPUT} に保存`)
  console.log('Cookie 一覧:')
  cookies.forEach(c => {
    console.log(`  - ${c.name} (${c.domain}) value: ${c.value.slice(0, 30)}${c.value.length > 30 ? '...' : ''}`)
  })

  // クリーンアップ
  db.close()
  fs.unlinkSync(TMP_DB)
}

main()
