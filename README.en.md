# NTEOK

Self-Hostable Web-Based Note-Taking Application

---

**[한국어](README.md)** | **[日本語](README.jp.md)** | **English**

---

<img src="./example.png" width="100%" title="NTEOK_Screenshot"/>

## Overview

**NTEOK** is a compound word combining the Korean words "Neok (넋, soul)" and "Note". It is a multi-user note-taking web application built on Node.js and MySQL, featuring block-based markdown editing and End-to-End encryption.

### Key Features

- **Markdown Editor**: Tiptap-based block editor with checklist and image block support
- **End-to-End Encryption**: AES-256-GCM client-side encryption
- **Collection Sharing**: User collaboration and link sharing
- **Hierarchical Structure**: Parent-child page relationships
- **Multiple Authentication**: TOTP 2FA and Passkey (WebAuthn) support
- **Backup/Restore**: Complete data backup and recovery in ZIP format
- **Real-time Synchronization**: Real-time page content sync via WebSocket
- **Cover Images**: Page cover image settings and sorting
- **HTTPS Auto Certificate**: Let's Encrypt + DuckDNS integration
- **Responsive Design**: Optimized for mobile, tablet, and desktop
- **Self-Hosting**: Independent server operation

---

## Core Features

### User Management
- Registration and login system
- TOTP two-factor authentication (Google Authenticator, Authy, etc.)
- **Passkey Authentication** (WebAuthn/FIDO2 - biometric, hardware tokens)
- Session-based authentication
- Account deletion

### Note Editing
- **Block Types**: Paragraph, Heading (H1-H6), Lists (bullet/ordered), Image, Blockquote, Code block, Horizontal rule, LaTeX math
- **Inline Formatting**: Bold, italic, strikethrough, text color
- **Alignment Options**: Left, center, right, justify
- **Image Features**: Image block alignment and caption support
- **Slash Commands**: Type `/` to switch block types
- **Keyboard Shortcuts**: `Ctrl+S` / `Cmd+S` to save

### Collections and Pages
- Group pages by collection
- Hierarchical page structure (parent-child relationships)
- Page icon settings (170 Font Awesome icons, 400 emoji)
- **Page Cover Images**: Set default or user-uploaded cover images
- Auto-sort by last modified time
- Drag-and-drop sorting (planned)

### Security Features
- **E2EE Encryption**: AES-256-GCM encryption
- **Client-Side Encryption**: Only encrypted data sent to server
- **TOTP 2FA**: Time-based one-time password
- **Passkey Security**: WebAuthn standard-based strong authentication
- **CSRF Protection**: SameSite cookie settings
- **Session Management**: Secure cookie-based authentication

### Data Management
- **Backup/Restore**: Full backup and recovery of collections and pages in ZIP format
- **Data Export**: Convert page content to HTML format
- **Data Import**: Recover and restore previous backup data

### Real-time Synchronization
- **WebSocket-based Sync**: Real-time page change synchronization
- **Collaborative Editing**: Support simultaneous editing by multiple users (Yjs-based)
- **Data Consistency**: Conflict resolution and improved sync accuracy

### Collaboration Features
- **User Sharing**: Share collections with specific users
- **Link Sharing**: Access collections via link
- **Permission Management**: READ, EDIT, OWNER permission levels
- **Encrypted Page Sharing**: Share permission settings for encrypted pages

