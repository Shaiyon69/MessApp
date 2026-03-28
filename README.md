<div align="center">

# 🚀 MessApp

**ONE MESS AT A TIME**

*A secure, real-time messaging platform designed to keep users connected seamlessly across Web, Android, and Linux environments.*

[![Version](https://img.shields.io/badge/version-v0.1.0--beta-blue.svg)](https://github.com/messapp/messapp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/messapp/messapp/blob/main/LICENSE)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4.0-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

</div>

---

## 📸 Screenshots

### Core Features

| Login / Onboarding | Dashboard / Chat Interface |
|:---:|:---:|
| <img src="./public/screenshots/login.png" alt="Login Screenshot" width="400"/> | <img src="./public/screenshots/dashboard.png" alt="Dashboard Screenshot" width="400"/> |

| User Profile & Settings | Media & Lightbox |
|:---:|:---:|
| <img src="./public/screenshots/profile.png" alt="Profile Settings" width="400"/> | <img src="./public/screenshots/lightbox.png" alt="Media Lightbox" width="400"/> |

### Ongoing Features & Development

| P2P Voice Calling (WIP) | Server Architecture (WIP) |
|:---:|:---:|
| <img src="./public/screenshots/calling.png" alt="Voice Calling" width="400"/> | <img src="./public/screenshots/servers.png" alt="Servers" width="400"/> |

### New Features: E2EE Secure Storage & Data Control
| Privacy & Safety | App Settings |
|:---:|:---:|
| <img src="./public/screenshots/settings.png" alt="Privacy & Safety" width="400"/> | <img src="./public/screenshots/settings.png" alt="Settings Menu" width="400"/> |

### App Settings
<p align="center">
  <img src="./public/screenshots/settings.png" alt="Settings Menu" width="800"/>
</p>

---

## ✨ Core Features

* **Real-Time Synchronization:** Instant message delivery and live state updates powered by Supabase Realtime.
* **Server & Channel Architecture:** Organize conversations into dedicated servers with distinct text channels for structured group discussions.
* **Direct Messaging:** Secure, private 1-on-1 conversations with other users.
* **Cross-Platform Access:** A unified experience whether accessing the live web deployment or using the native "headless" builds for Linux (Tauri) and Android (Capacitor).
* **Rich Messaging:** Markdown rendering with syntax highlighting for code blocks.
* **User Customization:** Comprehensive profile management and UI theme color persistence.
* **Robust Security:** Secure email-link authentication, session persistence, and strict Postgres Row Level Security (RLS) policies to protect user data.
* **End-to-End Encryption (E2EE):** Secure encrypted message vaults ensuring absolute privacy.
* **Data Control:** Hard deletes giving users full autonomy over their data.

---

## 🛠️ Technology Stack

* **Frontend:** React 19 + Vite 6
* **Styling:** Tailwind CSS v4 (Semantic design system with `@theme`)
* **Backend & Database:** Supabase (Postgres, Auth, Realtime, Storage)
* **Native Wrappers:** Capacitor (Android) and Tauri (Linux)
* **Testing:** Vitest + React Testing Library

---

## 🚀 Getting Started

Follow these steps to set up the development environment on your local machine.

### Prerequisites

* Node.js v22.22.1 or newer
* npm (Node Package Manager)
* A Supabase project

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/messapp/messapp.git
   cd messapp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   *(Note: Never commit local `.env` files to version control.)*

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

---

## 🧭 System Architecture

The application is highly modularized to handle complex state and real-time events efficiently:
* **Authentication Engine:** Centralized routing and deep-link session handling within `App.jsx`.
* **Dashboard Interface:** The primary command center driving the chat UI, real-time subscriptions, and message history (`Dashboard.jsx`).
* **Modular Interface System:** Dedicated modal components for managing Server creation, Channel configurations, and User preferences.

For a deeper dive into the data flow, database schema blueprint, and development architecture, please refer to our [System Documentation](./SYSTEM_DOCUMENTATION.md).

---

## 🗺️ Roadmap

**Current Version:** `v0.1.3-beta`

### Phase 1: Foundation (Completed)
- [x] Cross-platform build architecture (Web, Android APK, Linux .deb/.AppImage)
- [x] Deep-linked email authentication
- [x] Direct Messaging Architecture
- [x] Secure local storage management and cache pruning
- [x] Supabase Auth, Realtime, and Storage Integration

### Phase 2: Rich Features & Optimization (Current)
- [x] Media upload and optimization pipeline (`browser-image-compression`)
- [x] In-app media lightbox viewer
- [x] P2P signaling via Supabase Channels (WebRTC Foundation)
- [ ] Push notifications
- [ ] Hardware-accelerated voice and video calls
- [ ] Server Architecture implementation (Channels, Moderation)
- [ ] Desktop notifications & Native mobile overlays

### Phase 3: Privacy & Security (Upcoming)
- [x] End-to-End Encryption (E2EE) using `crypto.subtle`
- [ ] Double Ratchet algorithm for perfect forward secrecy
- [x] Local encrypted message vaults

---

## 💖 Support / Donate

If you enjoy using MessApp and want to support its ongoing development, please consider donating:

- [Support on Ko-fi](https://ko-fi.com/messapp)
- [Sponsor on GitHub](https://github.com/sponsors/messapp)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

## 🤝 Contributing

We welcome contributions! Please follow our established style guidelines and feature branch conventions (e.g., `feature/awesome-feature` or `fix/annoying-bug`).

Ensure you run tests and linters before submitting a Pull Request:
```bash
npm run test
npm run lint
```

*MessApp is proudly built for communities, one mess at a time.*
