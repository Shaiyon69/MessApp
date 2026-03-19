# MessApp System Documentation

## 1) Project Overview
MessApp is a React + Vite secure chat platform built with Supabase for authentication, database, real-time subscriptions, and storage. It supports:
- User auth (register, login, logout)
- Direct messages (DMs)
- Server-based team channels
- Real-time message updates (Supabase Realtime)
- File attachments via Supabase Storage
- Theme customization and presence indicators

## 2) High-level Architecture

### Frontend
- React functional components (App, Login, Register, Dashboard, modals)
- Tailwind-style utility classes + custom CSS in `src/style/index.css`
- Client state via React `useState`, `useEffect`, `useRef`
- Markdown rendering in messages through `react-markdown` + `remark-gfm`
- Syntax highlight with `react-syntax-highlighter`
- Toast feedback via `react-hot-toast`

### Backend (Supabase)
- Auth: email/password register and sign-in
- Postgres tables used by app (example): `profiles`, `servers`, `server_members`, `channels`, `messages`, `dm_members`, `channel_reads`
- Realtime: subscriptions to `messages`, `channels`, and presence updates
- Storage: `chat-attachments` bucket for image upload

## 3) Data Flow
1. User signs in and receives session in `App.jsx`
2. `Dashboard.jsx` reads user servers and DMs and subscribes to channel/message updates.
3. New messages are inserted into `messages` table and broadcast by Supabase realtime.
4. UI updates message list and scrolls to latest messages.
5. Image upload stores file in Supabase Storage and creates a message record with `image_url`.

## 4) Core Components and Their Responsibilities
- `App.jsx`: Auth gating (login/register vs dashboard)
- `Login.jsx`, `Register.jsx`: User onboarding flows with Supabase auth
- `Dashboard.jsx`: Main chat UI, server/channel/DM selection, message CRUD, presence, themes
- `src/components/modals/*`: UI forms for server/channel/DM/user settings

## 5) Key Feature Map
- Authentication: secure signup/login/logout
- Server list + channel list + DM list
- Realtime CRUD for messages
- Message editing/deleting for own messages
- Image attachments in messages
- Channel unread markers and read-tracking in `channel_reads`
- Presence indicators using Supabase Realtime presence
- UI theme color persistence via `localStorage`

## 6) Security & Privacy Design (Current + Recommended)
### Core zero-knowledge architecture
- Client-only cryptographic keys generated with Web Crypto API
- Supabase used only for auth, presence signaling, and optional encrypted attachments storage
- Message payload encryption performed before transmit (E2EE), server stores encrypted blobs only
- Local cache pruning with `cacheManager` to keep local storage < 100MB
- No external telemetry or analytics; all logs are local and ephemeral

### Implemented now:
- Auth using Supabase secure session tokens
- Profile-level unique tags for user identity
- Soft UI privacy options: server/DM membership boundaries
- Basic P2P signaling and encrypted message handshake via Supabase Realtime channel
- Encrypted image pipeline through P2P data channel fallback and secure storage upload path

### Recommended additions (for secure mobile+web app):
- Stronger key management for device keys and cross-device trust chains
- Full `Signal Protocol` / double ratchet for perfect forward secrecy
- Expiring and revoke-able one-time message keys
- Encrypted search and zero-knowledge metadata minimization
- Mobile-first UI accessibility and offline sync with encrypted queue

## 7) Development Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up Supabase project and add env variables in `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Run app:
   ```bash
   npm run dev
   ```
4. Open at `http://localhost:5173`

## 8) Database Schema Blueprint (suggested)
Recommended core tables:
- `profiles`: id, username, avatar_url, unique_tag, metadata
- `servers`: id, name, owner_id
- `server_members`: server_id, profile_id, role
- `channels`: server_id, name, type
- `dm_rooms`: id, created_at
- `dm_members`: dm_room_id, profile_id
- `messages`: id, profile_id, channel_id?, dm_room_id?, content, image_url, created_at, updated_at
- `channel_reads`: profile_id, channel_id, last_read_at

## 9) Production & Deployment Notes
- Build:
  ```bash
  npm run build
  ```
- Deploy to Vercel / Netlify / Supabase Edge with env vars
- Ensure Supabase Row Level Security (RLS) policies are configured strictly for authenticated access

## 10) Next Milestones (Product Roadmap)
1. Strong encryption + key management for E2EE.
2. Mobile-responsive app shell and PWA support.
3. Multi-device login and session dashboard.
4. Rich message features: reactions, threads, voice notes.
5. Admin role controls, server moderation, link invites.

## 11) Where to Customize
- `src/supabaseClient.js`: Supabase initialization and auth helper
- `src/components/Dashboard.jsx`: Main chat logic (the bulk of features), including secure P2P handshake, channel CRUD, and invite handling
- `src/components/modals/ServerSettings.jsx`: Server invite code generation and sharing
- `src/components/modals/JoinServer.jsx`: Join by invite code maps correctly to server_id
- `src/components/modals/ChannelCreation.jsx`: Channel creation UI
- `src/style/index.css`: Global theme + appearance

## 12) Contribution Guide
- Use feature branches named like `feature/e2ee` or `fix/read-marker`
- Follow code style in the existing code (functional components, modular handlers)
- Add tests once stability is confirmed (UI interactions, message flows)

---
_Last updated: March 2026_
