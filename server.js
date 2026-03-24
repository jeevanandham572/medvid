const path = require("path");
const express = require("express");
const session = require("express-session");
const morgan = require("morgan");
const { createClient, AuthType } = require("webdav");

const app = express();
const PORT = process.env.PORT || 3000;
const AUTO_LOGIN = {
  enabled: true,
  serverUrl: process.env.WEBDAV_URL || "https://dav.mypikpak.com",
  username: process.env.WEBDAV_USERNAME || "vuhv",
  password: process.env.WEBDAV_PASSWORD || "vfjhqcwf",
  basePath: process.env.WEBDAV_BASE_PATH || "/"
};
const PUBLIC_MODE = true;
const PUBLIC_ALLOWED_FOLDERS = ["/Prepladder RR 6.0 Videos and Notes"];

app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

function createDavClientFromSession(req) {
  const creds = req.session.webdav;
  if (!creds) {
    return null;
  }

  return createClient(creds.serverUrl, {
    username: creds.username,
    password: creds.password,
    authType: AuthType.Password,
    headers: {
      Depth: "1"
    }
  });
}

async function tryAutoLogin(req) {
  if (!AUTO_LOGIN.enabled || req.session.webdav) {
    return false;
  }

  try {
    const client = createClient(AUTO_LOGIN.serverUrl, {
      username: AUTO_LOGIN.username,
      password: AUTO_LOGIN.password,
      authType: AuthType.Password
    });

    const targetPath = normalizePath(AUTO_LOGIN.basePath, "/");
    await client.getDirectoryContents(targetPath);

    req.session.webdav = {
      serverUrl: AUTO_LOGIN.serverUrl,
      username: AUTO_LOGIN.username,
      password: AUTO_LOGIN.password,
      basePath: AUTO_LOGIN.basePath
    };
    return true;
  } catch {
    return false;
  }
}

async function requireLogin(req, res, next) {
  if (req.session.webdav) {
    return next();
  }

  const ok = await tryAutoLogin(req);
  if (ok) {
    return next();
  }

  return res.status(401).json({ error: "Not authenticated. Please log in." });
}

function normalizeBasePath(basePath) {
  const sanitizedBase = basePath && basePath.trim() !== "" ? basePath : "/";
  const safeBase = sanitizedBase.startsWith("/") ? sanitizedBase : `/${sanitizedBase}`;
  const normalized = path.posix.normalize(safeBase);
  return normalized.endsWith("/") && normalized !== "/" ? normalized.slice(0, -1) : normalized;
}

function normalizePath(basePath, inputPath = "") {
  const normalizedBase = normalizeBasePath(basePath);

  if (!inputPath || inputPath === "/") {
    return normalizedBase;
  }

  const normalizedInput = path.posix.normalize(inputPath.startsWith("/") ? inputPath : `/${inputPath}`);
  const joined = path.posix.normalize(path.posix.join(normalizedBase, normalizedInput));

  const isInBase =
    normalizedBase === "/" || joined === normalizedBase || joined.startsWith(`${normalizedBase}/`);

  if (!isInBase) {
    throw new Error("Path escapes basePath");
  }

  return joined;
}

function normalizeRelativePath(inputPath = "/") {
  const normalized = path.posix.normalize(inputPath.startsWith("/") ? inputPath : `/${inputPath}`);
  return normalized.endsWith("/") && normalized !== "/" ? normalized.slice(0, -1) : normalized;
}

function isAllowedRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === "/") {
    return true;
  }

  if (PUBLIC_ALLOWED_FOLDERS.length === 0) {
    return true;
  }

  return PUBLIC_ALLOWED_FOLDERS.some(
    (folder) => normalized === folder || normalized.startsWith(`${folder}/`)
  );
}

app.post("/api/login", async (req, res) => {
  if (PUBLIC_MODE) {
    return res.status(403).json({ error: "Manual login is disabled in public mode." });
  }

  const { serverUrl, username, password, basePath } = req.body;

  if (!serverUrl || !username || !password) {
    return res.status(400).json({ error: "serverUrl, username, and password are required." });
  }

  const cleanedBasePath = basePath && basePath.trim() !== "" ? basePath.trim() : "/";

  try {
    const client = createClient(serverUrl, {
      username,
      password,
      authType: AuthType.Password
    });

    const targetPath = normalizePath(cleanedBasePath, "/");
    await client.getDirectoryContents(targetPath);

    req.session.webdav = {
      serverUrl,
      username,
      password,
      basePath: cleanedBasePath
    };

    return res.json({ ok: true, basePath: cleanedBasePath });
  } catch (error) {
    return res.status(401).json({ error: "Login failed. Check credentials and WebDAV URL." });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/session", async (req, res) => {
  if (!req.session.webdav) {
    await tryAutoLogin(req);
  }

  if (!req.session.webdav) {
    return res.json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    username: req.session.webdav.username,
    serverUrl: req.session.webdav.serverUrl,
    basePath: req.session.webdav.basePath,
    publicMode: PUBLIC_MODE,
    allowedFolders: PUBLIC_ALLOWED_FOLDERS
  });
});

app.get("/api/list", requireLogin, async (req, res) => {
  const client = createDavClientFromSession(req);
  const creds = req.session.webdav;

  try {
    const relativePath = normalizeRelativePath(req.query.path || "/");
    if (!isAllowedRelativePath(relativePath)) {
      return res.status(403).json({ error: "Access denied for this path." });
    }

    const fullPath = normalizePath(creds.basePath, relativePath);
    const entries = await client.getDirectoryContents(fullPath);

    const normalizedEntries = entries
      .map((entry) => {
        const rel = path.posix.relative(creds.basePath, entry.filename);
        const relPath = rel === "" ? "/" : `/${rel}`;

        return {
          basename: entry.basename,
          filename: entry.filename,
          path: relPath,
          type: entry.type,
          size: entry.size || 0,
          lastmod: entry.lastmod || ""
        };
      })
      .filter((entry) => isAllowedRelativePath(entry.path))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.basename.localeCompare(b.basename);
      });

    return res.json({
      currentPath: relativePath,
      fullPath,
      entries: normalizedEntries
    });
  } catch (error) {
    return res.status(500).json({ error: "Unable to fetch directory contents." });
  }
});

app.get("/api/download", requireLogin, async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: "path query parameter is required." });
  }

  const client = createDavClientFromSession(req);
  const creds = req.session.webdav;

  try {
    const relativePath = normalizeRelativePath(filePath);
    if (!isAllowedRelativePath(relativePath)) {
      return res.status(403).json({ error: "Access denied for this file." });
    }

    const fullPath = normalizePath(creds.basePath, relativePath);
    const stat = await client.stat(fullPath);
    if (stat.type !== "file") {
      return res.status(400).json({ error: "Selected path is not a file." });
    }

    const fileName = path.posix.basename(fullPath);
    const stream = client.createReadStream(fullPath);

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to read remote file stream." });
      } else {
        res.end();
      }
    });

    stream.pipe(res);
  } catch (error) {
    return res.status(500).json({ error: "Unable to download file." });
  }
});

app.listen(PORT, () => {
  console.log(`WebDAV explorer running at http://localhost:${PORT}`);
});
