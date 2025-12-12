const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

// 세션 / 인증 관련 설정
const SESSION_COOKIE_NAME = "nteok_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일
const CSRF_COOKIE_NAME = "nteok_csrf";

// 보안 개선: 기본 관리자 계정 비밀번호를 강제로 변경하도록 경고
// 환경변수로 설정하지 않으면 무작위 비밀번호를 생성하고 콘솔에 출력
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString("hex");
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

// 기본 비밀번호가 환경변수로 설정되지 않았다면 경고 메시지 출력
if (!process.env.ADMIN_PASSWORD) {
    console.warn("\n" + "=".repeat(80));
    console.warn("⚠️  보안 경고: 기본 관리자 비밀번호가 환경변수로 설정되지 않았습니다!");
    console.warn(`   관리자 계정: ${DEFAULT_ADMIN_USERNAME}`);
    console.warn(`   임시 비밀번호: ${DEFAULT_ADMIN_PASSWORD}`);
    console.warn("   첫 로그인 후 반드시 비밀번호를 변경하세요!");
    console.warn("   프로덕션 환경에서는 ADMIN_PASSWORD 환경변수를 반드시 설정하세요.");
    console.warn("=".repeat(80) + "\n");
}

/**
 * DB 연결 설정 정보
 */
const DB_CONFIG = {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "admin",
    database: process.env.DB_NAME || "nteok",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;
const sessions = new Map();

/**
 * Date -> MySQL DATETIME 문자열 (YYYY-MM-DD HH:MM:SS)
 */
function formatDateForDb(date) {
    const pad = (n) => (n < 10 ? "0" + n : "" + n);

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * 보안 개선: 암호학적으로 안전한 페이지 ID 생성
 * Math.random() 대신 crypto.randomBytes 사용
 */
function generatePageId(now) {
    const iso = now.toISOString().replace(/[:.]/g, "-");
    const rand = crypto.randomBytes(6).toString("hex"); // 12자 hex 문자열
    return "page-" + iso + "-" + rand;
}

/**
 * 보안 개선: 암호학적으로 안전한 컬렉션 ID 생성
 * Math.random() 대신 crypto.randomBytes 사용
 */
function generateCollectionId(now) {
    const iso = now.toISOString().replace(/[:.]/g, "-");
    const rand = crypto.randomBytes(6).toString("hex"); // 12자 hex 문자열
    return "col-" + iso + "-" + rand;
}

/**
 * DB DATETIME 값을 ISO 문자열로 변환
 */
function toIsoString(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === "string") {
        if (value.endsWith("Z")) {
            return value;
        }
        return value + "Z";
    }
    return String(value);
}

/**
 * CSRF 토큰 생성
 */
function generateCsrfToken() {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * CSRF 토큰 검증 (Double Submit Cookie 패턴)
 */
function verifyCsrfToken(req) {
    const tokenFromHeader = req.headers["x-csrf-token"];
    const tokenFromCookie = req.cookies[CSRF_COOKIE_NAME];

    if (!tokenFromHeader || !tokenFromCookie) {
        return false;
    }

    // 타이밍 공격 방지를 위한 상수 시간 비교
    return crypto.timingSafeEqual(
        Buffer.from(tokenFromHeader),
        Buffer.from(tokenFromCookie)
    );
}

/**
 * 세션 생성
 */
function createSession(user) {
    const sessionId = crypto.randomBytes(24).toString("hex");
    const expiresAt = Date.now() + SESSION_TTL_MS;

    sessions.set(sessionId, {
        userId: user.id,
        username: user.username,
        expiresAt
    });

    return sessionId;
}

/**
 * 요청에서 세션 읽기
 */
function getSessionFromRequest(req) {
    if (!req.cookies) {
        return null;
    }

    const sessionId = req.cookies[SESSION_COOKIE_NAME];
    if (!sessionId) {
        return null;
    }

    const session = sessions.get(sessionId);
    if (!session) {
        return null;
    }

    if (session.expiresAt <= Date.now()) {
        sessions.delete(sessionId);
        return null;
    }

    return { id: sessionId, ...session };
}

/**
 * 인증이 필요한 API용 미들웨어
 */
function authMiddleware(req, res, next) {
    const session = getSessionFromRequest(req);

    if (!session) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }

    req.user = {
        id: session.userId,
        username: session.username
    };

    next();
}

/**
 * CSRF 토큰 검증 미들웨어
 * GET, HEAD, OPTIONS 요청은 제외
 */
function csrfMiddleware(req, res, next) {
    // 안전한 메서드는 CSRF 검증 불필요
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        return next();
    }

    // 로그인/회원가입은 CSRF 토큰 없이도 허용 (첫 접속 시)
    if (req.path === "/api/auth/login" || req.path === "/api/auth/register") {
        return next();
    }

    // CSRF 토큰 검증
    if (!verifyCsrfToken(req)) {
        console.warn("CSRF 토큰 검증 실패:", req.path, req.method);
        return res.status(403).json({ error: "CSRF 토큰이 유효하지 않습니다." });
    }

    next();
}

