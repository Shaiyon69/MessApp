# MessApp System Documentation

## System overview

MessApp is a React/Vite messaging client packaged for the web, Capacitor mobile, and Tauri desktop. Supabase supplies authentication, Postgres access, Realtime signaling/presence, and Storage. The browser owns UI state, optimistic message state, Web Crypto operations, and WebRTC media. Server authorization is enforced by deployed RLS policies, Storage policies, and RPC grants; frontend visibility checks are never an authorization boundary.

## Frontend architecture

- `src/App.jsx` initializes theme and native keyboard behavior, tracks the Supabase session, handles recovery/deep-link routing, and chooses auth or `Dashboard` views.
- `src/components/Dashboard.jsx` is the authenticated coordinator. It loads profile, DM/server navigation, presence, permission, modal, and voice-channel state.
- `src/hooks/useChatManager.js` owns the active conversation's messages, pagination, optimistic sends, Realtime reconciliation, reactions, typing, attachments, and encryption boundary.
- `src/hooks/useWebRTC.js` owns one-to-one call signaling, peer/media state, and Android audio routing.
- Layout components render parent-owned state. Modal components should not become alternative data authorities.

## Supabase architecture

`src/supabaseClient.js` creates one browser client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The app accesses profiles, DMs, servers, channels, messages, reactions, reads, friendships, call state, and Storage through table queries and RPCs. Client-side visibility checks improve UX but are not security controls; deployed RLS and function grants must authorize every operation.

The migration chain starts with the pre-hardening Supabase baseline: `20260713200000_extensions_helpers.sql`, `20260713200127_remote_schema.sql`, Realtime publication membership, the application Storage baseline, and the `leave_server` lint correction. Later migrations depend on that baseline and must remain in timestamp order. Rebuild only the disposable local stack with `npx supabase db reset --local`; never run `db reset --linked`, because a linked reset targets hosted state.

The repository's authored conversation-security delta is `supabase/migrations/20260715000100_harden_conversation_rls.sql`. It removes permissive legacy policies, restricts direct membership and room creation, corrects channel membership checks, makes `chat-attachments` private, and scopes attachment access to authenticated conversation participants. Normal DM creation must use `create_or_get_dm(peer_id)` and server joins must use `join_server_by_code` rather than direct client inserts.

`supabase/tests/conversation_isolation.sql` is the matching transactional A/B/C isolation test. It verifies that participants can access their own conversation while an unrelated user cannot read, send, join, view attachments, or upload into it. The complete `supabase/` workspace is intentionally local-only and ignored by Git, including configuration, functions, migrations, tests, reference exports, and generated schema snapshots.

The hardening migration has been validated against a locally hydrated schema, but it has not been deployed to the linked remote project. Until an explicit reviewed deployment occurs, the remote backend may still have the older permissive policies. Never treat a passing frontend build as proof that remote RLS is current.

## Authentication and session flow

1. `App` asks Supabase Auth for the persisted session and subscribes to auth changes.
2. Login/register/recovery components call Supabase Auth and leave session ownership with `App`.
3. `Dashboard` loads the authenticated profile and dependent navigation data.
4. Capacitor deep links return recovery/login callbacks to the browser route.
5. Logout clears the Supabase session; local privacy and key settings remain explicitly managed by settings flows.

Never log auth tokens, recovery fragments, passwords, push tokens, or private key material.

## Messaging flow

`useChatManager` derives one active target from a DM room or server channel. It loads cached/recent rows, decrypts content where applicable, and subscribes to target-scoped Realtime changes. Sends create a local optimistic row, perform encryption/upload/database work, and reconcile the local row with the matching server insert. A room switch must invalidate stale asynchronous work, reject results belonging to another target, and remove the old Realtime/presence channels before their results can update the new room.

Pagination prepends older rows without disturbing newer optimistic/realtime entries. The bounded local cache is an availability optimization, not authoritative state. Delivery/read markers derive from backend timestamps and current visibility.

### Hosted message push setup

Message push delivery is implemented by `supabase/functions/send-message-push`. Hosted setup is manual and must be reviewed separately from repository changes:

1. Apply the authored `push_devices` and `push_delivery_events` migrations.
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MESSAPP_PUSH_WEBHOOK_SECRET`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` as hosted Edge Function secrets. Use `supabase/functions/.env.example` only as a name/format reference.
3. Deploy `send-message-push`. JWT verification is disabled for this function because Supabase Database Webhooks do not carry a user session JWT; the function instead requires the shared `MESSAPP_PUSH_WEBHOOK_SECRET` in `Authorization: Bearer <secret>` or `x-messapp-webhook-secret`.
4. Create a Database Webhook for `INSERT` on `public.messages` whose destination is the deployed `send-message-push` Edge Function, and configure the same shared-secret header.

The webhook record supplies only the message ID trust input. The function reloads the message and derives recipients from DM or server membership, applies DM block relationships, and reads only enabled `push_devices`; it never uses legacy `profiles.fcm_token`. Notification bodies deliberately exclude message content, encrypted payloads, and attachment URLs. String-only data fields carry `message_id` plus DM room or channel/server identifiers so a receiving client can deep-link to the authoritative conversation after normal authentication and authorization checks.

