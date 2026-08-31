/** Shared browser-side steps: sign-in (including first-run PIN setup) and an
 *  uncaught-exception guard the specs attach to every page. */
import { expect } from '@playwright/test'

const PIN = '123456'

/** Fails the test on any uncaught page exception instead of letting it pass silently. */
export function failOnPageError(page, errors) {
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`))
}

/**
 * Signs in and returns once the Dashboard shell is interactive. On a first
 * login the app blocks with the E2EE PIN backup modal, so clear that too.
 */
export async function signIn(page, user) {
  await page.goto('/')
  await page.locator('input[type="email"]').fill(user.email)
  await page.locator('input[type="password"]').fill(user.password)
  await page.getByRole('button', { name: 'Enter MessApp' }).click()

  const pinModal = page.locator('[data-ui-overlay-owner="Dashboard:pin-setup"]')
  const ready = page.getByRole('button', { name: 'Find or start' })
  await expect(pinModal.or(ready).first()).toBeVisible({ timeout: 30_000 })

  if (await pinModal.isVisible()) {
    await pinModal.locator('input[type="password"]').fill(PIN)
    await page.getByRole('button', { name: 'Set PIN & Continue' }).click()
    await expect(pinModal).toBeHidden({ timeout: 20_000 })
  }
  await expect(ready).toBeVisible({ timeout: 30_000 })
}

/** Opens the quick switcher and starts (or jumps to) the DM with `username`. */
export async function openDmWith(page, username) {
  await page.getByRole('button', { name: 'Find or start' }).click()
  const query = page.getByPlaceholder('Where would you like to go?')
  await query.fill(username)
  await page.getByRole('button', { name: new RegExp(username, 'i') }).first().click()
  await expect(page.locator('[data-message-composer="true"]')).toBeVisible({ timeout: 20_000 })
}

/** Types into the composer and sends with Enter. */
export async function sendMessage(page, text) {
  const composer = page.locator('[data-message-composer="true"]')
  await composer.click()
  await composer.fill(text)
  await composer.press('Enter')
}