/**
 * DB 초기화: 커넥션 풀 생성 + 테이블/기본 페이지 생성 + 사용자 정보 테이블 생성
 */
async function initDb() {
    pool = await mysql.createPool(DB_CONFIG);

    // users 테이블 생성
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            encryption_salt VARCHAR(255) NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
    `);

    // 기존 users 테이블에 encryption_salt 컬럼 추가 (없을 경우에만)
    try {
        await pool.execute(`
            ALTER TABLE users ADD COLUMN encryption_salt VARCHAR(255) NULL
        `);
        console.log("users 테이블에 encryption_salt 컬럼 추가 완료");
    } catch (error) {
        // 이미 컬럼이 존재하는 경우 무시
        if (error.code !== 'ER_DUP_FIELDNAME') {
            console.warn("encryption_salt 컬럼 추가 중 경고:", error.message);
        }
    }

    // users 가 하나도 없으면 기본 관리자 계정 생성
    const [userRows] = await pool.execute("SELECT COUNT(*) AS cnt FROM users");
    const userCount = userRows[0].cnt;

    if (userCount === 0) {
        const now = new Date();
        const nowStr = formatDateForDb(now);

        const username = DEFAULT_ADMIN_USERNAME;
        const rawPassword = DEFAULT_ADMIN_PASSWORD;

        // bcrypt 가 내부적으로 랜덤 SALT 를 포함한 해시를 생성함
        const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);

        await pool.execute(
            `
            INSERT INTO users (username, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            `,
            [username, passwordHash, nowStr, nowStr]
        );

        console.log("기본 관리자 계정 생성 완료. username:", username);
    }

    // collections 테이블 생성 (users 테이블 생성 후)
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS collections (
            id          VARCHAR(64)  NOT NULL PRIMARY KEY,
            user_id     INT          NOT NULL,
            name        VARCHAR(255) NOT NULL,
            sort_order  INT          NOT NULL DEFAULT 0,
            created_at  DATETIME     NOT NULL,
            updated_at  DATETIME     NOT NULL,
            CONSTRAINT fk_collections_user
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    `);

    // pages 테이블 생성
    await pool.execute(`
    	CREATE TABLE IF NOT EXISTS pages (
            id          VARCHAR(64)  NOT NULL PRIMARY KEY,
            sort_order  INT          NOT NULL DEFAULT 0,
            user_id     INT          NOT NULL,
            title       VARCHAR(255) NOT NULL,
            content     MEDIUMTEXT   NOT NULL,
            created_at  DATETIME     NOT NULL,
            updated_at  DATETIME     NOT NULL,
            parent_id   VARCHAR(64)  NULL,
            CONSTRAINT fk_pages_user
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_pages_parent
                FOREIGN KEY (parent_id)
                REFERENCES pages(id)
                ON DELETE CASCADE
        )
    `);

    // pages 테이블에 collection_id 컬럼 추가 (없을 경우만)
    await pool.execute(`
        ALTER TABLE pages
        ADD COLUMN IF NOT EXISTS collection_id VARCHAR(64) NULL
    `);

    // pages.collection_id 외래키 추가 (이미 있는 경우 무시)
    try {
        await pool.execute(`
            ALTER TABLE pages
            ADD CONSTRAINT fk_pages_collection
                FOREIGN KEY (collection_id)
                REFERENCES collections(id)
                ON DELETE CASCADE
        `);
    } catch (error) {
        // 이미 존재하는 경우 무시
        if (error && error.code !== "ER_DUP_KEY" && error.code !== "ER_CANNOT_ADD_FOREIGN") {
            console.warn("pages.collection_id FK 추가 중 경고:", error.message);
        }
    }

    // 보안 개선: is_encrypted 플래그 추가 (기본값 0 - 암호화 안 됨)
    try {
        await pool.execute(`
            ALTER TABLE pages ADD COLUMN is_encrypted TINYINT(1) NOT NULL DEFAULT 0
        `);
        console.log("pages 테이블에 is_encrypted 컬럼 추가 완료");
    } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') {
            console.warn("pages.is_encrypted 컬럼 추가 중 경고:", error.message);
        }
    }

    // 컬렉션이 없는 기존 사용자 데이터 마이그레이션
    await backfillCollections();
}

