# MessApp (Secure Messaging App)

MessApp is a real-time, secure chat platform built with React + Vite + Supabase.

## 📚 Documentation
- System documentation: [SYSTEM_DOCUMENTATION.md](./SYSTEM_DOCUMENTATION.md)

## 🚀 Quick Start
1. Install dependencies:
   ```bash
   npm install
   ```
2. Add Supabase env vars to `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Run:
   ```bash
   npm run dev
   ```

## 🧭 Project Structure
- `src/App.jsx` — authentication routing and session handling
- `src/components/Login.jsx` — login screen
- `src/components/Register.jsx` — registration screen
- `src/components/Dashboard.jsx` — chat app UI and main logic
- `src/components/modals/` — server/channel/DM/user settings modals
- `src/supabaseClient.js` — Supabase client configuration

## 🔐 Notes
- The app uses Supabase Auth, Realtime, Postgres, and Storage.
- For production, enable strict RLS policies and verify secure data access.

