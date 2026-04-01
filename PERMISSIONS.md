# MessApp Permissions & Data Usage

## Android Permissions Explained

### Required Permissions

#### 1. Internet (android.permission.INTERNET)
- **Purpose**: Connect to Supabase backend for messaging
- **Usage**: Send/receive encrypted messages, authentication
- **Necessity**: Core functionality - app cannot work without internet
- **Data**: Transmits encrypted message data only

#### 2. POST_NOTIFICATIONS (Android 13+)
- **Purpose**: Send push notifications for new messages
- **Usage**: Alert users when they receive new messages
- **Necessity**: Important for real-time messaging experience
- **Data**: Only notification content, no message content
- **Control**: Can be disabled in system settings

#### 3. Network State (android.permission.ACCESS_NETWORK_STATE)
- **Purpose**: Check internet connectivity
- **Usage**: Optimize app behavior based on connection status
- **Necessity**: Improves user experience
- **Data**: Only connection status (online/offline)

#### 4. Wake Lock (android.permission.WAKE_LOCK)
- **Purpose**: Keep device awake during critical operations
- **Usage**: Message synchronization, encryption operations
- **Necessity**: Ensures message delivery reliability
- **Data**: No personal data access

#### 5. Vibrate (android.permission.VIBRATE)
- **Purpose**: Haptic feedback for notifications
- **Usage**: Vibrate when messages arrive
- **Necessity**: Optional - enhances user experience
- **Data**: No personal data access

### Optional Permissions

#### 6. Camera (android.permission.CAMERA)
- **Purpose**: Take profile pictures
- **Usage**: Set user avatar
- **Necessity**: Optional - can use default avatar
- **Data**: Images only used for profile picture

#### 7. Read External Storage (android.permission.READ_EXTERNAL_STORAGE)
- **Purpose**: Access media files for sharing
- **Usage**: Select images from gallery to send
- **Necessity**: Optional - can use camera instead
- **Data**: Only selected files, not entire storage

#### 8. Write External Storage (android.permission.WRITE_EXTERNAL_STORAGE)
- **Purpose**: Save media files and app data
- **Usage**: Cache downloaded images, store app data
- **Necessity**: Optional - limited to app directories
- **Data**: Only app-related files

## Data Collection Breakdown

### What We Collect
- **Authentication Data**: Email, username (encrypted)
- **Public Keys**: For end-to-end encryption
- **Profile Information**: Avatar, bio (optional)
- **Technical Data**: Device type, OS version
- **Usage Analytics**: Anonymous crash reports, performance metrics

### What We DON'T Collect
- **Message Content**: End-to-end encrypted, inaccessible to us
- **Location Data**: No GPS or location tracking
- **Contact Lists**: No access to phone contacts
- **Call History**: No voice call logging
- **Financial Information**: No payment data
- **Advertising Data**: No tracking for ads

### Data Storage Locations
- **Local Device**: Private keys (encrypted with PIN), message cache
- **Supabase**: Public keys, user profiles, encrypted message metadata
- **Firebase**: Push notification tokens, crash reports
- **Google Play**: App installation data, analytics

## Security Measures

### Encryption
- **Messages**: AES-GCM-256 encryption
- **Key Exchange**: ECDH P-256 curve
- **Storage**: PBKDF2 key derivation (100k iterations)
- **Transmission**: HTTPS/TLS 1.3

### Access Controls
- **Authentication**: Required for all data access
- **Authorization**: Role-based access control
- **Audit Logs**: All data access logged
- **Regular Security**: Updates and patches

### Data Minimization
- **Only Necessary Data**: Collect minimum required
- **Automatic Cleanup**: Delete old data regularly
- **User Control**: Users can delete their data
- **Transparent**: Clear explanation of all data use

## Third-Party Services

### Supabase
- **Purpose**: Database and authentication
- **Data**: User profiles, public keys, message metadata
- **Privacy**: https://supabase.com/privacy
- **Security**: SOC 2 Type II certified

### Firebase
- **Purpose**: Push notifications and analytics
- **Data**: Notification tokens, crash reports
- **Privacy**: https://firebase.google.com/privacy
- **Security**: ISO 27001 certified

### Google Play Services
- **Purpose**: App functionality and distribution
- **Data**: Installation data, minimal analytics
- **Privacy**: https://policies.google.com/privacy
- **Security**: Google's security standards

## User Rights

### Access Rights
- **Data Export**: Download your data
- **Account Deletion**: Delete all your data
- **Correction**: Update incorrect information
- **Portability**: Transfer data to other services

### Control Rights
- **Consent**: Choose what data to share
- **Withdrawal**: Remove consent at any time
- **Opt-out**: Disable analytics and tracking
- **Complaint**: Report privacy concerns

## Compliance

### Regulations
- **GDPR**: EU General Data Protection Regulation
- **CCPA**: California Consumer Privacy Act
- **PIPEDA**: Canadian Privacy Act
- **LGPD**: Brazilian Data Protection Law

### Standards
- **ISO 27001**: Information security management
- **SOC 2**: Service organization controls
- **Privacy Shield**: EU-US data transfer framework
- **APEC PRP**: Cross-border privacy rules

## Contact Information

### Privacy Questions
- **Email**: privacy@messapp.com
- **Website**: https://messapp.com/privacy
- **Response Time**: Within 30 days

### Data Requests
- **Access**: data@messapp.com
- **Deletion**: delete@messapp.com
- **Correction**: correct@messapp.com

### Security Concerns
- **Security**: security@messapp.com
- **Bugs**: security@messapp.com
- **Incidents**: incidents@messapp.com

---

This document is intended to be transparent about our data practices. If you have any questions about permissions or data usage, please don't hesitate to contact us.