/**
 * 사용자별 기본 컬렉션을 생성하고, collection_id 가 비어있는 페이지에 할당
 */
async function backfillCollections() {
    const [users] = await pool.execute(`SELECT id, username FROM users`);

    for (const user of users) {
        const userId = user.id;

        // 사용자 컬렉션 존재 여부 확인
        const [existingCols] = await pool.execute(
            `SELECT id FROM collections WHERE user_id = ? ORDER BY sort_order ASC, updated_at DESC LIMIT 1`,
            [userId]
        );

        let collectionId = existingCols.length ? existingCols[0].id : null;

        // 없으면 기본 컬렉션 생성
        if (!collectionId) {
            const now = new Date();
            const nowStr = formatDateForDb(now);
            collectionId = generateCollectionId(now);

            await pool.execute(
                `
                INSERT INTO collections (id, user_id, name, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                `,
                [collectionId, userId, "기본 컬렉션", 0, nowStr, nowStr]
            );
        }

        // collection_id 가 비어있는 페이지에 기본 컬렉션 할당
        await pool.execute(
            `
            UPDATE pages
            SET collection_id = ?
            WHERE user_id = ? AND (collection_id IS NULL OR collection_id = '')
            `,
            [collectionId, userId]
        );
    }
}

/**
 * 사용자별 컬렉션 순서 구하기
 */
async function getNextCollectionSortOrder(userId) {
    const [rows] = await pool.execute(
        `SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM collections WHERE user_id = ?`,
        [userId]
    );
    return Number(rows[0].maxOrder) + 1;
}

/**
 * 새 컬렉션 생성
 */
