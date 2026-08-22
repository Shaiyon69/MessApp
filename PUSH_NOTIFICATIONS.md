# Push notifications

MessApp's push path is deliberately content-blind: notification providers receive
conversation routing IDs and a generic message notice, never message plaintext.

## Delivery flow

1. A signed-in installation opts in from **User Settings → Notifications**.
2. The client obtains an FCM token on Android/Web or an APNs device token on iOS.
3. The client upserts that token into `public.push_devices` under RLS.
4. A database trigger calls `send-message-push` after a `messages` insert, and after a
   pending `friendships` insert.
5. The Edge Function reloads the message (or friend request) and membership data using
   the service role, excludes the sender, blocked users, and muted server members, and
   claims an idempotent delivery event. Friend requests skip the delivery-event claim
   because `push_delivery_events.message_id` references `messages(id)`.
6. Devices that reported this conversation on screen within the last 90 seconds are
   dropped from the send, so a message you are already reading raises no notification.
   The report lives in `push_devices.active_conversation_id/_at`, is written only while
   the app is visible, and expires so a force-quit app cannot silence a chat.
7. One bounded scan of the conversation (50 most recent messages) plus the reader’s
   `dm_reads`/`channel_reads` marker turns into a per-recipient unread count, so a
   burst reads as "4 new messages" instead of four notifications. Providers collapse
   by conversation — FCM `tag`, `apns-collapse-id`, service-worker `tag` — so the
   newest one replaces the visible notification rather than stacking.
8. FCM HTTP v1 delivers Android/Web notifications; APNs delivers iOS notifications.
9. Tapping a notification opens the target DM or server channel — or the notifications
   tab for a friend request — after access is revalidated through the signed-in user's
   normal Supabase queries.

The application intentionally does not place encrypted DM content or channel message
content in provider payloads or logs.

## Client configuration

Do not commit any private keys, service-account JSON, APNs `.p8` files, or real
environment files.

### Web

Configure the public Firebase web values in the deployment environment:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_WEB_PUSH_PUBLIC_KEY=
```

`VITE_WEB_PUSH_PUBLIC_KEY` is the public Web Push certificate key from Firebase
Cloud Messaging. Web registration uses the existing `/sw.js` registration and stores
the resulting FCM registration token, not the browser `PushSubscription` JSON.

### Android

Register the exact package `com.shaiyon.messapp` in Firebase and place the downloaded
file at `android/app/google-services.json`. This file is local configuration and must
remain untracked. Then run:

```powershell
npm run mobile:sync
Set-Location android
.\gradlew.bat :app:assembleDebug
```

Android 13+ permission is requested only after the user enables notifications.
MessApp creates a high-importance `messages` notification channel.

### iOS

In Xcode, enable the **Push Notifications** capability for the App target and use an
App ID/provisioning profile whose bundle identifier matches the app. Capacitor's
required AppDelegate registration callbacks are already wired in source.

## Edge Function configuration

Apply the push migrations before deploying the function:

- `20260715000200_push_devices.sql`
- `20260715000300_push_delivery_events.sql`
- `20260726000100_server_moderation.sql` (server mute preferences)
- `20260727000150_register_push_device.sql` (atomic account/token ownership)
- `20260822000100_message_push_webhook.sql` + `20260822000200_fix_message_push_webhook_schema.sql` (message trigger)
- `20260822000300_friend_request_push_webhook.sql` (friend request trigger)
- `20260822000400_push_device_active_conversation.sql` (open-conversation suppression)

Configure these Supabase Edge Function secrets:

```text
MESSAPP_PUSH_WEBHOOK_SECRET
FCM_PROJECT_ID
FCM_CLIENT_EMAIL
FCM_PRIVATE_KEY
APNS_TEAM_ID
APNS_KEY_ID
APNS_PRIVATE_KEY
APNS_BUNDLE_ID
APNS_ENVIRONMENT
```

`APNS_ENVIRONMENT` is `production` by default; set it to `sandbox` for development
provisioning. FCM secrets are required when Android/Web devices exist. APNs secrets
are required when iOS devices exist.

Deploy `send-message-push`, then create a Supabase Database Webhook:

- table: `public.messages`
- event: `INSERT`
- method: `POST`
- URL: `https://<project-ref>.supabase.co/functions/v1/send-message-push`
- header: `x-messapp-webhook-secret: <same MESSAPP_PUSH_WEBHOOK_SECRET value>`

The webhook secret is an independent random value. Do not reuse the service-role key.

## Runtime verification

Source tests and a successful build do not prove provider delivery. Verify with two
real accounts and two physical devices:

1. Enable notifications for the receiving account.
2. Confirm one enabled `push_devices` row exists for that installation without
   printing or copying its token.
3. Background or terminate the receiver app.
4. Send a DM from the other account.
5. Confirm exactly one generic notification arrives.
6. Tap it and confirm the correct DM opens.
7. Repeat for a non-muted server channel and confirm a muted server is excluded.
7a. Send a friend request from the other account, confirm one "sent you a friend request"
    notification arrives, and tapping it opens the notifications tab.
8. Disable notifications and confirm later messages do not create deliveries.
9. Review only bounded IDs, counts, statuses, and provider error codes in function
   logs; never log tokens, payload bodies, credentials, or message content.
