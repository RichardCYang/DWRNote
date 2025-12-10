const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * DB 연결 설정 정보
 */
const DB_CONFIG = {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "admin",
    database: process.env.DB_NAME || "dwrnote",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

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
 * ISO string 기반 페이지 ID 생성
 */
function generatePageId(now) {
    const iso = now.toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(36).slice(2, 8);
    return "page-" + iso + "-" + rand;
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
 * DB 초기화: 커넥션 풀 생성 + 테이블/기본 페이지 보장
 */
async function initDb() {
    pool = await mysql.createPool(DB_CONFIG);

    console.log("DB 커넥션 풀 생성 완료.");

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS pages (
            id          VARCHAR(64)  NOT NULL PRIMARY KEY,
            title       VARCHAR(255) NOT NULL,
            content     MEDIUMTEXT   NOT NULL,
            created_at  DATETIME     NOT NULL,
            updated_at  DATETIME     NOT NULL
        )
    `);

    console.log("pages 테이블 확인/생성 완료.");

    const [rows] = await pool.execute("SELECT COUNT(*) AS cnt FROM pages");
    const count = rows[0].cnt;
    console.log("현재 pages 개수:", count);

    if (count === 0) {
        const now = new Date();
        const id = generatePageId(now);
        const title = "첫 페이지";
        const content = "<p>여기는 첫 페이지 입니다.</p>";

        await pool.execute(
            `
            INSERT INTO pages (id, title, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                id,
                title,
                content,
                formatDateForDb(now),
                formatDateForDb(now)
            ]
        );

        console.log("기본 페이지 생성 완료. id:", id);
    }
}

/**
 * 미들웨어 설정
 */
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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
 * 페이지 목록 조회
 * GET /api/pages
 */
app.get("/api/pages", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `
            SELECT id, title, updated_at
            FROM pages
            ORDER BY updated_at DESC
            `
        );

        const list = rows.map((row) => ({
            id: row.id,
            title: row.title || "제목 없음",
            updatedAt: toIsoString(row.updated_at)
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
app.get("/api/pages/:id", async (req, res) => {
    const id = req.params.id;

    try {
        const [rows] = await pool.execute(
            `
            SELECT id, title, content, created_at, updated_at
            FROM pages
            WHERE id = ?
            `,
            [id]
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
            updatedAt: toIsoString(row.updated_at)
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
app.post("/api/pages", async (req, res) => {
    const rawTitle = typeof req.body.title === "string" ? req.body.title : "";
    const title = rawTitle.trim() !== "" ? rawTitle.trim() : "제목 없음";

    const now = new Date();
    const id = generatePageId(now);
    const nowStr = formatDateForDb(now);
    const content = "<p></p>";

    try {
        await pool.execute(
            `
            INSERT INTO pages (id, title, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            `,
            [id, title, content, nowStr, nowStr]
        );

        const page = {
            id,
            title,
            content,
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
app.put("/api/pages/:id", async (req, res) => {
    const id = req.params.id;

    const titleFromBody = typeof req.body.title === "string" ? req.body.title.trim() : null;
    const contentFromBody = typeof req.body.content === "string" ? req.body.content : null;

    if (!titleFromBody && !contentFromBody) {
        return res.status(400).json({ error: "수정할 데이터 없음." });
    }

    try {
        const [rows] = await pool.execute(
            `
            SELECT id, title, content, created_at, updated_at
            FROM pages
            WHERE id = ?
            `,
            [id]
        );

        if (!rows.length) {
            console.warn("PUT /api/pages/:id - 페이지 없음:", id);
            return res.status(404).json({ error: "Page not found" });
        }

        const existing = rows[0];

        const newTitle = titleFromBody && titleFromBody !== "" ? titleFromBody : existing.title;
        const newContent = contentFromBody !== null ? contentFromBody : existing.content;
        const now = new Date();
        const nowStr = formatDateForDb(now);

        await pool.execute(
            `
            UPDATE pages
            SET title = ?, content = ?, updated_at = ?
            WHERE id = ?
            `,
            [newTitle, newContent, nowStr, id]
        );

        const page = {
            id,
            title: newTitle,
            content: newContent,
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
app.delete("/api/pages/:id", async (req, res) => {
    const id = req.params.id;

    try {
        const [rows] = await pool.execute(
            `
            SELECT id
            FROM pages
            WHERE id = ?
            `,
            [id]
        );

        if (!rows.length) {
            console.warn("DELETE /api/pages/:id - 페이지 없음:", id);
            return res.status(404).json({ error: "Page not found" });
        }

        await pool.execute(
            `
            DELETE FROM pages
            WHERE id = ?
            `,
            [id]
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
            console.log(`DWRNote 앱이 http://localhost:${PORT} 에서 실행 중.`);
        });
    } catch (error) {
        console.error("서버 시작 중 치명적 오류:", error);
        process.exit(1);
    }
})();