Operational commands must be run from the linked repository and reviewed before execution:

```text
npx supabase migration list
npx supabase db push --dry-run
npx supabase secrets set --env-file supabase/functions/.env --project-ref <project-ref>
npx supabase functions deploy send-message-push --project-ref <project-ref>
```

Run `db push` only when its dry run contains exclusively reviewed migrations. Configure exactly one `INSERT` webhook on `public.messages` with `x-messapp-webhook-secret`; never place the value in source control or command output. Safe function diagnostics are `PUSH_WEBHOOK_AUTH`, `PUSH_MESSAGE_RESOLVE`, `PUSH_RECIPIENT_RESOLVE`, `PUSH_DEVICE_RESOLVE`, `PUSH_DELIVERY_CLAIM`, `PUSH_FCM_AUTH`, `PUSH_FCM_RESULT`, `PUSH_DEVICE_DISABLE`, `PUSH_DELIVERY_COMPLETE`, and `PUSH_DELIVERY_ERROR`.

A failed delivery row may be retried by replaying the same authenticated webhook after its status is `failed`; confirmed `sent` rows must not be reset because their event key prevents duplicate delivery. To disable a compromised webhook, disable or remove the hosted Database Webhook first, rotate `MESSAPP_PUSH_WEBHOOK_SECRET`, update its header, and only then re-enable it. Rotate Firebase credentials by creating a new service-account key, updating `FCM_CLIENT_EMAIL` and `FCM_PRIVATE_KEY` together, verifying delivery, and revoking the old Google key. Never retain retired credentials in repository files or logs.

## Attachments

The chat hook maintains one composer attachment queue capped at 10 items. Images, GIFs, videos, and general files may be mixed in one outgoing message with one optional caption. Selection, paste, Android keyboard media, and GIF search all feed that same queue; each item is validated before it enters the queue. Images and videos receive local previews, files show name/type/size metadata, and removing one item does not clear the rest.

On send, the hook validates type and size, encrypts DM attachment bytes where configured, uploads every item to the private `chat-attachments` bucket, creates one message, and inserts all corresponding `message_attachments` rows. Receiving clients resolve and decrypt every attachment independently so one unavailable object does not hide the remaining media. Object paths use the uploader and conversation identifier as authorization inputs. Read paths resolve stored object paths to temporary signed URLs and decrypt bytes at the client boundary. Signed URLs, file contents, plaintext, and encrypted key material must not be persisted in diagnostics. The frontend may cache resolved media for performance, but access is ultimately controlled by deployed Storage policies and conversation membership.

Plain HTTP(S) links remain message content rather than Storage attachments. A message can render up to 10 distinct safe link previews; YouTube links use privacy-enhanced embeds and other URLs fall back to a safe clickable card if metadata lookup fails.

## Reactions

Reaction replacement removes the current user's prior reaction before inserting the normalized new emoji. UI state is updated only after the write succeeds and cached consistently. Realtime message/reaction changes remain the cross-client source of convergence.

## Servers and channels

`Dashboard` owns selected server/channel state and passes permission decisions to `LeftSidebar` and settings modals. One-to-one rooms are created only through `create_or_get_dm(peer_id)`; the RPC returns a `dm_rooms` row and the frontend navigates with its `id`. The maintained migration derives the caller from `auth.uid()`, checks friendship/block/privacy rules, serializes the user pair, and inserts both memberships atomically. Server creation/join and invite operations depend on backend RPCs; categories/channels and membership depend on RLS-protected writes. UI checks for owner/admin/member roles are not substitutes for backend enforcement. Voice-channel switching must leave the previous media session before joining another.

## Voice and WebRTC

`useWebRTC` implements DM call states from ringing through connecting/connected and terminal outcomes. It owns the peer connection, offer/answer/ICE exchange, local camera/microphone tracks, remote streams, timeout handling, and teardown. Tracks and senders must stop once, signaling subscriptions must be removed, and late ICE/signaling must not revive an ended call.

Voice-channel media is presented by `SfuScreenShare`. Dashboard/media-session state supplies participants and streams; the component owns only view state (pin, grid, carousel, page, and watch selection). Stream identity should use stable participant/track identifiers rather than array position.

## Screen sharing

Screen and camera tracks are upstream-owned media resources. `SfuScreenShare` binds them to video elements, chooses responsive layouts, and reports user actions upward. Pinning and stopping a watch alter presentation/subscription intent; they do not transfer track ownership. Cleanup must detach element streams and leave track shutdown to the layer that created them.

## Mobile and Capacitor

`App` configures body-resize keyboard behavior and the Android back/deep-link lifecycle. CSS safe-area and viewport variables keep composer trays, call overlays, and long-press portals above the keyboard/system UI.

Authored Android classes provide two bridges:

- `MessAppWebView` and `KeyboardImagePlugin` accept images committed by Android keyboards, copy temporary URI content to app-private storage, and notify JavaScript.
- `CallAudioPlugin` enters Android communication audio mode, switches speaker routing, and restores the pre-call audio state.

