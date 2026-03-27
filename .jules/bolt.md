## 2024-05-24 - Array vs Set in React Renders
**Learning:** Using `.includes()` on standard JS arrays inside a React render loop (e.g. within a `.map()` or `.filter()`) turns an O(N) operation into an O(N * M) bottleneck, leading to massive re-render lags when datasets grow.
**Action:** Always wrap arrays into `Set` objects using `useMemo` when performing repeated existence checks inside render loops to reduce lookup complexity from O(N) to O(1).
