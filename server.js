require("dotenv").config();

const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const mysql = require("mysql2/promise");
const Parser = require("rss-parser");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || "dev-secret-change-me";
const AI_PROVIDER = String(process.env.AI_PROVIDER || "openai").toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const dbConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE || "church_prichod",
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
};

let pool;

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const h = String(req.headers.authorization || "");
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}

async function getAuthUser(req) {
  if (!pool) return null;
  const token = getBearerToken(req);
  const payload = verifyToken(token);
  if (!payload || !payload.userId) return null;
  const [rows] = await pool.execute(
    "SELECT id, name, email, phone, news_subscribe FROM users WHERE id = ? LIMIT 1",
    [payload.userId]
  );
  return rows[0] || null;
}

function getAdminSession(req) {
  const token = getBearerToken(req);
  const payload = verifyToken(token);
  if (!payload || payload.role !== "admin") return null;
  return payload;
}

async function ensureDatabaseExists() {
  const conn = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await conn.end();
  }
}

async function initDatabase() {
  await ensureDatabaseExists();
  pool = mysql.createPool(dbConfig);
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(128) NOT NULL,
        phone VARCHAR(64) NULL,
        news_subscribe TINYINT(1) NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS donations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(255) NULL,
        email VARCHAR(255) NULL,
        amount DECIMAL(12, 2) NOT NULL,
        purpose VARCHAR(255) NOT NULL,
        message TEXT NULL,
        is_anonymous TINYINT(1) NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        names TEXT NOT NULL,
        note_type VARCHAR(64) NOT NULL DEFAULT 'о здравии',
        temple VARCHAR(255) NULL,
        served_for VARCHAR(64) NULL,
        contact VARCHAR(255) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [donationUserCol] = await conn.query("SHOW COLUMNS FROM donations LIKE 'user_id'");
    if (!donationUserCol.length) {
      await conn.query("ALTER TABLE donations ADD COLUMN user_id INT UNSIGNED NULL AFTER id");
    }
    const [notesUserCol] = await conn.query("SHOW COLUMNS FROM notes LIKE 'user_id'");
    if (!notesUserCol.length) {
      await conn.query("ALTER TABLE notes ADD COLUMN user_id INT UNSIGNED NULL AFTER id");
    }
    const [notesStatusCol] = await conn.query("SHOW COLUMNS FROM notes LIKE 'status'");
    if (!notesStatusCol.length) {
      await conn.query(
        "ALTER TABLE notes ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'new' AFTER contact"
      );
    }
    await conn.query(`
      CREATE TABLE IF NOT EXISTS local_news (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        author VARCHAR(255) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS chatbot_messages (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_id INT UNSIGNED NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'local',
        ip VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } finally {
    conn.release();
  }
}

const BOT_KNOWLEDGE = [
  {
    keywords: ["молитв", "как молиться", "утренн", "вечерн"],
    answer:
      "Начните с краткой молитвы своими словами и одной из известных молитв (например, «Отче наш»). Важно не количество слов, а внимательность, покаяние и благодарность Богу.",
    references: ["Мф. 6:9-13", "1 Фес. 5:17"],
  },
  {
    keywords: ["пост", "великий пост", "зачем пост"],
    answer:
      "Пост в христианской традиции — это не только ограничение в пище, но и работа над сердцем: молитва, милосердие, борьба со страстями и примирение с ближними.",
    references: ["Мф. 6:16-18", "Ис. 58:6-7"],
  },
  {
    keywords: ["покаян", "исповед", "грех"],
    answer:
      "Покаяние — это изменение ума и жизни, не только сожаление. В Таинстве Исповеди человек открывает грехи Богу в присутствии священника и получает разрешительную молитву.",
    references: ["1 Ин. 1:9", "Лк. 15:11-32"],
  },
  {
    keywords: ["причаст", "евхарист", "таинство"],
    answer:
      "Причастие — центральное Таинство Церкви. К нему обычно готовятся молитвой, покаянием, постом и примирением с людьми. Конкретная практика уточняется у священника прихода.",
    references: ["Ин. 6:53-56", "1 Кор. 11:23-29"],
  },
  {
    keywords: ["любовь", "ближн", "прощ"],
    answer:
      "Христианская жизнь строится на любви к Богу и ближнему. Прощение — это не оправдание зла, а освобождение сердца от ненависти и доверие Божьему суду.",
    references: ["Мф. 22:37-39", "Мф. 6:14-15", "1 Кор. 13:4-7"],
  },
];

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isReligiousQuestion(questionNorm) {
  const keys = [
    "бог", "господ", "христ", "иисус", "библи", "евангел", "церк", "православ", "молит",
    "пост", "грех", "покаян", "исповед", "причаст", "таинств", "священ", "свят", "религи",
  ];
  return keys.some((k) => questionNorm.includes(k));
}

function localReligiousAnswer(question) {
  const q = normalizeText(question);
  for (const item of BOT_KNOWLEDGE) {
    if (item.keywords.some((k) => q.includes(normalizeText(k)))) {
      return { answer: item.answer, references: item.references, source: "local" };
    }
  }
  if (!isReligiousQuestion(q)) {
    return {
      answer:
        "Могу помочь с вопросами о вере, Библии, молитве и церковной жизни. Если хотите, задай вопрос свободно своими словами — отвечу проще и подробнее.",
      references: [],
      source: "local",
    };
  }
  return {
    answer:
      "Это хороший вопрос. Если хотите, уточните контекст (например: молитва, пост, покаяние, Евангелие), и я дам более точный ответ с цитатами из Библии.",
    references: [],
    source: "local",
  };
}

function sanitizeChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: String(m.content || "").slice(0, 900),
    }))
    .filter((m) => m.content.trim().length > 0);
}

const SITE_KNOWLEDGE_PAGES = [
  { file: "index.html", title: "Главная" },
  { file: "history.html", title: "История храма" },
  { file: "schedule.html", title: "Расписание" },
  { file: "announcements.html", title: "Объявления" },
  { file: "contacts.html", title: "Контакты" },
  { file: "departments.html", title: "Отделы" },
  { file: "clergy.html", title: "Духовенство" },
  { file: "donate.html", title: "Пожертвования" },
  { file: "notes.html", title: "Записки" },
  { file: "news.html", title: "Новости" },
];
let siteKnowledgeCache = [];

function stripHtmlText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function buildSiteKnowledge() {
  const out = [];
  for (const item of SITE_KNOWLEDGE_PAGES) {
    try {
      const fullPath = path.join(__dirname, "public", item.file);
      const html = await fs.readFile(fullPath, "utf8");
      const text = stripHtmlText(html).slice(0, 4000);
      if (!text) continue;
      out.push({
        page: item.title,
        file: item.file,
        normalized: normalizeText(text),
        text,
      });
    } catch {
      // Ignore optional pages.
    }
  }
  siteKnowledgeCache = out;
}

function isSiteQuestion(questionNorm) {
  const keys = [
    "сайт", "приход", "храм", "страниц", "контакт", "расписан", "служб",
    "новост", "объявлен", "пожертв", "записк", "духовенств", "адрес", "телефон",
  ];
  return keys.some((k) => questionNorm.includes(k));
}

function getSiteContextForQuestion(question) {
  const q = normalizeText(question);
  if (!q) return "";
  const words = q.split(" ").filter((w) => w.length >= 4);
  const ranked = siteKnowledgeCache
    .map((entry) => {
      let score = 0;
      for (const w of words) if (entry.normalized.includes(w)) score += 1;
      return { ...entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!ranked.length) return "";
  return ranked
    .map((entry) => `Страница "${entry.page}" (${entry.file}): ${entry.text.slice(0, 700)}`)
    .join("\n\n");
}

function isAllowedQuestion(question) {
  const q = normalizeText(question);
  return isReligiousQuestion(q) || isSiteQuestion(q);
}

async function askOpenAI(question, history, siteContext) {
  if (!OPENAI_API_KEY) return null;
  const prior = sanitizeChatHistory(history);
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "Ты православный AI-помощник сайта прихода. Отвечай только по двум темам: 1) религия/вера/Библия/церковная жизнь; 2) информация сайта прихода из переданного контекста. Если вопрос не из этих тем, вежливо откажи и предложи задать религиозный вопрос или вопрос о сайте. Не выдумывай факты.",
        },
        ...(siteContext
          ? [{ role: "system", content: `Контекст сайта прихода (используй только его для ответов о сайте):\n${siteContext}` }]
          : []),
        ...prior,
        { role: "user", content: String(question || "").slice(0, 1000) },
      ],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("openai chat error:", response.status, errText.slice(0, 500));
    return null;
  }
  const data = await response.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || "").trim()
    : "";
  if (!text) return null;
  return { answer: text, references: [], source: "openai" };
}

async function askDeepSeek(question, history, siteContext) {
  if (!DEEPSEEK_API_KEY) return null;
  const prior = sanitizeChatHistory(history);
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "Ты православный AI-помощник сайта прихода. Отвечай только по двум темам: 1) религия/вера/Библия/церковная жизнь; 2) информация сайта прихода из переданного контекста. Если вопрос не из этих тем, вежливо откажи и предложи задать религиозный вопрос или вопрос о сайте. Не выдумывай факты.",
        },
        ...(siteContext
          ? [{ role: "system", content: `Контекст сайта прихода (используй только его для ответов о сайте):\n${siteContext}` }]
          : []),
        ...prior,
        { role: "user", content: String(question || "").slice(0, 1000) },
      ],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("deepseek chat error:", response.status, errText.slice(0, 500));
    return null;
  }
  const data = await response.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || "").trim()
    : "";
  if (!text) return null;
  return { answer: text, references: [], source: "deepseek" };
}

async function askAI(question, history, siteContext) {
  if (AI_PROVIDER === "deepseek") return askDeepSeek(question, history, siteContext);
  return askOpenAI(question, history, siteContext);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const rss = new Parser({
  timeout: 8000,
  headers: {
    "User-Agent": "PrichodSite/1.0 (educational)",
  },
});

const NEWS_FEEDS = [
  {
    id: "patriarchia",
    title: "Патриархия.ru",
    kind: "rss",
    // Старый /rss.xml отдаёт HTML (Next.js). Актуальный XML-экспорт — через API.
    url: "https://api.patriarchia.ru/v1/rss/news",
  },
  {
    id: "vob_eparhia",
    title: "Воронежская епархия (vob-eparhia.ru)",
    kind: "vob",
    listUrl: "https://www.vob-eparhia.ru/m/set.php?gr=20020",
  },
];

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchVobEparhiaItems(listUrl, limit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(listUrl, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "PrichodSite/1.0 (church-site)",
        Accept: "text/html,*/*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const re =
      /href="doc\.php\?d=(\d+)"[^>]*>\s*<strong>([^<]+)<\/strong><\/a><br\s*\/?>\s*([^<]+)/gi;
    const seen = new Set();
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const vobId = parseInt(id, 10);
      out.push({
        sourceId: "vob_eparhia",
        sourceTitle: "Воронежская епархия (vob-eparhia.ru)",
        title: decodeHtmlEntities(m[2]).trim() || "Новость",
        link: `https://www.vob-eparhia.ru/m/doc.php?d=${id}`,
        date: null,
        excerpt: decodeHtmlEntities(m[3]).trim().slice(0, 280),
        vobId,
      });
      if (out.length >= limit) break;
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

