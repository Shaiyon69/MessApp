# 🔐 Security & Sensitive Data Guide

## Overview
This document outlines the security measures and sensitive data handling practices for MessApp.

## 🚨 Critical Security Rules

### Environment Variables (NEVER COMMIT)
- `.env*` files are **never** committed to version control
- Contains Supabase URLs, API keys, and service credentials
- Use `import.meta.env.VITE_*` for client-side variables
- Server-side secrets should use backend services only

### Encryption Keys
- **E2EE Private Keys**: Stored in `localStorage` as `e2ee_private_key_{userId}`
- **Legacy Keys**: Stored in `localStorage` as `e2ee_legacy_keys_{userId}`
- **Shared Keys**: Derived dynamically, never persisted
- **Browser Storage**: Encrypted at rest using browser's built-in security

### Mobile Keystores
- **Android**: `android/app/keystores/release.keystore` (ignored)
- **iOS**: Certificates and provisioning profiles (ignored)
- **Never** commit signing certificates to version control

## 🛡️ Protected Files (.gitignore)

### Already Protected:
```
.env*                    # Environment variables
*.key, *.pem, *.p12      # Private keys and certificates
keystore.*               # Android signing keys
google-services.json     # Firebase/Google services
supabase.key            # Supabase service keys
serviceAccount.json     # Service account credentials
localStorage/           # Browser storage dumps
e2ee_keys/             # Encryption key backups
```

### Build Artifacts:
```
dist/, build/           # Compiled applications
*.aab, *.apk, *.ipa    # Mobile packages
```

## 🔑 Key Management

### Client-Side Encryption:
1. **Key Generation**: ECDH key pairs generated per user
2. **Key Storage**: Private keys in browser localStorage
3. **Key Derivation**: Shared keys derived using ECDH
4. **Key Rotation**: Legacy keys maintained for compatibility

### Authentication Tokens:
- Supabase JWT tokens stored in localStorage automatically
- Session management handled by Supabase client
- Tokens auto-refresh and expire properly

## ⚠️ Security Best Practices

### Development:
1. **Never** hardcode API keys or secrets
2. **Always** use environment variables for configuration
3. **Never** log sensitive data or encryption keys
4. **Always** validate inputs before encryption/decryption

### Production:
1. **Environment variables** set via hosting platform
2. **HTTPS enforced** for all communications
3. **CSP headers** configured for XSS protection
4. **Service Worker** validates all requests

### Code Review:
1. **Check for** hardcoded secrets in commits
2. **Verify** .gitignore covers all sensitive patterns
3. **Audit** localStorage usage for key storage
4. **Review** API endpoints for data exposure

## 🚨 Incident Response

### If Secrets Are Exposed:
1. **Immediately** rotate all exposed keys
2. **Revoke** any compromised API tokens
3. **Update** environment variables
4. **Force** user re-authentication if needed
5. **Audit** access logs for suspicious activity

### Data Breach Protocol:
1. **Stop** the application/service
2. **Assess** scope of exposure
3. **Notify** affected users
4. **Rotate** all encryption keys
5. **Update** security measures
6. **Document** lessons learned

## 📋 Security Checklist

- [ ] Environment variables properly configured
- [ ] No hardcoded secrets in code
- [ ] .gitignore covers all sensitive files
- [ ] Encryption keys never logged or exposed
- [ ] HTTPS enforced in production
- [ ] API keys have minimal required permissions
- [ ] Regular security audits scheduled
- [ ] Incident response plan documented

## 🔍 Monitoring

### Security Events to Monitor:
- Failed authentication attempts
- Unusual API usage patterns
- Access to sensitive endpoints
- Encryption key generation failures
- Data export/download activities

### Automated Security:
- ESLint rules for secret detection
- Pre-commit hooks for sensitive file detection
- Dependency scanning for vulnerabilities
- Regular security updates

---

**Remember**: Security is an ongoing process. Regular audits and updates are essential to maintain data protection.
