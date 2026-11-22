import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export function configuration({ authenticated = false, writes = false } = {}) {
  if (process.argv.includes('--help')) {
    console.log('UI_BASE=http://127.0.0.1:5174 API_BASE=http://127.0.0.1:18081/api ADMIN_USERNAME=... ADMIN_PASSWORD=... [ALLOW_ISOLATED_WRITES=1] node <script>\nsmoke.mjs uses only UI_BASE and demo memory. Other scripts require an explicit isolated local/H2 API marker and credentials. BROWSER_CHANNEL defaults to msedge; UI_ARTIFACT_DIR controls screenshots. Browser is visible.')
    return null
  }
  const origin = (name, suffix = '') => {
    if (!process.env[name]) throw new Error(`${name} must be explicitly configured`)
    const url = new URL(process.env[name])
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== suffix ||
        !url.port || ['8080', '80', '443', '5173'].includes(url.port)) {
      throw new Error(`${name} must use a dedicated loopback port with path ${suffix || '/'}`)
    }
    return url.toString().replace(/\/$/, '')
  }
  const config = { ui: origin('UI_BASE'), output: resolve(process.env.UI_ARTIFACT_DIR || '../docs/verification/ui-artifacts') }
  if (authenticated) {
    config.api = origin('API_BASE', '/api')
    config.username = process.env.ADMIN_USERNAME
    config.password = process.env.ADMIN_PASSWORD
    if (!config.username || !config.password) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be explicitly configured')
  }
  if (writes && process.env.ALLOW_ISOLATED_WRITES !== '1') throw new Error('Refusing writes: set ALLOW_ISOLATED_WRITES=1 for an isolated local/H2 test service')
  return config
}

export async function verifyIsolation(config) {
  for (const endpoint of [config.api + '/health', config.ui + '/api/health']) {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000), redirect: 'error' })
    const body = await response.json()
    if (!response.ok || body.code !== 0 || body.data?.application !== 'nephh-backend' || body.data?.isolatedVerification !== true) {
      throw new Error('Refusing authenticated verification: API and UI proxy must both report isolatedVerification=true (explicit verification mode, local profile and H2)')
    }
  }
}

export async function openBrowser(config) {
  await mkdir(config.output, { recursive: true })
  return chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: false })
}

export async function isolateHardware(page) {
  await page.route('**/hardware-bridge/**', route => route.fulfill({ status: 503, json: { message: 'Verification excludes physical hardware' } }))
}

export async function collapseHardware(page) {
  if (await page.locator('.hardware-body').isVisible()) await page.getByRole('button', { name: /采集节点实时数据/ }).click()
}

export async function loginPage(page, config, username = config.username, password = config.password) {
  await page.goto(config.ui + '/login')
  await collapseHardware(page)
  await page.getByPlaceholder('工号或邮箱', { exact: true }).fill(username)
  await page.getByPlaceholder('请输入登录密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/overview')
  await page.getByRole('heading', { name: '总览', exact: true, level: 1 }).waitFor()
  await page.locator('.work-sidebar:not([inert])').waitFor()
  await collapseHardware(page)
}

export async function apiClient(config) {
  const send = async (path, method = 'GET', body, token) => {
    const response = await fetch(config.api + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const payload = await response.json()
    if (!response.ok || payload.code !== 0) throw new Error(`Verification API ${method} ${path.split('?')[0]} failed (HTTP ${response.status})`)
    return payload.data
  }
  const session = await send('/auth/login', 'POST', { username: config.username, password: config.password })
  if (!session?.accessToken) throw new Error('Verification login did not return a token')
  return (path, method = 'GET', body) => send('/business' + path, method, body, session.accessToken)
}