function newsSortScore(it) {
  const t = new Date(it.date || 0).getTime();
  if (!Number.isNaN(t) && t > 0) return t;
  if (typeof it.vobId === "number" && !Number.isNaN(it.vobId)) return it.vobId * 86400000;
  return 0;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "prichod-api", db: "mysql" });
});

app.post("/api/chatbot/ask", async (req, res) => {
  const question = String((req.body || {}).question || "").trim();
  const history = (req.body || {}).history;
  if (!question) return res.status(400).json({ error: "Введите вопрос." });
  if (question.length > 1200) return res.status(400).json({ error: "Слишком длинный вопрос." });
  try {
    let result;
    if (!isAllowedQuestion(question)) {
      result = {
        answer:
          "Я отвечаю только на вопросы о религии и о материалах этого сайта прихода. Задайте, пожалуйста, вопрос в этих темах.",
        references: [],
        source: "guardrail",
      };
    } else {
      const siteContext = getSiteContextForQuestion(question);
      result = await askAI(question, history, siteContext);
      if (!result) result = localReligiousAnswer(question);
    }
    if (pool) {
      const user = await getAuthUser(req);
      await pool.execute(
        `INSERT INTO chatbot_messages (user_id, question, answer, source, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          user ? user.id : null,
          question,
          result.answer,
          result.source || "local",
          String(req.ip || "").slice(0, 64) || null,
          String(req.headers["user-agent"] || "").slice(0, 255) || null,
        ]
      );
    }
    res.json({
      ok: true,
      answer: result.answer,
      references: result.references || [],
      source: result.source || "local",
    });
  } catch (e) {
    console.error("chatbot error:", e.message);
    const fallback = localReligiousAnswer(question);
    res.json({
      ok: true,
      answer: fallback.answer,
      references: fallback.references || [],
      source: "fallback",
    });
  }
});

app.post("/api/auth/register", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "База данных временно недоступна." });
  const name = String((req.body || {}).name || "").trim();
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const password = String((req.body || {}).password || "");
  const phone = String((req.body || {}).phone || "").trim() || null;
  if (!name || !email || password.length < 6) {
    return res.status(400).json({ error: "Заполните имя, email и пароль (минимум 6 символов)." });
  }
  try {
    const [exists] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (exists.length) return res.status(409).json({ error: "Пользователь с таким email уже существует." });
    const [result] = await pool.execute(
      "INSERT INTO users (name, email, password_hash, phone) VALUES (?, ?, ?, ?)",
      [name, email, hashPassword(password), phone]
    );
    const token = signToken({ userId: result.insertId, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    res.json({ token, name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка регистрации." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "База данных временно недоступна." });
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const password = String((req.body || {}).password || "");
  if (!email || !password) return res.status(400).json({ error: "Укажите email и пароль." });
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, password_hash FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    const user = rows[0];
    if (!user || user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: "Неверный email или пароль." });
    }
    const token = signToken({ userId: user.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    res.json({ token, name: user.name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка входа." });
  }
});

app.post("/api/auth/admin-login", async (req, res) => {
  const login = String((req.body || {}).login || "").trim();
  const password = String((req.body || {}).password || "");
  const envLogin = String(process.env.ADMIN_LOGIN || "").trim();
  const envPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!login || !password) {
    return res.status(400).json({ error: "Укажите логин и пароль администратора." });
  }
  if (!envLogin || !envPassword) {
    return res.status(500).json({ error: "ADMIN_LOGIN / ADMIN_PASSWORD не заданы в .env." });
  }
  if (login !== envLogin || password !== envPassword) {
    return res.status(401).json({ error: "Неверный логин или пароль администратора." });
  }
  const token = signToken({ role: "admin", login: envLogin, exp: Date.now() + 1000 * 60 * 60 * 12 });
  res.json({ ok: true, token });
});

app.get("/api/account/profile", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Требуется авторизация." });
    res.json(user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка загрузки профиля." });
  }
});

app.put("/api/account/profile", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Требуется авторизация." });
    const name = String((req.body || {}).name || "").trim();
    const phone = String((req.body || {}).phone || "").trim() || null;
    const newsSubscribe = (req.body || {}).news_subscribe ? 1 : 0;
    if (!name) return res.status(400).json({ error: "Имя не может быть пустым." });
    await pool.execute(
      "UPDATE users SET name = ?, phone = ?, news_subscribe = ? WHERE id = ?",
      [name, phone, newsSubscribe, user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка сохранения профиля." });
  }
});

app.get("/api/account/notes", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Требуется авторизация." });
    const [rows] = await pool.execute(
      "SELECT id, created_at, names, note_type, served_for, status FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
      [user.id]
    );
    res.json({ items: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка загрузки записок." });
  }
});

app.get("/api/account/donations", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Требуется авторизация." });
    const [rows] = await pool.execute(
      "SELECT id, created_at, amount, purpose, message FROM donations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
      [user.id]
    );
    res.json({ items: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка загрузки пожертвований." });
  }
});

app.get("/api/admin/stats", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  if (!pool) return res.status(503).json({ error: "База данных временно недоступна." });
  try {
    const [[notes]] = await pool.query("SELECT COUNT(*) AS c FROM notes");
    const [[notesNew]] = await pool.query("SELECT COUNT(*) AS c FROM notes WHERE status = 'new'");
    const [[donations]] = await pool.query("SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM donations");
    const [[users]] = await pool.query("SELECT COUNT(*) AS c FROM users");
    res.json({
      notesCount: notes.c,
      notesNew: notesNew.c,
      donationsCount: donations.c,
      donationsSum: Number(donations.s || 0),
      usersCount: users.c,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка загрузки статистики." });
  }
});

app.get("/api/admin/notes", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const status = String(req.query.status || "").trim();
    const where = status ? "WHERE n.status = ?" : "";
    const params = status ? [status] : [];
    const [[totalRow]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM notes n ${where}`,
      params
    );
    const [items] = await pool.execute(
      `SELECT n.id, n.created_at, n.names, n.note_type, n.served_for, n.contact, n.status, u.name AS user_name
       FROM notes n
       LEFT JOIN users u ON u.id = n.user_id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json({ items, page, total: totalRow.c, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка загрузки записок." });
  }
});

app.patch("/api/admin/notes/:id", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  const id = parseInt(req.params.id, 10);
  const status = String((req.body || {}).status || "").trim();
  if (!id || !["new", "processing", "done"].includes(status)) {
    return res.status(400).json({ error: "Некорректный id или статус." });
  }
  try {
    await pool.execute("UPDATE notes SET status = ? WHERE id = ?", [status, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка обновления статуса." });
  }
});

app.delete("/api/admin/notes/:id", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Некорректный id." });
  try {
    await pool.execute("DELETE FROM notes WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка удаления записки." });
  }
});

app.get("/api/admin/donations", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const [[totalRow]] = await pool.query("SELECT COUNT(*) AS c FROM donations");
    const [items] = await pool.query(
      `SELECT d.id, d.created_at, d.name, d.email, d.amount, d.purpose, d.message, d.is_anonymous, u.name AS user_name
       FROM donations d
       LEFT JOIN users u ON u.id = d.user_id
       ORDER BY d.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`
    );
    res.json({ items, page, total: totalRow.c, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка загрузки пожертвований." });
  }
});

app.get("/api/admin/users", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  try {
    const [items] = await pool.query(
      "SELECT id, created_at, name, email, phone, news_subscribe FROM users ORDER BY created_at DESC"
    );
    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка загрузки пользователей." });
  }
});

app.delete("/api/admin/users/:id", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Некорректный id." });
  try {
    await pool.execute("UPDATE notes SET user_id = NULL WHERE user_id = ?", [id]);
    await pool.execute("UPDATE donations SET user_id = NULL WHERE user_id = ?", [id]);
    await pool.execute("DELETE FROM users WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка удаления пользователя." });
  }
});

app.get("/api/admin/local-news", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  try {
    const [items] = await pool.query(
      "SELECT id, created_at, title, body, author FROM local_news ORDER BY created_at DESC LIMIT 100"
    );
    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка загрузки новостей." });
  }
});

app.post("/api/admin/local-news", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  const title = String((req.body || {}).title || "").trim();
  const body = String((req.body || {}).body || "").trim();
  const author = String((req.body || {}).author || "").trim() || null;
  if (!title || !body) return res.status(400).json({ error: "Заполните заголовок и текст новости." });
  try {
    const [result] = await pool.execute(
      "INSERT INTO local_news (title, body, author) VALUES (?, ?, ?)",
      [title, body, author]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка сохранения новости." });
  }
});

app.delete("/api/admin/local-news/:id", async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: "Требуется вход администратора." });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Некорректный id." });
  try {
    await pool.execute("DELETE FROM local_news WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка удаления новости." });
  }
});

app.post("/api/donations", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "База данных временно недоступна." });
  }
  const { name, email, amount, purpose, message, isAnonymous } = req.body || {};
  const amt = parseFloat(String(amount).replace(",", "."));
  if (!purpose || Number.isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: "Укажите сумму и назначение пожертвования." });
  }
  try {
    const user = await getAuthUser(req);
    const [result] = await pool.execute(
      `INSERT INTO donations (user_id, name, email, amount, purpose, message, is_anonymous)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user ? user.id : null,
        isAnonymous ? null : (name || "").trim() || null,
        (email || "").trim() || null,
        amt,
        String(purpose).trim(),
        (message || "").trim() || null,
        isAnonymous ? 1 : 0,
      ]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка сохранения в базу данных." });
  }
});

app.post("/api/notes", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "База данных временно недоступна." });
  }
  const { names, noteType, temple, servedFor, contact } = req.body || {};
  const list = String(names || "").trim();
  if (!list || list.length < 2) {
    return res.status(400).json({ error: "Укажите имена для записки." });
  }
  try {
    const user = await getAuthUser(req);
    const [result] = await pool.execute(
      `INSERT INTO notes (user_id, names, note_type, temple, served_for, contact, status)
       VALUES (?, ?, ?, ?, ?, ?, 'new')`,
      [
        user ? user.id : null,
        list,
        String(noteType || "о здравии").trim(),
        String(temple || "").trim() || null,
        String(servedFor || "").trim() || null,
        String(contact || "").trim() || null,
      ]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка сохранения в базу данных." });
  }
});