async function createCollection({ userId, name }) {
    const now = new Date();
    const nowStr = formatDateForDb(now);
    const id = generateCollectionId(now);
    const sortOrder = await getNextCollectionSortOrder(userId);

    await pool.execute(
        `
        INSERT INTO collections (id, user_id, name, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [id, userId, name, sortOrder, nowStr, nowStr]
    );

    return {
        id,
        name,
        sortOrder,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
    };
}

/**
 * 레이트 리밋 설정
 */
// 일반 API 레이트 리밋 (창당 100 요청)
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1분
    max: 100, // 최대 100 요청
    message: { error: "너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해 주세요." },
    standardHeaders: true,
    legacyHeaders: false,
});

// 로그인/회원가입 레이트 리밋 (브루트포스 방지)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 5, // 최대 5번 시도
    message: { error: "너무 많은 로그인 시도가 발생했습니다. 15분 후 다시 시도해 주세요." },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // 성공한 요청은 카운트하지 않음
});

/**
 * 미들웨어 설정
 */
app.use(express.json());
app.use(cookieParser());

// 보안 개선: 기본 보안 헤더 추가 (CSP는 제외 - 개발 중 문제 발생 가능)
app.use((req, res, next) => {
    // 추가 보안 헤더
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    next();
});

// CSRF 토큰 쿠키 설정 미들웨어 (모든 요청에 대해)
app.use((req, res, next) => {
    // CSRF 쿠키가 없으면 생성
    if (!req.cookies[CSRF_COOKIE_NAME]) {
        const token = generateCsrfToken();
        res.cookie(CSRF_COOKIE_NAME, token, {
            httpOnly: false, // JavaScript에서 읽을 수 있어야 함
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
            maxAge: SESSION_TTL_MS
        });
    }
    next();
});

// CSRF 검증 미들웨어 (API 엔드포인트에만 적용)
app.use("/api", csrfMiddleware);

// 일반 API 레이트 리밋 적용
app.use("/api", generalLimiter);

app.use(express.static(path.join(__dirname, "public"), { index: false }));

/**
 * 로그인 / 메인 화면 라우팅
 */
app.get("/", (req, res) => {
    const session = getSessionFromRequest(req);

    if (!session) {
        return res.redirect("/login");
    }

    return res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 로그인 페이지
app.get("/login", (req, res) => {
    const session = getSessionFromRequest(req);

    if (session) {
        return res.redirect("/");
    }

    return res.sendFile(path.join(__dirname, "public", "login.html"));
});

// 회원가입 페이지
app.get("/register", (req, res) => {
    const session = getSessionFromRequest(req);

    // 이미 로그인 되어 있으면 메인으로
    if (session) {
        return res.redirect("/");
    }

    return res.sendFile(path.join(__dirname, "public", "register.html"));
});

// 앱 아이콘 제공
app.get("/icon.png", (req, res) => {
    return res.sendFile(path.join(__dirname, "icon.png"));
});

/**
 * 간단한 헬스 체크용
 * GET /api/debug/ping
 */
app.get("/api/debug/ping", (req, res) => {
    res.json({
        ok: true,
        time: new Date().toISOString()
    });
});

/**
 * 로그인
 * POST /api/auth/login
 * body: { username: string, password: string }
 */
app.post("/api/auth/login", authLimiter, async (req, res) => {
    const { username, password } = req.body || {};

    if (typeof username !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "아이디와 비밀번호를 모두 입력해 주세요." });
    }

    const trimmedUsername = username.trim();

    try {
        const [rows] = await pool.execute(
            `
            SELECT id, username, password_hash, encryption_salt
            FROM users
            WHERE username = ?
            `,
            [trimmedUsername]
        );

        if (!rows.length) {
            // 보안 개선: 로그에서 사용자명 제거 (정보 노출 방지)
            console.warn("로그인 실패 - 존재하지 않는 사용자 (IP: " + req.ip + ")");
            return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
        }

        const user = rows[0];

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            // 보안 개선: 로그에서 사용자명 제거 (정보 노출 방지)
            console.warn("로그인 실패 - 비밀번호 불일치 (IP: " + req.ip + ")");
            return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
        }

        const sessionId = createSession(user);

        res.cookie(SESSION_COOKIE_NAME, sessionId, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: SESSION_TTL_MS
        });

        // 보안 개선: 로그인 성공 시 CSRF 토큰 갱신
        const newCsrfToken = generateCsrfToken();
        res.cookie(CSRF_COOKIE_NAME, newCsrfToken, {
            httpOnly: false,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
            maxAge: SESSION_TTL_MS
        });

        res.json({
            ok: true,
            user: {
                id: user.id,
                username: user.username
            },
            encryptionSalt: user.encryption_salt
        });
    } catch (error) {
        console.error("POST /api/auth/login 오류:", error);
        res.status(500).json({ error: "로그인 처리 중 오류가 발생했습니다." });
    }
});

/**
 * 로그아웃
 * POST /api/auth/logout
 */
app.post("/api/auth/logout", (req, res) => {
    const session = getSessionFromRequest(req);
    if (session) {
        sessions.delete(session.id);
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
    });

    res.json({ ok: true });
});

/**
 * 회원가입
 * POST /api/auth/register
 * body: { username: string, password: string }
 */
app.post("/api/auth/register", authLimiter, async (req, res) => {
    const { username, password } = req.body || {};

    if (typeof username !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "아이디와 비밀번호를 모두 입력해 주세요." });
    }

    const trimmedUsername = username.trim();

    // 기본적인 유효성 검사
    if (trimmedUsername.length < 3 || trimmedUsername.length > 64) {
        return res.status(400).json({ error: "아이디는 3~64자 사이로 입력해 주세요." });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: "비밀번호는 6자 이상으로 입력해 주세요." });
    }

    try {
        // 아이디 중복 확인
        const [rows] = await pool.execute(
            `
            SELECT id
            FROM users
            WHERE username = ?
            `,
            [trimmedUsername]
        );

        if (rows.length > 0) {
            return res.status(409).json({ error: "이미 사용 중인 아이디입니다." });
        }

        const now = new Date();
        const nowStr = formatDateForDb(now);

        // 비밀번호 해시
        const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

        // 새 유저 생성
        const [result] = await pool.execute(
            `
            INSERT INTO users (username, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            `,
            [trimmedUsername, passwordHash, nowStr, nowStr]
        );

        const user = {
            id: result.insertId,
            username: trimmedUsername
        };

        // 새 사용자 기본 컬렉션 생성
        await createCollection({
            userId: user.id,
            name: "기본 컬렉션"
        });

        // 바로 로그인 상태로 만들어 주기 (세션 생성)
        const sessionId = createSession(user);

        res.cookie(SESSION_COOKIE_NAME, sessionId, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: SESSION_TTL_MS
        });

        // 보안 개선: 회원가입 성공 시 CSRF 토큰 갱신
        const newCsrfToken = generateCsrfToken();
        res.cookie(CSRF_COOKIE_NAME, newCsrfToken, {
            httpOnly: false,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
            maxAge: SESSION_TTL_MS
        });

        return res.status(201).json({
            ok: true,
            user: {
                id: user.id,
                username: user.username
            }
        });
    } catch (error) {
        console.error("POST /api/auth/register 오류:", error);
        return res.status(500).json({ error: "회원가입 처리 중 오류가 발생했습니다." });
    }
});

/**
 * 현재 로그인한 사용자 정보 확인
 * GET /api/auth/me
 */
app.get("/api/auth/me", authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, username, encryption_salt FROM users WHERE id = ?`,
            [req.user.id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
        }

        const user = rows[0];
        res.json({
            id: user.id,
            username: user.username,
            encryptionSalt: user.encryption_salt
        });
    } catch (error) {
        console.error("GET /api/auth/me 오류:", error);
        res.status(500).json({ error: "사용자 정보 조회 중 오류가 발생했습니다." });
    }
});

