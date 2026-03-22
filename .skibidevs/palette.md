## 2025-03-21 - Authentication Viewports
**Learning:** Hardcoding `overflow-hidden` globally on the `<body>` and `#root` wrappers forces users with shorter viewport heights to be unable to scroll the main application interfaces (like Login/Register panels), rendering submit buttons inaccessible.
**Action:** Removed global `overflow-hidden` and explicitly defined `h-screen overflow-y-auto` exclusively on the React Auth routing wrapper inside `App.jsx`, ensuring panels stay centered but gracefully scroll on smaller screens.