app.get("/api/news", async (req, res) => {
  const source = String(req.query.source || "all");
  const feeds =
    source === "all"
      ? NEWS_FEEDS
      : NEWS_FEEDS.filter((f) => f.id === source || (source === "voronezh" && f.id === "vob_eparhia"));
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 12));

  const results = [];
  for (const feed of feeds) {
    try {
      if (feed.kind === "vob") {
        const items = await fetchVobEparhiaItems(feed.listUrl, limit);
        results.push(...items);
        continue;
      }
      const parsed = await rss.parseURL(feed.url);
      const items = (parsed.items || []).slice(0, limit).map((it) => ({
        sourceId: feed.id,
        sourceTitle: feed.title,
        title: it.title || "Без заголовка",
        link: it.link || it.guid || "#",
        date: it.pubDate || it.isoDate || null,
        excerpt: (it.contentSnippet || "").slice(0, 280),
      }));
      results.push(...items);
    } catch (e) {
      console.warn("News feed error", feed.id, e.message);
    }
  }

  results.sort((a, b) => newsSortScore(b) - newsSortScore(a));
  const cleaned = results.slice(0, limit).map((it) => {
    const { vobId, ...rest } = it;
    return rest;
  });
  res.json({ items: cleaned });
});

app.get("/api/stats", async (_req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "База данных временно недоступна." });
  }
  try {
    const [[d]] = await pool.query("SELECT COUNT(*) AS c FROM donations");
    const [[n]] = await pool.query("SELECT COUNT(*) AS c FROM notes");
    res.json({
      donationsCount: d.c,
      notesCount: n.c,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка чтения статистики." });
  }
});

async function start() {
  try {
    await buildSiteKnowledge();
  } catch (e) {
    console.warn("Site knowledge build warning:", e.message);
  }

  try {
    await initDatabase();
  } catch (e) {
    console.error("MySQL: не удалось подключиться или создать таблицы.");
    console.error("Проверьте, что MySQL запущен.");
    console.error(`Пример создания базы: CREATE DATABASE \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.error("Проверьте файл .env: MYSQL_USER, MYSQL_PASSWORD (как в phpMyAdmin).");
    if (String(e.message || "").toLowerCase().includes("access denied")) {
      console.error("Подсказка: Access denied — неверный логин или пароль в .env для MySQL.");
    }
    console.error("Детали:", e.message);
    pool = null; // чтобы сайт и новости работали даже без БД
  }

  app.listen(PORT, () => {
    console.log(`Сайт прихода: http://localhost:${PORT}`);
    if (pool) console.log(`MySQL: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    else console.log("MySQL: недоступна (некоторые формы будут возвращать 503).");
  });
}

start();
