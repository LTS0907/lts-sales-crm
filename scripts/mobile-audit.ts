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
  console.log('   ログイン完了後、自動でブラウザが閉じます')
  console.log('')

  // ログイン後にホスト=本番URLに戻る + path が認証ページ以外になるのを待つ
  try {
    await page.waitForFunction(
      () => location.host === 'lts-sales-crm.vercel.app' && !location.pathname.startsWith('/auth'),
      { timeout: 5 * 60 * 1000 } // 最大5分待つ
    )
    // セッション保存のため少し待つ
    await page.waitForTimeout(2000)
    console.log('✅ ログイン検出！セッションを保存して終了します')
  } catch (e) {
    console.log('⚠️  タイムアウトしました。ログインせずに終了します')
  }
  await ctx.close()
}

async function capture() {
  if (!fs.existsSync(SESSION_DIR) || fs.readdirSync(SESSION_DIR).length === 0) {
    console.error('❌ セッションが見つかりません。先に `npx tsx scripts/mobile-audit.ts login` を実行してください')
    process.exit(1)
  }

  for (const [deviceName, deviceOpts] of Object.entries(DEVICES)) {
    const outDir = path.join(OUTPUT_DIR, deviceName)
    fs.mkdirSync(outDir, { recursive: true })

    console.log(`\n📱 [${deviceName}] 撮影開始`)
    const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true,
      ...deviceOpts,
    })
    const page = ctx.pages()[0] || (await ctx.newPage())

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
