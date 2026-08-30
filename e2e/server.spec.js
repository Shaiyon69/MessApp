/**
 * Server channels are not encrypted, so this isolates the plain messaging path
 * (create_server RPC, preset provisioning, channel select, send) from the
 * crypto path covered in dm.spec.js.
 */
import { expect, test } from '@playwright/test'
import { USER_A } from './seed.js'
import { failOnPageError, sendMessage, signIn } from './support.js'

test('a new server can be created and posted in', async ({ page }) => {
  const errors = []
  failOnPageError(page, errors)
  await signIn(page, USER_A)

  const serverName = `E2E ${Date.now()}`
  await page.getByRole('button', { name: 'Create server' }).click()
  await page.getByPlaceholder('My community').fill(serverName)
  await page.getByText('Start with the default General category and channel.').click()
  await page.getByRole('button', { name: /Create .* server/ }).click()

  await expect(page.getByRole('button', { name: 'general' }).first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'general' }).first().click()

  const text = `channel post ${Date.now()}`
  await sendMessage(page, text)
  await expect(page.getByText(text)).toBeVisible({ timeout: 30_000 })

  expect(errors).toEqual([])
})