Temporary URI permissions, streams, plugin listeners, and audio routing all require cleanup. Generated Capacitor assets are not authored source.

## Desktop and Tauri

`src-tauri/src/main.rs` starts the desktop shell and suppresses the extra Windows release console. `src-tauri/src/lib.rs` owns the Tauri lifecycle and enables native informational logging only in debug builds. The React application and Supabase client remain shared with web/mobile.

## Important data models

Names below are client-observed dependencies, not a schema declaration:

- `profiles`: user display identity, presence/settings-related fields, public key, and push registration.
- `dm_rooms` / DM membership data: direct-conversation identity and participants.
- `servers`, `server_members`, `categories`, `channels`: community hierarchy and roles.
- `messages`, `message_attachments`, `message_reactions`: conversation content and related state.
- read/receipt records: per-user channel or DM visibility progress.
- call/voice data and Realtime channels: signaling and voice-session coordination.

Confirm exact columns, constraints, RPC contracts, and policy behavior against both authored migrations and the deployed backend before changing queries. A generated linked-schema snapshot is evidence of current remote state, not an authored source of truth.

## Security boundaries

- Supabase Auth establishes identity; RLS/RPC/Storage policies establish authorization.
- Web Crypto helpers handle ECDH, AES-GCM, fingerprints, randomness, and PIN wrapping. They do not provide a full ratcheting protocol or independently prove peer identity.
- Rendering routes untrusted links/media through `src/lib/security.js`; Markdown must not bypass those checks.
- Local caches and localStorage are device-local convenience state, not trusted backend truth.
- Diagnostics must exclude tokens, passwords, private/encrypted keys, full message content, signed URLs, service-role keys, and attachment contents.

## Repository and deployment hygiene

- `SYSTEM_DOCUMENTATION.md` is the project-level system reference. Do not recreate a root `AGENTS.md`.
- Keep the entire `supabase/` directory local-only. Its configuration, Edge Functions, migrations, tests, reference exports, generated schemas, and local state must not be staged or committed.
- Keep database dumps, environment files, service-account material, signing keys, and local credential files out of Git.
- Keep `.env.example` limited to variable names and safe placeholders. Real `.env*` files remain local.
- Do not edit generated build directories. Android, iOS, and Tauri source projects are tracked; their build caches, local SDK paths, signing files, and platform service credentials are ignored.
- Database deployment is a separate, explicit operation. Review the migration diff and run local isolation checks before applying it to any remote project.
- Never commit, deploy, or push as a side effect of documentation or local validation work.

## Debug-label reference

`src/lib/debug.js` accepts stable labels and structured metadata. `debug`/`info` are disabled in production unless `localStorage.messappDebug` is `true`; warnings/errors remain available and metadata is sanitized.

| Label | Boundary |
|---|---|
| `APP_SESSION` | Initial session lookup and auth transitions |
| `PROFILE_LOAD` | Profile retrieval/provisioning |
| `DM_LIST` | DM navigation loading |
| `CHAT_LOAD` | Conversation load/pagination |
| `MESSAGE_SEND`, `MESSAGE_SEND_ERROR` | Optimistic send and persistence |
| `MESSAGE_REALTIME` | Target-scoped message reconciliation |
| `REACTION`, `REACTION_ERROR` | Reaction replacement/write |
| `ATTACHMENT_UPLOAD`, `ATTACHMENT_RESOLVE` | Storage and temporary URL lifecycle |
| `VOICE_JOIN`, `VOICE_LEAVE`, `VOICE_STATE` | Voice-channel lifecycle |
| `MEDIA_CAMERA`, `MEDIA_SCREEN` | Local track lifecycle |
| `STREAM_WATCH`, `STREAM_PIN` | Remote presentation/subscription intent |
| `WEBRTC_SIGNAL`, `WEBRTC_ERROR` | DM call signaling/failures |
| `SUPABASE_ERROR` | Safe database/RPC failure context |
| `MOBILE_WEBVIEW` | Capacitor/WebView workarounds |

Do not emit events during render loops, scrolling, presence heartbeats, or video frames.

## Where to start for common tasks

| Task | Primary files |
|---|---|
| Message sending | `src/hooks/useChatManager.js`, `src/components/chat/MessageElements.jsx` |
| Reactions | `src/components/chat/MessageElements.jsx`, `src/lib/reactions.js` |
| Voice calls | `src/hooks/useWebRTC.js`, `src/components/chat/CallOverlay.jsx` |
| Voice channels | `src/components/Dashboard.jsx`, `src/components/screen-share/SfuScreenShare.jsx` |
| Server UI | `src/components/layout/LeftSidebar.jsx`, `src/components/modals/ServerSettings.jsx` |
| Supabase security | `supabase/migrations`, `supabase/tests` |
| Android WebView | `MessAppWebView.java`, `KeyboardImagePlugin.java`, `MainActivity.java` |
| Android call audio | `CallAudioPlugin.java`, `src/hooks/useWebRTC.js` |
| Desktop shell | `src-tauri/src/lib.rs`, `src-tauri/src/main.rs` |
| Safe diagnostics | `src/lib/debug.js` |