---

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express 5.x
- **Database**: MySQL 8.x
- **Authentication**: bcrypt (password hashing), speakeasy (TOTP), @simplewebauthn (Passkey)
- **Security**: cookie-parser, CSRF tokens, SameSite cookies
- **Backup**: archiver (ZIP creation), adm-zip (ZIP extraction)
- **Real-time**: WebSocket (ws), Yjs (CRDT-based synchronization)
- **HTTPS**: acme-client (Let's Encrypt), dotenv (environment variables)

### Frontend
- **Core**: Vanilla JavaScript (ES6+ modules)
- **Editor**: Tiptap v2 (StarterKit, TextAlign, Color, Mathematics, ImageWithCaption)
- **Math Rendering**: KaTeX
- **Encryption**: Web Crypto API (AES-256-GCM)
- **Passkey**: @simplewebauthn/browser (WebAuthn)
- **Real-time Sync**: Yjs, WebSocket
- **Icons**: Font Awesome 6
- **Styling**: Pure CSS (responsive design)

---

## Installation and Setup

### Prerequisites

- Node.js 18 LTS or higher
- MySQL 8.x server
- npm package manager

### 1. Create Database

```sql
CREATE DATABASE nteok
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

### 2. Environment Configuration

Create a `.env` file or set environment variables:

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=nteok
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
BCRYPT_SALT_ROUNDS=12
```

### 3. Install Dependencies and Run

```bash
npm install
npm start
```

Server runs at `http://localhost:3000`.

### 4. Initial Login

Login with default admin account and change password:
- Username: `admin` (or your configured value)
- Password: `admin` (or your configured value)

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/register` - Register
- `GET /api/auth/me` - Current user info
- `DELETE /api/auth/delete-account` - Delete account

### Two-Factor Authentication
- `POST /api/auth/totp/setup` - Setup TOTP
- `POST /api/auth/totp/verify` - Verify TOTP
- `DELETE /api/auth/totp/disable` - Disable TOTP

### Passkey (WebAuthn)
- `GET /api/passkey/status` - Check Passkey status
- `POST /api/passkey/register/options` - Generate registration options
- `POST /api/passkey/register/verify` - Verify registration
- `POST /api/passkey/authenticate/options` - Generate authentication options
- `POST /api/passkey/authenticate/verify` - Verify Passkey authentication

### Collections
- `GET /api/collections` - List collections
- `POST /api/collections` - Create collection
- `DELETE /api/collections/:id` - Delete collection

### Collection Sharing
- `POST /api/collections/:id/share` - Share with user
- `DELETE /api/collections/:id/share/:shareId` - Remove share
- `POST /api/collections/:id/share-link` - Create share link
- `POST /api/share-link/:token` - Access via share link

### Pages
- `GET /api/pages` - List pages
- `GET /api/pages/:id` - Get page
- `POST /api/pages` - Create page
- `PUT /api/pages/:id` - Update page
- `DELETE /api/pages/:id` - Delete page
- `PUT /api/pages/:id/share-permission` - Set encrypted page sharing
- `GET /api/pages/covers/user` - List user cover images

### Backup/Restore
- `POST /api/backup/export` - Export data (ZIP)
- `POST /api/backup/import` - Import data (ZIP)

---

## Security Considerations

### End-to-End Encryption
- Client-side AES-256-GCM encryption
- Only users possess encryption keys
- Server stores only encrypted data

### Two-Factor Authentication
- TOTP-based time-synchronized authentication
- Easy setup via QR code
- Backup codes (planned)

### Passkey Security
- WebAuthn/FIDO2 standard-based strong authentication
- Biometric (fingerprint, face recognition) and hardware token support
- Phishing attack prevention with strong encryption

### Session Security
- SameSite=Strict cookie settings
- CSRF token verification
- Session timeout management

### Data Backup Security
- Encrypted backup file storage
- Data integrity verification
- Restricted access permissions

---

## Design Concept

Modern reinterpretation of traditional Korean hanji (paper) minimalist aesthetics.

### Color Palette
- **Background**: Hanji-inspired cream/beige tones (#faf8f3, #f5f2ed)
- **Sidebar**: Dark beige tones (#ebe8e1)
- **Text**: Ink-like colors (#1a1a1a, #2d2d2d)
- **Accent**: Dark teal (#2d5f5d)

### Design Principles
- Restrained spacing and clean layout
- Minimalist interface with straight lines
- Responsive design for all devices
- Optimal readability with line-height of 1.7

---

## Project Structure

```
NTEOK/
├── server.js              # Express server entry point
├── cert-manager.js        # HTTPS certificate auto-issue module
├── package.json           # Project dependencies
├── .env.example           # Environment variables example
├── certs/                 # SSL/TLS certificate storage (auto-created)
├── covers/                # Cover image repository
│   ├── default/           # Default cover images
│   └── [userId]/          # User cover images
├── public/                # Client files
│   ├── index.html         # Main application
│   ├── login.html         # Login page
│   ├── register.html      # Registration page
│   ├── css/
│   │   ├── main.css       # Main styles
│   │   └── login.css      # Login styles
│   └── js/
│       ├── app.js         # Main logic
│       ├── editor.js      # Editor initialization
│       ├── pages-manager.js    # Page management
│       ├── encryption-manager.js  # Encryption management
│       ├── share-manager.js       # Sharing management
│       ├── settings-manager.js    # Settings management
│       ├── backup-manager.js      # Backup/restore management
│       ├── sync-manager.js        # Real-time synchronization
│       ├── passkey-manager.js     # Passkey authentication management
│       ├── crypto.js      # E2EE encryption
│       └── ui-utils.js    # UI utilities
├── routes/                # API routes
│   ├── auth.js            # Authentication routes
│   ├── pages.js           # Pages routes
│   ├── collections.js     # Collections routes
│   ├── shares.js          # Sharing routes
│   ├── totp.js            # TOTP routes
│   ├── passkey.js         # Passkey routes
│   ├── backup.js          # Backup/restore routes
│   └── index.js           # Route entry point
└── README.md
```

---

## Keywords

note-taking app, markdown editor, web notes, E2EE, end-to-end encryption, encrypted notes, self-hosted, open-source notes, Node.js note app, MySQL note app, collaborative notes, shared notes, Tiptap editor, two-factor authentication, TOTP, Passkey, WebAuthn, real-time synchronization, backup/restore, responsive note app, web-based notes, personal note server, privacy-focused notes, secure notes, cover images, Yjs

---

## License

MIT License

---

## Developer

RichardCYang
