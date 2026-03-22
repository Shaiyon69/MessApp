## 2025-03-21 - Authentication Viewports
**Learning:** Hardcoding `overflow-hidden` globally on the `<body>` and `#root` wrappers forces users with shorter viewport heights to be unable to scroll the main application interfaces (like Login/Register panels), rendering submit buttons inaccessible.
**Action:** Removed global `overflow-hidden` and explicitly defined `h-screen overflow-y-auto` exclusively on the React Auth routing wrapper inside `App.jsx`, ensuring panels stay centered but gracefully scroll on smaller screens.

## 2025-03-21 - CSS Animations for Mounting Components
**Learning:** Adding full-blown animation libraries for simple transition swaps between two components during conditional rendering can cause bloat.
**Action:** Used a simple pure CSS `@keyframes` in `index.css` called `.animate-slide-up` attached to the wrapper class. When React swaps out `<Login />` for `<Register />`, the newly injected DOM node naturally triggers the animation on mount, perfectly fulfilling requirements with minimal code overhead.
