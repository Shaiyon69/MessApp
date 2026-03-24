## 2024-05-24 - [Insecure Randomness for Security-Sensitive Identifiers]
**Vulnerability:** Weak random number generation using `Math.random()` to generate secure tokens like server invite codes and unique user discriminators.
**Learning:** `Math.random()` is not cryptographically secure, and using it to generate short invite codes or user tags can lead to predictable collision vectors or enumeration attacks.
**Prevention:** Use `crypto.getRandomValues()` or native `crypto.randomUUID()` for generating sensitive identifiers. The `src/lib/crypto.js` file needs a reliable `generateSecureRandomString` and `generateSecureRandomNumber` utility function.