/**
 * 암호화 Salt 업데이트
 * PUT /api/auth/encryption-salt
 */
app.put("/api/auth/encryption-salt", authMiddleware, async (req, res) => {
    const { encryptionSalt } = req.body;

    if (typeof encryptionSalt !== "string" || !encryptionSalt) {
        return res.status(400).json({ error: "암호화 Salt가 필요합니다." });
    }

    try {
        await pool.execute(
            `UPDATE users SET encryption_salt = ? WHERE id = ?`,
            [encryptionSalt, req.user.id]
        );

        res.json({ ok: true });
    } catch (error) {
        console.error("PUT /api/auth/encryption-salt 오류:", error);
        res.status(500).json({ error: "암호화 Salt 업데이트 중 오류가 발생했습니다." });
    }
});

/**
 * 비밀번호 재확인 (보안 강화)
 * POST /api/auth/verify-password
 */
app.post("/api/auth/verify-password", authMiddleware, async (req, res) => {
    const { password } = req.body || {};

    if (typeof password !== "string") {
        return res.status(400).json({ error: "비밀번호를 입력해 주세요." });
    }

    try {
        const [rows] = await pool.execute(
            `SELECT id, username, password_hash, encryption_salt FROM users WHERE id = ?`,
            [req.user.id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
        }

        const user = rows[0];

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            console.warn("비밀번호 재확인 실패:", req.user.username);
            return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
        }

        res.json({
            ok: true,
            encryptionSalt: user.encryption_salt
        });
    } catch (error) {
        console.error("POST /api/auth/verify-password 오류:", error);
        res.status(500).json({ error: "비밀번호 확인 중 오류가 발생했습니다." });
    }
});

