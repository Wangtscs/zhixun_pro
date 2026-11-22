import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { configuration, verifyIsolation, openBrowser, isolateHardware, collapseHardware, loginPage, apiClient } from './ui-verification.mjs'

const config = configuration({ authenticated: true, writes: true })
if (config) {
  await verifyIsolation(config)
  const api = await apiClient(config)
  const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
  const created = [], errors = [], demoRequests = []
  const browser = await openBrowser(config)
  try {
    const demo = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    demo.on('pageerror', error => errors.push(error.message))
    await isolateHardware(demo)
    await demo.route(url => url.pathname.startsWith('/api/'), route => { demoRequests.push(route.request().url()); return route.abort('blockedbyclient') })
    await demo.goto(config.ui)
    await demo.getByRole('button', { name: '预览平台', exact: true }).click()
    await demo.getByRole('heading', { name: '总览', exact: true, level: 1 }).waitFor()
    await collapseHardware(demo)
    const sidebar = demo.getByRole('complementary', { name: '工作台侧栏', exact: true })
    assert.ok(await sidebar.getByRole('button', { name: '总览', exact: true }).locator('.nav-label').isVisible(), 'Desktop navigation labels must be visible by default')
    assert.ok(await sidebar.getByRole('button', { name: '个人设置', exact: true }).evaluate(element => { const label = element.querySelector('.nav-label').getBoundingClientRect(); const box = element.getBoundingClientRect(); return label.left >= box.left && label.right <= box.right }), 'Profile navigation text must fit its button instead of inheriting the old icon-only width')
    await demo.screenshot({ path: join(config.output, 'navigation-expanded-1440.png'), fullPage: true })
    await sidebar.getByRole('button', { name: '收起导航', exact: true }).click()
    await demo.reload()
    await demo.getByRole('heading', { name: '总览', exact: true, level: 1 }).waitFor()
    assert.ok(await sidebar.getByRole('button', { name: '展开导航', exact: true }).isVisible(), 'Collapsed preference must survive reload')
    await sidebar.getByRole('button', { name: '展开导航', exact: true }).click()
    await demo.reload()
    await demo.getByRole('heading', { name: '总览', exact: true, level: 1 }).waitFor()
    assert.ok(await sidebar.getByRole('button', { name: '收起导航', exact: true }).isVisible(), 'Expanded preference must survive reload')
    await collapseHardware(demo)
    await sidebar.getByRole('button', { name: '节点管理', exact: true }).press('Enter')
    await demo.waitForURL('**/nodes')
    assert.equal(await sidebar.getByRole('button', { name: '节点管理', exact: true }).getAttribute('aria-current'), 'page')
    for (const width of [1440, 900, 390]) {
      await demo.setViewportSize({ width, height: 900 })
      const expand = sidebar.getByRole('button', { name: '展开导航', exact: true })
      if (await expand.count()) await expand.click()
      if (width === 390) await demo.screenshot({ path: join(config.output, 'navigation-expanded-390.png'), fullPage: true })
      await sidebar.getByRole('button', { name: '工单管理', exact: true }).click()
      await demo.getByRole('heading', { name: '工单管理', exact: true, level: 1 }).waitFor()
      if (width <= 900) assert.ok(await sidebar.getByRole('button', { name: '展开导航', exact: true }).isVisible(), 'Narrow navigation should collapse after selecting a destination')
      assert.ok(await demo.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Main document must not overflow horizontally')
      await demo.getByRole('button', { name: '派单', exact: true }).first().click()
      const drawer = demo.locator('.d-assign-drawer')
      await drawer.locator('.d-person-card').first().click()
      const confirm = drawer.getByRole('button', { name: '确认派单（1人）', exact: true })
      assert.ok(await confirm.evaluate(element => { const box = element.getBoundingClientRect(); const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return hit === element || element.contains(hit) }), 'Drawer primary action must remain reachable')
      await drawer.getByRole('button', { name: '取消', exact: true }).click()
      if (width === 900) await demo.screenshot({ path: join(config.output, 'navigation-collapsed-900.png'), fullPage: true })
    }
    await sidebar.getByRole('button', { name: '展开导航', exact: true }).click()
    await demo.keyboard.press('Escape')
    assert.ok(await sidebar.getByRole('button', { name: '展开导航', exact: true }).isVisible(), 'Escape closes narrow expanded navigation')
    assert.deepEqual(demoRequests, [], 'Demo navigation must not use the business API')

    const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    admin.on('pageerror', error => errors.push(error.message))
    await isolateHardware(admin)
    await loginPage(admin, config)
    const adminNav = admin.getByRole('complementary', { name: '工作台侧栏', exact: true })
    for (const name of ['用户权限', '报表', '审计日志']) assert.equal(await adminNav.getByRole('button', { name, exact: true }).count(), 1)
    await admin.getByLabel('业务区域', { exact: true }).selectOption('')
    await admin.getByRole('button', { name: '刷新', exact: true }).click()
    await admin.locator('.work-sidebar:not([inert])').waitFor()
    assert.equal(await admin.getByLabel('业务区域', { exact: true }).inputValue(), '')
    await admin.waitForResponse(response => new URL(response.url()).pathname === '/api/business/audit', { timeout: 23000 })
    assert.equal(await admin.getByLabel('业务区域', { exact: true }).inputValue(), '', 'Automatic full refresh must preserve explicit all-area selection')
    for (const [route, title] of [['nodes', '节点管理'], ['orders', '工单管理'], ['audit', '审计日志']]) {
      await admin.goto(config.ui + '/' + route)
      await admin.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor()
      assert.equal(new URL(admin.url()).pathname, '/' + route)
    }
    const area = (await api('/areas'))[0]
    for (const role of ['MANAGER', 'INSPECTOR']) {
      const username = `t08-${suffix}-${role.toLowerCase()}`, password = randomBytes(18).toString('base64url') + '7a'
      const user = await api('/users', 'POST', { username, password, role, displayName: '隔离T08导航验证' })
      created.push({ ...user, role, areaId: area.id })
      await api('/users/' + user.id, 'PUT', { role, enabled: true, areas: [area.id], displayName: '隔离T08导航验证' })
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      page.on('pageerror', error => errors.push(error.message)); await isolateHardware(page)
      await loginPage(page, config, username, password)
      const nav = page.getByRole('complementary', { name: '工作台侧栏', exact: true })
      assert.equal(await nav.getByRole('button', { name: '用户权限', exact: true }).count(), 0)
      if (role === 'INSPECTOR') {
        for (const name of ['报表', '审计日志']) assert.equal(await nav.getByRole('button', { name, exact: true }).count(), 0)
        for (const name of ['我的工单', '我的巡检']) assert.equal(await nav.getByRole('button', { name, exact: true }).count(), 1)
        const denied = await page.evaluate(async () => {
          const token = sessionStorage.getItem('nephh-access-token')
          return (await fetch('/api/business/users', { headers: { Authorization: 'Bearer ' + token } })).status
        })
        assert.equal(denied, 403, 'Hidden navigation must not substitute for server authorization')
      } else {
        for (const name of ['报表', '审计日志']) assert.equal(await nav.getByRole('button', { name, exact: true }).count(), 1)
        await page.locator('.d-user').click()
        await page.getByRole('button', { name: '切换角色', exact: false }).click()
        await page.getByRole('button', { name: '只读', exact: false }).click()
        assert.equal(await nav.getByRole('button', { name: '报表', exact: true }).count(), 0)
        await nav.getByRole('button', { name: '工单管理', exact: true }).click()
        assert.equal(await page.getByRole('button', { name: '+ 新建工单', exact: true }).count(), 0)
      }
      await page.close()
    }
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ passed: true, defaultLabels: true, collapsedAndExpandedPersist: true, keyboardNavigation: true, widths: [1440, 900, 390], noDocumentOverflow: true, modalReachable: true, oldUrlsPreserved: true, allAreasPreservedAfterManualAndAutomaticRefresh: true, roles: ['ADMIN', 'MANAGER', 'INSPECTOR', 'readonly view'], inspectorServerDenied: true, demoBusinessRequests: 0, pageErrors: 0 }))
  } finally {
    const cleanup = []
    for (const user of created) {
      try { await api('/users/' + user.id, 'PUT', { role: user.role, enabled: false, areas: [user.areaId], displayName: '隔离T08导航账号（已停用）' }) }
      catch { cleanup.push('Could not disable isolated navigation account') }
    }
    await browser.close()
    if (cleanup.length) throw new Error(cleanup.join('; '))
  }
}
