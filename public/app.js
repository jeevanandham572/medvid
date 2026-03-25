const authCard = document.getElementById("auth-card");
const explorerCard = document.getElementById("explorer-card");
const loginForm = document.getElementById("login-form");
const authMessage = document.getElementById("auth-message");
const explorerMessage = document.getElementById("explorer-message");
const currentPathEl = document.getElementById("current-path");
const breadcrumbEl = document.getElementById("breadcrumb");
const entryGrid = document.getElementById("entry-grid");
const logoutBtn = document.getElementById("logout-btn");
const navForm = document.getElementById("nav-form");
const navBackBtn = document.getElementById("nav-back");
const navForwardBtn = document.getElementById("nav-forward");
const navUpBtn = document.getElementById("nav-up");
const navHomeBtn = document.getElementById("nav-home");
const navPathInput = document.getElementById("nav-path-input");
const collectionTitle = document.getElementById("collection-title");
const collectionMeta = document.getElementById("collection-meta");
const detailName = document.getElementById("detail-name");
const detailType = document.getElementById("detail-type");
const detailSize = document.getElementById("detail-size");
const detailModified = document.getElementById("detail-modified");
const detailPath = document.getElementById("detail-path");
const detailWatch = document.getElementById("detail-watch");
const loadingScreen = document.getElementById("loading-screen");

let currentPath = "/";
let publicMode = false;
let navHistory = ["/"];
let navIndex = 0;
let currentEntries = [];
let selectedPath = null;

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

function setAuthState(isAuthenticated) {
  authCard.classList.toggle("hidden", isAuthenticated || publicMode);
  explorerCard.classList.toggle("hidden", !isAuthenticated);
  logoutBtn.classList.toggle("hidden", publicMode);
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

function updateDetails(entry) {
  if (!entry) {
    detailName.textContent = "No item selected";
    detailType.textContent = "-";
    detailSize.textContent = "-";
    detailModified.textContent = "-";
    detailPath.textContent = "-";
    detailWatch.classList.add("hidden");
    detailWatch.removeAttribute("href");
    return;
  }

  detailName.textContent = entry.basename;
  detailType.textContent = entry.type;
  detailSize.textContent = entry.type === "file" ? formatBytes(entry.size) : "-";
  detailModified.textContent = entry.lastmod || "-";
  detailPath.textContent = entry.path;

  if (entry.type === "file") {
    detailWatch.href = `/watch.html?path=${encodeURIComponent(entry.path)}`;
    detailWatch.classList.remove("hidden");
  } else {
    detailWatch.classList.add("hidden");
    detailWatch.removeAttribute("href");
  }
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
    sep.style.color = "#64748b";
    breadcrumbEl.appendChild(sep);

    running += `/${segment}`;

    const segBtn = document.createElement("button");
    segBtn.className = "link-btn";
    segBtn.textContent = segment;
    segBtn.addEventListener("click", () => loadDirectory(running));
    breadcrumbEl.appendChild(segBtn);
  });
}

function getCollectionName(pathValue) {
  if (!pathValue || pathValue === "/") {
    return "Library";
  }
  const parts = pathValue.split("/").filter(Boolean);
  return parts[parts.length - 1] || "Library";
}

function selectEntry(entryPath) {
  selectedPath = entryPath;
  const selected = currentEntries.find((entry) => entry.path === entryPath) || null;
  updateDetails(selected);

  document.querySelectorAll(".entry-card").forEach((card) => {
    const isSelected = card.dataset.path === entryPath;
    card.classList.toggle("selected", isSelected);
  });
}

function createEntryCard(entry) {
  const card = document.createElement("article");
  card.className = "entry-card";
  card.dataset.path = entry.path;

  const icon = document.createElement("div");
  icon.className = "entry-icon";
  icon.textContent = entry.type === "directory" ? "📁" : "🎬";
  card.appendChild(icon);

  const nameWrap = document.createElement("div");
  if (entry.type === "directory") {
    const btn = document.createElement("button");
    btn.className = "entry-name-btn";
    btn.textContent = entry.basename;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      loadDirectory(entry.path);
    });
    nameWrap.appendChild(btn);
  } else {
    const p = document.createElement("p");
    p.className = "entry-name";
    p.textContent = entry.basename;
    nameWrap.appendChild(p);
  }
  card.appendChild(nameWrap);

  const meta = document.createElement("p");
  meta.className = "entry-meta";
  meta.textContent = entry.type === "file"
    ? `${formatBytes(entry.size)} • ${entry.lastmod || "-"}`
    : `${entry.lastmod || "Folder"}`;
  card.appendChild(meta);

  if (entry.type === "file") {
    const watch = document.createElement("a");
    watch.className = "action-watch";
    watch.href = `/watch.html?path=${encodeURIComponent(entry.path)}`;
    watch.target = "_blank";
    watch.rel = "noopener";
    watch.textContent = "Watch Video";
    card.appendChild(watch);
  }

  card.addEventListener("click", () => selectEntry(entry.path));
  return card;
}

function renderEntries(entries, pathValue) {
  entryGrid.innerHTML = "";
  currentEntries = entries;

  if (pathValue !== "/") {
    const upEntry = {
      basename: "..",
      path: getParentPath(pathValue),
      type: "directory",
      size: 0,
      lastmod: "Parent folder"
    };
    const upCard = createEntryCard(upEntry);
    upCard.querySelector(".entry-icon").textContent = "↩";
    const upBtn = upCard.querySelector(".entry-name-btn");
    if (upBtn) {
      upBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        loadDirectory(upEntry.path);
      });
    }
    upCard.addEventListener("click", () => loadDirectory(upEntry.path));
    entryGrid.appendChild(upCard);
  }

  entries.forEach((entry) => {
    entryGrid.appendChild(createEntryCard(entry));
  });

  const fileCount = entries.filter((entry) => entry.type === "file").length;
  const folderCount = entries.filter((entry) => entry.type === "directory").length;
  collectionTitle.textContent = getCollectionName(pathValue);
  collectionMeta.textContent = `${entries.length} items • ${folderCount} folders • ${fileCount} files`;

  if (entries.length > 0) {
    selectEntry(entries[0].path);
  } else {
    selectedPath = null;
    updateDetails(null);
  }
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
    headers: { "Content-Type": "application/json" },
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
  currentPath = "/";
  navHistory = ["/"];
  navIndex = 0;
  entryGrid.innerHTML = "";
  breadcrumbEl.innerHTML = "";
  currentPathEl.textContent = "/";
  collectionTitle.textContent = "Library";
  collectionMeta.textContent = "0 items";
  updateDetails(null);
  updateNavControls();
});

navBackBtn.addEventListener("click", async () => {
  if (navIndex <= 0) return;
  const previousIndex = navIndex - 1;
  const ok = await loadDirectory(navHistory[previousIndex], { recordHistory: false });
  if (ok) {
    navIndex = previousIndex;
    updateNavControls();
  }
});

navForwardBtn.addEventListener("click", async () => {
  if (navIndex >= navHistory.length - 1) return;
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
      updateDetails(null);
      return;
    }
    setAuthState(false);
    updateNavControls();
    updateDetails(null);
    return;
  }

  setAuthState(true);
  navHistory = ["/"];
  navIndex = 0;
  await loadDirectory("/");
}

restoreSession();

setTimeout(() => {
  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
  }
}, 3000);