/**
 * 컬렉션 목록 조회
 * GET /api/collections
 */
app.get("/api/collections", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(
            `
            SELECT id, name, sort_order, created_at, updated_at
            FROM collections
            WHERE user_id = ?
            ORDER BY sort_order ASC, updated_at DESC
            `,
            [userId]
        );

        const list = rows.map((row) => ({
            id: row.id,
            name: row.name,
            sortOrder: row.sort_order,
            createdAt: toIsoString(row.created_at),
            updatedAt: toIsoString(row.updated_at)
        }));

        res.json(list);
    } catch (error) {
        console.error("GET /api/collections 오류:", error);
        res.status(500).json({ error: "컬렉션 목록을 불러오지 못했습니다." });
    }
});

/**
 * 새 컬렉션 생성
 * POST /api/collections
 * body: { name?: string }
 */
app.post("/api/collections", authMiddleware, async (req, res) => {
    const rawName = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const name = rawName !== "" ? rawName : "새 컬렉션";

    try {
        const userId = req.user.id;
        const collection = await createCollection({ userId, name });
        res.status(201).json(collection);
    } catch (error) {
        console.error("POST /api/collections 오류:", error);
        res.status(500).json({ error: "컬렉션을 생성하지 못했습니다." });
    }
});

/**
 * 컬렉션 삭제
 * DELETE /api/collections/:id
 */
app.delete("/api/collections/:id", authMiddleware, async (req, res) => {
    const id = req.params.id;
    const userId = req.user.id;

    try {
        const [rows] = await pool.execute(
            `
            SELECT id
            FROM collections
            WHERE id = ? AND user_id = ?
            `,
            [id, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ error: "컬렉션을 찾을 수 없습니다." });
        }

        // 컬렉션 삭제 (pages는 FK CASCADE)
        await pool.execute(
            `
            DELETE FROM collections
            WHERE id = ? AND user_id = ?
            `,
            [id, userId]
        );

        res.json({ ok: true, removedId: id });
    } catch (error) {
        console.error("DELETE /api/collections/:id 오류:", error);
        res.status(500).json({ error: "컬렉션 삭제에 실패했습니다." });
    }
});

/**
 * 페이지 목록 조회
 * GET /api/pages
 */
app.get("/api/pages", authMiddleware, async (req, res) => {
    try {
		const userId = req.user.id;
        const collectionId =
            typeof req.query.collectionId === "string" && req.query.collectionId.trim() !== ""
                ? req.query.collectionId.trim()
                : null;

        let query = `
            SELECT id, title, updated_at, parent_id, sort_order, collection_id, is_encrypted
            FROM pages
            WHERE user_id = ?
        `;
        const params = [userId];

        if (collectionId) {
            query += ` AND collection_id = ?`;
            params.push(collectionId);
        }

        query += `
            ORDER BY collection_id ASC, parent_id IS NULL DESC, sort_order ASC, updated_at DESC
        `;

        const [rows] = await pool.execute(query, params);

        const list = rows.map((row) => ({
            id: row.id,
            title: row.title || "제목 없음",
            updatedAt: toIsoString(row.updated_at),
            parentId: row.parent_id,
            sortOrder: row.sort_order,
            collectionId: row.collection_id,
            isEncrypted: row.is_encrypted ? true : false
        }));

        console.log("GET /api/pages 응답 개수:", list.length);

        res.json(list);
    } catch (error) {
        console.error("GET /api/pages 오류:", error);
        res.status(500).json({ error: "페이지 목록 불러오기 실패." });
    }
});

