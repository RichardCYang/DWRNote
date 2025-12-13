# NTEOK

Self-Hostable Web-Based Note-Taking Application

---

**[한국어](README.md)** | **English**

---

<img src="./example.png" width="100%" title="NTEOK_Screenshot"/>

## Overview

**NTEOK** is a compound word combining the Korean words "Neok (넋, soul)" and "Note". It is a multi-user note-taking web application built on Node.js and MySQL, featuring block-based markdown editing and End-to-End encryption.

### Key Features

- **Markdown Editor**: Tiptap-based block editor
- **End-to-End Encryption**: AES-256-GCM client-side encryption
- **Collection Sharing**: User collaboration and link sharing
- **Hierarchical Structure**: Parent-child page relationships
- **Two-Factor Authentication**: TOTP-based security enhancement
- **Responsive Design**: Optimized for mobile, tablet, and desktop
- **Self-Hosting**: Independent server operation

---

## Core Features

### User Management
- Registration and login system
- TOTP two-factor authentication (Google Authenticator, Authy, etc.)
- Session-based authentication
- Account deletion

### Note Editing
- **Block Types**: Paragraph, Heading (H1-H6), Lists (bullet/ordered), Blockquote, Code block, Horizontal rule, LaTeX math
- **Inline Formatting**: Bold, italic, strikethrough, text color
- **Alignment Options**: Left, center, right, justify
- **Slash Commands**: Type `/` to switch block types
- **Keyboard Shortcuts**: `Ctrl+S` / `Cmd+S` to save

### Collections and Pages
- Group pages by collection
- Hierarchical page structure (parent-child relationships)
- Page icon settings (170 Font Awesome icons, 400 emoji)
- Auto-sort by last modified time
- Drag-and-drop sorting (planned)

### Security Features
- **E2EE Encryption**: AES-256-GCM encryption
- **Client-Side Encryption**: Only encrypted data sent to server
- **TOTP 2FA**: Time-based one-time password
- **CSRF Protection**: SameSite cookie settings
- **Session Management**: Secure cookie-based authentication

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
- **Authentication**: bcrypt (password hashing), speakeasy (TOTP)
- **Security**: cookie-parser, CSRF tokens, SameSite cookies

### Frontend
- **Core**: Vanilla JavaScript (ES6+ modules)
- **Editor**: Tiptap v2 (StarterKit, TextAlign, Color, Mathematics)
- **Math Rendering**: KaTeX
- **Encryption**: Web Crypto API (AES-256-GCM)
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

### Session Security
- SameSite=Strict cookie settings
- CSRF token verification
- Session timeout management

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
├── package.json           # Project dependencies
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
│       ├── crypto.js      # E2EE encryption
│       └── ui-utils.js    # UI utilities
└── README.md
```

---

## Keywords

note-taking app, markdown editor, web notes, E2EE, end-to-end encryption, encrypted notes, self-hosted, open-source notes, Node.js note app, MySQL note app, collaborative notes, shared notes, Tiptap editor, two-factor authentication, TOTP, responsive note app, web-based notes, personal note server, privacy-focused notes, secure notes

---

## License

MIT License

---

## Developer

RichardCYang
