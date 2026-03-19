# 🚀 MessApp

MessApp is a secure, real-time messaging platform designed to keep users connected seamlessly across Web, Android, and Linux environments. Built with a focus on speed, responsiveness, and data security, it provides a comprehensive chat experience ranging from private direct messages to multi-channel community servers.

## ✨ Core Features
* **Real-Time Synchronization:** Instant message delivery and live state updates powered by Supabase Realtime.
* **Server & Channel Architecture:** Organize conversations into dedicated servers with distinct text channels for structured group discussions.
* **Direct Messaging:** Secure, private 1-on-1 conversations with other users.
* **Cross-Platform Access:** A unified experience whether accessing the live web deployment or using the native "headless" builds for Linux and Android.
* **User Customization:** Comprehensive profile management and user settings.
* **Robust Security:** Secure email-link authentication, session persistence, and strict Postgres Row Level Security (RLS) policies to protect user data.

## 🛠️ Technology Stack
* **Frontend:** React + Vite
* **Backend & Database:** Supabase (Postgres, Auth, Realtime, Storage)
* **Native Wrappers:** Capacitor (Android) and Tauri (Linux)

## 🧭 System Architecture
The application is highly modularized to handle complex state and real-time events efficiently:
* **Authentication Engine:** Centralized routing and deep-link session handling.
* **Dashboard Interface:** The primary command center driving the chat UI, real-time subscriptions, and message history.
* **Modular Interface System:** Dedicated modal components for managing Server creation, Channel configurations, and User preferences.

## 🗺️ Current Status & Roadmap
**Current Version:** `v0.1.0-beta`
* [x] Cross-platform build architecture (Web, Android APK, Linux .deb/.AppImage)
* [x] Deep-linked email authentication
* [ ] Push notifications
* [ ] Media and file sharing

## 📚 Technical Documentation
For a deep dive into the underlying architecture, data models, and deployment strategies, refer to our [System Documentation](./SYSTEM_DOCUMENTATION.md).