/**
 * 단일 페이지 조회
 * GET /api/pages/:id
 */
app.get("/api/pages/:id", authMiddleware, async (req, res) => {
    const id = req.params.id;
	const userId = req.user.id;

    try {
        const [rows] = await pool.execute(
            `
            SELECT id, title, content, created_at, updated_at, parent_id, sort_order, collection_id, is_encrypted
            FROM pages
            WHERE id = ? AND user_id = ?
            `,
            [id, userId]
        );

        if (!rows.length) {
            console.warn("GET /api/pages/:id - 페이지 없음:", id);
            return res.status(404).json({ error: "Page not found" });
        }

        const row = rows[0];

        const page = {
            id: row.id,
            title: row.title || "제목 없음",
            content: row.content || "<p></p>",
            createdAt: toIsoString(row.created_at),
            updatedAt: toIsoString(row.updated_at),
            parentId: row.parent_id,
            sortOrder: row.sort_order,
            collectionId: row.collection_id,
            isEncrypted: row.is_encrypted ? true : false
        };

        console.log("GET /api/pages/:id 응답:", id);

        res.json(page);
    } catch (error) {
        console.error("GET /api/pages/:id 오류:", error);
        res.status(500).json({ error: "페이지 불러오기 실패." });
    }
});

/**
 * 새 페이지 생성
 * POST /api/pages
 * body: { title?: string }
 */
