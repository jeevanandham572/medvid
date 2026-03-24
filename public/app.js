const authCard = document.getElementById("auth-card");
const explorerCard = document.getElementById("explorer-card");
const loginForm = document.getElementById("login-form");
const authMessage = document.getElementById("auth-message");
const explorerMessage = document.getElementById("explorer-message");
const currentPathEl = document.getElementById("current-path");
const breadcrumbEl = document.getElementById("breadcrumb");
const fileList = document.getElementById("file-list");
const mobileFileList = document.getElementById("mobile-file-list");
const logoutBtn = document.getElementById("logout-btn");
const navForm = document.getElementById("nav-form");
const navBackBtn = document.getElementById("nav-back");
const navForwardBtn = document.getElementById("nav-forward");
const navUpBtn = document.getElementById("nav-up");
const navHomeBtn = document.getElementById("nav-home");
const navPathInput = document.getElementById("nav-path-input");

let currentPath = "/";
let publicMode = false;
let navHistory = ["/"];
let navIndex = 0;

function formatBytes(bytes) {
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value > 10 ? 0 : 1)} ${units[i]}`;
}

function setAuthState(isAuthenticated) {
  authCard.classList.toggle("hidden", isAuthenticated || publicMode);
  explorerCard.classList.toggle("hidden", !isAuthenticated);
  logoutBtn.classList.toggle("hidden", publicMode);
}

function normalizeClientPath(pathValue = "/") {
  const withSlash = pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
  const cleaned = withSlash.replace(/\/{2,}/g, "/");
  if (cleaned.length > 1 && cleaned.endsWith("/")) {
    return cleaned.slice(0, -1);
  }
  return cleaned || "/";
}

function getParentPath(pathValue) {
  if (!pathValue || pathValue === "/") {
    return "/";
  }
  return pathValue.split("/").slice(0, -1).join("/") || "/";
}

function pushHistory(pathValue) {
  if (navHistory[navIndex] === pathValue) {
    return;
  }
  navHistory = navHistory.slice(0, navIndex + 1);
  navHistory.push(pathValue);
  navIndex = navHistory.length - 1;
}

function updateNavControls() {
  navBackBtn.disabled = navIndex <= 0;
  navForwardBtn.disabled = navIndex >= navHistory.length - 1;
  navUpBtn.disabled = currentPath === "/";
  navHomeBtn.disabled = currentPath === "/";
  navPathInput.value = currentPath;
}

function createCell(label, value) {
  const td = document.createElement("td");
  td.dataset.label = label;
  if (value instanceof Node) {
    td.appendChild(value);
  } else {
    td.textContent = value;
  }
  return td;
}

function buildBreadcrumb(pathValue) {
  breadcrumbEl.innerHTML = "";

  const rootBtn = document.createElement("button");
  rootBtn.className = "link-btn";
  rootBtn.textContent = "/";
  rootBtn.addEventListener("click", () => loadDirectory("/"));
  breadcrumbEl.appendChild(rootBtn);

  if (pathValue === "/") {
    return;
  }

  const segments = pathValue.split("/").filter(Boolean);
  let running = "";

  segments.forEach((segment) => {
    const sep = document.createElement("span");
    sep.textContent = "/";
    breadcrumbEl.appendChild(sep);

    running += `/${segment}`;

    const segBtn = document.createElement("button");
    segBtn.className = "link-btn";
    segBtn.textContent = segment;
    segBtn.addEventListener("click", () => loadDirectory(running));
    breadcrumbEl.appendChild(segBtn);
  });
}

function buildNameContent(entry) {
  if (entry.type === "directory") {
    const btn = document.createElement("button");
    btn.className = "link-btn";
    btn.textContent = `${entry.basename}/`;
    btn.addEventListener("click", () => loadDirectory(entry.path));
    return btn;
  }
  return document.createTextNode(entry.basename);
}

function buildMobileNameContent(entry) {
  if (entry.type === "directory") {
    const btn = document.createElement("button");
    btn.className = "link-btn mobile-name";
    btn.textContent = `${entry.basename}/`;
    btn.addEventListener("click", () => loadDirectory(entry.path));
    return btn;
  }

  const span = document.createElement("span");
  span.className = "mobile-name";
  span.textContent = entry.basename;
  return span;
}

function createMobileItem({ nameNode, type, sizeText, dateText, actionNode }) {
  const item = document.createElement("article");
  item.className = "mobile-item";

  const top = document.createElement("div");
  top.className = "mobile-item-top";
  top.appendChild(nameNode);
  if (actionNode) {
    top.appendChild(actionNode);
  }
  item.appendChild(top);

  const meta = document.createElement("div");
  meta.className = "mobile-meta";

  const typePill = document.createElement("span");
  typePill.className = "mobile-pill";
  typePill.textContent = type;
  meta.appendChild(typePill);

  const sizePill = document.createElement("span");
  sizePill.className = "mobile-pill";
  sizePill.textContent = sizeText;
  meta.appendChild(sizePill);

  item.appendChild(meta);

  const date = document.createElement("p");
  date.className = "mobile-date";
  date.textContent = dateText || "-";
  item.appendChild(date);

  return item;
}

function renderMobileEntries(entries, pathValue) {
  mobileFileList.innerHTML = "";

  if (pathValue !== "/") {
    const upBtn = document.createElement("button");
    upBtn.className = "link-btn mobile-name";
    upBtn.textContent = "../";
    upBtn.addEventListener("click", () => loadDirectory(getParentPath(pathValue)));

    mobileFileList.appendChild(
      createMobileItem({
        nameNode: upBtn,
        type: "directory",
        sizeText: "-",
        dateText: "-",
        actionNode: null
      })
    );
  }

  entries.forEach((entry) => {
    let actionNode = null;
    if (entry.type === "file") {
      const dl = document.createElement("a");
      dl.className = "mobile-action";
      dl.href = `/api/download?path=${encodeURIComponent(entry.path)}`;
      dl.textContent = "Download";
      actionNode = dl;
    }

    mobileFileList.appendChild(
      createMobileItem({
        nameNode: buildMobileNameContent(entry),
        type: entry.type,
        sizeText: entry.type === "file" ? formatBytes(entry.size) : "-",
        dateText: entry.lastmod || "-",
        actionNode
      })
    );
  });
}

function renderEntries(entries, pathValue) {
  fileList.innerHTML = "";

  if (pathValue !== "/") {
    const row = document.createElement("tr");
    const upBtn = document.createElement("button");
    upBtn.className = "link-btn";
    upBtn.textContent = "..";

    const parentPath = pathValue.split("/").slice(0, -1).join("/") || "/";
    upBtn.addEventListener("click", () => loadDirectory(parentPath));

    row.appendChild(createCell("Name", upBtn));
    row.appendChild(createCell("Type", "directory"));
    row.appendChild(createCell("Size", "-"));
    row.appendChild(createCell("Last Modified", "-"));
    row.appendChild(createCell("Action", "-"));

    fileList.appendChild(row);
  }

  entries.forEach((entry) => {
    const row = document.createElement("tr");

    row.appendChild(createCell("Name", buildNameContent(entry)));
    row.appendChild(createCell("Type", entry.type));
    row.appendChild(createCell("Size", entry.type === "file" ? formatBytes(entry.size) : "-"));
    row.appendChild(createCell("Last Modified", entry.lastmod || "-"));

    if (entry.type === "file") {
      const dl = document.createElement("a");
      dl.href = `/api/download?path=${encodeURIComponent(entry.path)}`;
      dl.textContent = "Download";
      row.appendChild(createCell("Action", dl));
    } else {
      row.appendChild(createCell("Action", "-"));
    }

    fileList.appendChild(row);
  });

  renderMobileEntries(entries, pathValue);
}

async function loadDirectory(pathValue = "/", options = {}) {
  const { recordHistory = true } = options;
  explorerMessage.textContent = "";
  const targetPath = normalizeClientPath(pathValue);
  const response = await fetch(`/api/list?path=${encodeURIComponent(targetPath)}`);

  if (response.status === 401) {
    setAuthState(false);
    authMessage.textContent = "Session expired. Please log in again.";
    return false;
  }

  const payload = await response.json();
  if (!response.ok) {
    explorerMessage.textContent = payload.error || "Failed to load directory.";
    return false;
  }

  currentPath = normalizeClientPath(payload.currentPath || targetPath);
  if (recordHistory) {
    pushHistory(currentPath);
  }
  currentPathEl.textContent = currentPath;
  buildBreadcrumb(currentPath);
  renderEntries(payload.entries, currentPath);
  updateNavControls();
  return true;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";

  const formData = new FormData(loginForm);
  const body = Object.fromEntries(formData.entries());

  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();

  if (!response.ok) {
    authMessage.textContent = payload.error || "Unable to login.";
    return;
  }

  setAuthState(true);
  await loadDirectory("/");
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  setAuthState(false);
  loginForm.reset();
  fileList.innerHTML = "";
  currentPath = "/";
  navHistory = ["/"];
  navIndex = 0;
  currentPathEl.textContent = currentPath;
  breadcrumbEl.innerHTML = "";
  explorerMessage.textContent = "";
  updateNavControls();
});

navBackBtn.addEventListener("click", async () => {
  if (navIndex <= 0) {
    return;
  }
  const previousIndex = navIndex - 1;
  const ok = await loadDirectory(navHistory[previousIndex], { recordHistory: false });
  if (ok) {
    navIndex = previousIndex;
    updateNavControls();
  }
});

navForwardBtn.addEventListener("click", async () => {
  if (navIndex >= navHistory.length - 1) {
    return;
  }
  const nextIndex = navIndex + 1;
  const ok = await loadDirectory(navHistory[nextIndex], { recordHistory: false });
  if (ok) {
    navIndex = nextIndex;
    updateNavControls();
  }
});

navUpBtn.addEventListener("click", async () => {
  await loadDirectory(getParentPath(currentPath));
});

navHomeBtn.addEventListener("click", async () => {
  await loadDirectory("/");
});

navForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const enteredPath = normalizeClientPath(navPathInput.value.trim() || "/");
  await loadDirectory(enteredPath);
});

async function restoreSession() {
  const response = await fetch("/api/session");
  const payload = await response.json();
  publicMode = payload.publicMode === true;

  if (!payload.authenticated) {
    if (publicMode) {
      setAuthState(true);
      explorerMessage.textContent = "Unable to auto-connect to WebDAV right now.";
      updateNavControls();
      return;
    }
    setAuthState(false);
    updateNavControls();
    return;
  }

  setAuthState(true);
  navHistory = ["/"];
  navIndex = 0;
  await loadDirectory("/");
}

restoreSession();
