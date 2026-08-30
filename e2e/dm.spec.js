/**
 * The DM round trip: two real browser sessions, each with its own localStorage
 * (and therefore its own E2EE private key). A message A sends is only readable
 * by B if key publication, ECDH derivation, and AES-GCM decryption all work.
 *
 * Preconditions: `npx supabase start`, and `.env.e2e` pointing at that stack.
 */
import { expect, test } from '@playwright/test'
import { USER_A, USER_B } from './seed.js'
import { failOnPageError, openDmWith, sendMessage, signIn } from './support.js'

test('a DM sent by one user is decrypted and rendered by the other', async ({ browser }) => {
  const errors = []
  const contextB = await browser.newContext()
  const contextA = await browser.newContext()
  const pageB = await contextB.newPage()
  const pageA = await contextA.newPage()
  failOnPageError(pageA, errors)
  failOnPageError(pageB, errors)

  // B signs in first so their public key is on `profiles` before A encrypts to it.
  await signIn(pageB, USER_B)
  await signIn(pageA, USER_A)

  const first = `stored ${Date.now()}`
  await openDmWith(pageA, USER_B.username)
  await sendMessage(pageA, first)
  await expect(pageA.getByText(first)).toBeVisible()

  // Fetched-then-decrypted path: B opens the thread after the fact.
  await openDmWith(pageB, USER_A.username)
  await expect(pageB.getByText(first)).toBeVisible({ timeout: 30_000 })

  // Realtime path: B is already looking at the thread when the next one lands.
  const live = `live ${Date.now()}`
  await sendMessage(pageA, live)
  await expect(pageB.getByText(live)).toBeVisible({ timeout: 30_000 })

  await contextA.close()
  await contextB.close()
  expect(errors).toEqual([])
})