app.post("/api/pages", authMiddleware, async (req, res) => {
    const rawTitle = typeof req.body.title === "string" ? req.body.title : "";
    const title = rawTitle.trim() !== "" ? rawTitle.trim() : "제목 없음";

    const now = new Date();
    const id = generatePageId(now);
    const nowStr = formatDateForDb(now);
    // 클라이언트에서 content를 전달하면 사용, 아니면 기본값
    const content = typeof req.body.content === "string" ? req.body.content : "<p></p>";
	const userId = req.user.id;

	// body에서 parentId / sortOrder 받기 (없으면 루트 + sort_order 0)
    const parentId =
        typeof req.body.parentId === "string" && req.body.parentId.trim() !== ""
            ? req.body.parentId.trim()
            : null;
    const sortOrder =
        typeof req.body.sortOrder === "number" && Number.isFinite(req.body.sortOrder)
            ? req.body.sortOrder
            : 0;
    const collectionId =
        typeof req.body.collectionId === "string" && req.body.collectionId.trim() !== ""
            ? req.body.collectionId.trim()
            : null;

    if (!collectionId) {
        return res.status(400).json({ error: "collectionId가 필요합니다." });
    }

    try {
        // 컬렉션 존재 여부 및 소유권 확인
        const [colRows] = await pool.execute(
            `
            SELECT id FROM collections
            WHERE id = ? AND user_id = ?
            `,
            [collectionId, userId]
        );

        if (!colRows.length) {
            return res.status(404).json({ error: "컬렉션을 찾을 수 없습니다." });
        }

        if (parentId) {
            const [parentRows] = await pool.execute(
                `
                SELECT id, collection_id FROM pages
                WHERE id = ? AND user_id = ?
                `,
                [parentId, userId]
            );

            if (!parentRows.length) {
                return res.status(400).json({ error: "부모 페이지를 찾을 수 없습니다." });
            }

            if (parentRows[0].collection_id !== collectionId) {
                return res.status(400).json({ error: "부모 페이지와 동일한 컬렉션이어야 합니다." });
            }
        }

        await pool.execute(
            `
            INSERT INTO pages (id, user_id, parent_id, title, content, sort_order, created_at, updated_at, collection_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [id, userId, parentId, title, content, sortOrder, nowStr, nowStr, collectionId]
        );

        const page = {
            id,
            title,
            content,
            parentId,
            sortOrder,
            collectionId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };

        console.log("POST /api/pages 생성:", id);

        res.status(201).json(page);
    } catch (error) {
        console.error("POST /api/pages 오류:", error);
        res.status(500).json({ error: "페이지 생성 실패." });
    }
});

/**
 * 페이지 수정
 * PUT /api/pages/:id
 * body: { title?: string, content?: string }
 */
app.put("/api/pages/:id", authMiddleware, async (req, res) => {
    const id = req.params.id;
	const userId = req.user.id;

    const titleFromBody = typeof req.body.title === "string" ? req.body.title.trim() : null;
    const contentFromBody = typeof req.body.content === "string" ? req.body.content : null;
    const isEncryptedFromBody = typeof req.body.isEncrypted === "boolean" ? req.body.isEncrypted : null;

    if (!titleFromBody && !contentFromBody && isEncryptedFromBody === null) {
        return res.status(400).json({ error: "수정할 데이터 없음." });
    }

    try {
        const [rows] = await pool.execute(
            `
            SELECT id, title, content, created_at, updated_at, parent_id, sort_order, collection_id, is_encrypted
            FROM pages
            WHERE id = ? AND user_id = ?
            `,
            [id, userId]
        );

        if (!rows.length) {
            console.warn("PUT /api/pages/:id - 페이지 없음:", id);
            return res.status(404).json({ error: "Page not found" });
        }

        const existing = rows[0];

        const newTitle = titleFromBody && titleFromBody !== "" ? titleFromBody : existing.title;
        const newContent = contentFromBody !== null ? contentFromBody : existing.content;
        const newIsEncrypted = isEncryptedFromBody !== null ? (isEncryptedFromBody ? 1 : 0) : existing.is_encrypted;
        const now = new Date();
        const nowStr = formatDateForDb(now);

        await pool.execute(
            `
            UPDATE pages
            SET title = ?, content = ?, is_encrypted = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            `,
            [newTitle, newContent, newIsEncrypted, nowStr, id, userId]
        );

        const page = {
            id,
            title: newTitle,
            content: newContent,
            parentId: existing.parent_id,
            sortOrder: existing.sort_order,
            collectionId: existing.collection_id,
            createdAt: toIsoString(existing.created_at),
            updatedAt: now.toISOString()
        };

        console.log("PUT /api/pages/:id 수정 완료:", id);

        res.json(page);
    } catch (error) {
        console.error("PUT /api/pages/:id 오류:", error);
        res.status(500).json({ error: "페이지 수정 실패." });
    }
});

/**
 * 페이지 삭제
 * DELETE /api/pages/:id
 */
app.delete("/api/pages/:id", authMiddleware, async (req, res) => {
    const id = req.params.id;
	const userId = req.user.id;

    try {
        const [rows] = await pool.execute(
            `
            SELECT id
            FROM pages
            WHERE id = ? AND user_id = ?
            `,
            [id, userId]
        );

        if (!rows.length) {
            console.warn("DELETE /api/pages/:id - 페이지 없음:", id);
            return res.status(404).json({ error: "Page not found" });
        }

        await pool.execute(
            `
            DELETE FROM pages
            WHERE id = ? AND user_id = ?
            `,
            [id, userId]
        );

        console.log("DELETE /api/pages/:id 삭제:", id);

        res.json({ ok: true, removedId: id });
    } catch (error) {
        console.error("DELETE /api/pages/:id 오류:", error);
        res.status(500).json({ error: "페이지 삭제 실패." });
    }
});

/**
 * 서버 시작
 */
(async () => {
    try {
        await initDb();
        app.listen(PORT, () => {
            console.log(`NTEOK 앱이 http://localhost:${PORT} 에서 실행 중.`);
        });
    } catch (error) {
        console.error("서버 시작 중 치명적 오류:", error);
        process.exit(1);
    }
})();