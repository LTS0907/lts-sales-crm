/**
 * モバイル対応の監査スクリプト
 *
 * 使い方:
 *   1. npx tsx scripts/mobile-audit.ts login
 *      → ブラウザが立ち上がる。Googleログインしてください。
 *      → ログイン検出後、自動で閉じます（セッションは tmp/mobile-audit/.session に保存）
 *
 *   2. npx tsx scripts/mobile-audit.ts capture
 *      → 全ページを iPhone & iPad サイズで撮影
 *      → tmp/mobile-audit/iphone/, tmp/mobile-audit/ipad/ に保存
 */
import { chromium } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = path.resolve(__dirname, '..')
const SESSION_DIR = path.join(ROOT, 'tmp/mobile-audit/.session')
const OUTPUT_DIR = path.join(ROOT, 'tmp/mobile-audit')
const BASE_URL = 'https://lts-sales-crm.vercel.app'

const PAGES: { path: string; name: string; priority: 'high' | 'mid' | 'low' }[] = [
  { path: '/', name: '01_top', priority: 'high' },
  { path: '/contacts', name: '02_contacts', priority: 'high' },
  { path: '/contacts/bulk-scan', name: '03_bulk-scan', priority: 'high' },
  { path: '/contacts/new', name: '04_contact-new', priority: 'low' },
  { path: '/calendar', name: '05_calendar', priority: 'mid' },
  { path: '/groups', name: '06_groups', priority: 'mid' },
  { path: '/search', name: '07_search', priority: 'mid' },
  { path: '/progress', name: '08_progress', priority: 'low' },
  { path: '/crm', name: '09_crm-dashboard', priority: 'high' },
  { path: '/crm/pipeline', name: '10_pipeline', priority: 'mid' },
  { path: '/crm/emails', name: '11_emails', priority: 'mid' },
  { path: '/crm/followups', name: '12_followups', priority: 'mid' },
  { path: '/subscriptions', name: '13_subscriptions', priority: 'mid' },
  { path: '/subscriptions/new', name: '14_subscription-new', priority: 'low' },
  { path: '/subscriptions/billing', name: '15_billing', priority: 'mid' },
  { path: '/accounts-receivable', name: '16_accounts-receivable', priority: 'mid' },
  { path: '/payments', name: '17_payments', priority: 'high' },
  { path: '/tasks', name: '18_tasks', priority: 'mid' },
  { path: '/email-sync', name: '19_email-sync', priority: 'low' },
  { path: '/contracts/templates', name: '20_contract-templates', priority: 'low' },
]

const DEVICES = {
  iphone: {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  ipad: {
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
} as const

async function login() {
  fs.mkdirSync(SESSION_DIR, { recursive: true })
  console.log('🌐 ブラウザを起動します...')
  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  })
  const page = ctx.pages()[0] || (await ctx.newPage())
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

  console.log('')
  console.log('👉 ブラウザで Google ログインしてください')
  console.log('   ログイン完了 → /contacts に遷移すると自動検出します')
  console.log('   または、ログイン完了後にブラウザを手動で閉じてもOK')
  console.log('')

  // ブラウザclose と ログイン検出を競争させる
  const closedPromise = new Promise<string>(resolve => {
    ctx.on('close', () => resolve('browser_closed'))
  })

  const loggedInPromise = (async () => {
    const start = Date.now()
    while (Date.now() - start < 10 * 60 * 1000) {
      // 10分上限
      try {
        const url = page.url()
        // 認証関連のURLでなく、本番ドメインに到達 → ログイン後ページとみなす
        if (url.startsWith(BASE_URL) && !url.includes('/auth') && !url.includes('/api/auth')) {
          // 連続して2回確認（リダイレクト中ではない）
          await page.waitForTimeout(3000)
          const url2 = page.url()
          if (url2.startsWith(BASE_URL) && !url2.includes('/auth') && !url2.includes('/api/auth')) {
            return 'login_detected'
          }
        }
      } catch {
        return 'page_error'
      }
      await new Promise(r => setTimeout(r, 1500))
    }
    return 'timeout'
  })()

  const result = await Promise.race([closedPromise, loggedInPromise])
  console.log(`\n結果: ${result}`)

  if (result === 'login_detected') {
    console.log('✅ ログイン検出！セッションを保存して終了します')
    // セッション保存のため少し待ってから閉じる
    await page.waitForTimeout(2000).catch(() => {})
    await ctx.close().catch(() => {})
  } else if (result === 'browser_closed') {
    console.log('✅ ブラウザが閉じられました。セッションが保存されていれば次の capture コマンドで使えます')
  } else {
    console.log('⚠️  ログイン未検出のまま終了します')
    await ctx.close().catch(() => {})
  }
}

async function capture() {
  // Cookie ファイルを読み込み
  const cookiesPath = path.join(OUTPUT_DIR, 'cookies.json')
  if (!fs.existsSync(cookiesPath)) {
    console.error('❌ cookies.json が見つかりません。先に `npx tsx scripts/extract-chrome-cookies.ts` を実行してください')
    process.exit(1)
  }
  const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'))
  console.log(`🍪 Cookie ${cookies.length}件を読み込みました`)

  for (const [deviceName, deviceOpts] of Object.entries(DEVICES)) {
    const outDir = path.join(OUTPUT_DIR, deviceName)
    fs.mkdirSync(outDir, { recursive: true })

    console.log(`\n📱 [${deviceName}] 撮影開始`)
    const browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext(deviceOpts)
    await ctx.addCookies(cookies)
    const page = await ctx.newPage()

    for (const pg of PAGES) {
      const url = BASE_URL + pg.path
      const filename = path.join(outDir, `${pg.name}.png`)
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      } catch {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        } catch (e) {
          console.log(`  ⚠️  [${deviceName}] ${pg.name} 遷移失敗: ${(e as Error).message.slice(0, 60)}`)
          continue
        }
      }
      // 描画安定待ち
      await page.waitForTimeout(1500)
      try {
        await page.screenshot({ path: filename, fullPage: true })
        console.log(`  ✓ [${deviceName}] ${pg.name}`)
      } catch (e) {
        console.log(`  ⚠️  [${deviceName}] ${pg.name} 撮影失敗: ${(e as Error).message.slice(0, 60)}`)
      }
    }

    await ctx.close()
    await browser.close()
  }

  console.log('\n🎉 撮影完了！結果は tmp/mobile-audit/ 配下を確認してください')
}

const cmd = process.argv[2]
if (cmd === 'login') {
  login().catch(e => {
    console.error(e)
    process.exit(1)
  })
} else if (cmd === 'capture') {
  capture().catch(e => {
    console.error(e)
    process.exit(1)
  })
} else {
  console.error('使い方: npx tsx scripts/mobile-audit.ts <login|capture>')
  process.exit(1)
}
