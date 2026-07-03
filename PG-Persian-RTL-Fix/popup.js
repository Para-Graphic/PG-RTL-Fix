/* ── Full list of domains we actually run on (mirrors manifest host_permissions) ── */
const SUPPORTED_DOMAINS = [
  "claude.ai","chatgpt.com","chat.openai.com","gemini.google.com",
  "notebooklm.google.com","copilot.microsoft.com","bing.com","you.com",
  "poe.com","character.ai","perplexity.ai","higgsfield.ai",
];

/* Friendly display names — only used for the "you're on X" banner text */
const SITE_NAMES = {
  "claude.ai":"Claude.ai","chatgpt.com":"ChatGPT","chat.openai.com":"ChatGPT",
  "gemini.google.com":"Gemini","notebooklm.google.com":"NotebookLM",
  "copilot.microsoft.com":"Microsoft Copilot",
  "perplexity.ai":"Perplexity AI","poe.com":"Poe.com",
  "higgsfield.ai":"Higgsfield",
};

const TXT = {
  onSite:      { fa:(n)=>`✓  الان روی ${n} هستید`, ar:(n)=>`✓  أنت الآن على ${n}`, en:(n)=>`✓  Currently on ${n}` },
  unsupported: { fa:"این سایت توسط افزونه پشتیبانی نمی‌شه", ar:"هذا الموقع غير مدعوم بواسطة الإضافة", en:"This site isn't supported by the extension" },
  needsRefresh:{ fa:"این صفحه قبل از نصب/آپدیت باز بوده — رفرشش کن", ar:"تم فتح هذه الصفحة قبل التثبيت — يرجى تحديثها", en:"This tab was open before install/update — refresh it" },
  refreshBtn:  { fa:"↻ رفرش این صفحه", ar:"↻ تحديث الصفحة", en:"↻ Refresh this page" },
};

const sw    = document.getElementById("mainSwitch");
const card  = document.getElementById("toggleCard");
const title = document.getElementById("toggleTitle");
const desc  = document.getElementById("toggleDesc");
const body  = document.body;
const banner = document.getElementById("site-banner");

let currentLang = "fa";
let siteState = "checking"; // "supported" | "needs-refresh" | "unsupported"
let currentTabId = null;
let detectedSiteName = null;

/* ── Language handling ─────────────────────────────────────────── */
function applyLang(lang) {
  currentLang = lang;
  chrome.storage.local.set({ pgRtlLang: lang });

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
  body.className = "lang-" + lang;

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
  document.querySelectorAll(`[data-${lang}]`).forEach(el => {
    el.textContent = el.getAttribute(`data-${lang}`);
  });

  updateToggleText(sw.checked);
  renderBanner();
}

function updateToggleText(enabled) {
  const suffix = enabled ? "-on" : "-off";
  title.textContent = title.getAttribute(`data-${currentLang}${suffix}`);
  desc.textContent  = desc.getAttribute(`data-${currentLang}${suffix}`);
}

document.querySelectorAll(".lang-btn").forEach(btn => {
  btn.addEventListener("click", () => applyLang(btn.dataset.lang));
});

/* ── View tabs (Extension / Contact) ──────────────────────────── */
document.querySelectorAll(".rail-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".rail-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.getElementById("viewMain").style.display    = view === "main"    ? "" : "none";
    document.getElementById("viewContact").style.display = view === "contact" ? "" : "none";
  });
});

/* ── Banner rendering — reflects current siteState + language ───── */
function renderBanner() {
  banner.innerHTML = "";
  banner.style.display = "block";

  if (siteState === "supported") {
    banner.style.color = "";
    banner.style.borderColor = "";
    banner.style.background = "";
    banner.className = "";
    banner.textContent = detectedSiteName ? TXT.onSite[currentLang](detectedSiteName) : "";
    if (!detectedSiteName) banner.style.display = "none";
    return;
  }

  if (siteState === "needs-refresh") {
    banner.style.color = "#ffd66b";
    banner.style.borderColor = "#ffd66b33";
    banner.style.background = "#ffd66b12";
    const span = document.createElement("div");
    span.textContent = TXT.needsRefresh[currentLang];
    banner.appendChild(span);

    const btn = document.createElement("button");
    btn.textContent = TXT.refreshBtn[currentLang];
    btn.style.cssText = "margin-top:8px;width:100%;padding:6px 0;border-radius:6px;border:1px solid #ffd66b55;background:#ffd66b1c;color:#ffd66b;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;";
    btn.addEventListener("click", () => {
      if (currentTabId != null) chrome.tabs.reload(currentTabId);
      window.close();
    });
    banner.appendChild(btn);
    return;
  }

  // unsupported
  banner.style.color = "#ff9f6b";
  banner.style.borderColor = "#ff9f6b33";
  banner.style.background = "#ff9f6b12";
  banner.textContent = TXT.unsupported[currentLang];
}

function lockControls(locked) {
  sw.disabled = locked;
  card.style.opacity = locked ? "0.45" : "1";
  card.style.cursor = locked ? "default" : "pointer";
  const scanBtn = document.getElementById("scanBtn");
  scanBtn.disabled = locked;
  scanBtn.style.opacity = locked ? "0.45" : "1";
  scanBtn.style.cursor = locked ? "default" : "pointer";
}

/* ── Tab helpers ────────────────────────────────────────────────── */
function getCurrentTab(cb) {
  chrome.tabs.query({ active:true, currentWindow:true }, tabs => {
    if (tabs[0]) cb(tabs[0]);
  });
}

function isDomainSupported(hostname) {
  return SUPPORTED_DOMAINS.some(d => hostname.includes(d));
}

function sendToTab(msg, cb) {
  if (currentTabId == null) { if (cb) cb(null); return; }
  chrome.tabs.sendMessage(currentTabId, msg, response => {
    if (chrome.runtime.lastError) { if (cb) cb(null); return; } // avoid console noise
    if (cb) cb(response);
  });
}

/* ── Toggle UI sync ─────────────────────────────────────────────── */
function setUI(enabled) {
  sw.checked = enabled;
  card.className = "toggle-card " + (enabled ? "on" : "off");
  updateToggleText(enabled);
}

function toggle() {
  if (siteState !== "supported") return;
  const newVal = !sw.checked;
  setUI(newVal);
  sendToTab({ action:"setEnabled", value:newVal });
}
sw.addEventListener("change", () => {
  if (siteState !== "supported") return;
  setUI(sw.checked);
  sendToTab({ action:"setEnabled", value:sw.checked });
});
card.addEventListener("click", toggle);

// Prevent clicks on the switch itself from bubbling up to the card
// (the card has its own click->toggle handler above; without this,
// clicking the switch would double-fire the toggle).
// Moved from an inline onclick="" attribute — Manifest V3's CSP
// (script-src 'self') blocks inline event handlers entirely.
document.getElementById("swLabel").addEventListener("click", e => e.stopPropagation());

/* ── Scan All ───────────────────────────────────────────────────── */
document.getElementById("scanBtn").addEventListener("click", () => {
  if (siteState !== "supported") return;
  sendToTab({ action:"scanAll" }, () => {
    const fb = document.getElementById("scan-fb");
    fb.classList.add("show");
    setTimeout(() => fb.classList.remove("show"), 2200);
  });
});

/* ── Brand link ─────────────────────────────────────────────────── */
document.getElementById("siteLink").addEventListener("click", e => {
  e.preventDefault();
  chrome.tabs.create({ url:"https://para-graphic.ir" });
});

/* ── Version tag — always reflects the real manifest, never hardcoded ── */
document.getElementById("verTag").textContent = "v" + chrome.runtime.getManifest().version;

/* ── Init sequence ─────────────────────────────────────────────────
   1. Determine current tab + hostname
   2. Classify: supported-domain vs not
   3. If supported-domain, try to reach the content script (getEnabled)
      — if it answers, we're fully connected
      — if it times out / errors, the tab was open before install → needs refresh
   ──────────────────────────────────────────────────────────────── */
chrome.storage.local.get(["pgRtlLang"], (res) => {
  currentLang = res.pgRtlLang || "fa";
});

getCurrentTab(tab => {
  currentTabId = tab.id;
  let hostname = "";
  try { hostname = new URL(tab.url).hostname; } catch(_) {}

  if (!isDomainSupported(hostname)) {
    siteState = "unsupported";
    lockControls(true);
    applyLang(currentLang);
    return;
  }

  for (const [domain, name] of Object.entries(SITE_NAMES)) {
    if (hostname.includes(domain)) { detectedSiteName = name; break; }
  }

  chrome.tabs.sendMessage(tab.id, { action:"getEnabled" }, response => {
    if (chrome.runtime.lastError || !response) {
      siteState = "needs-refresh";
      lockControls(true);
    } else {
      siteState = "supported";
      lockControls(false);
      setUI(response.enabled);
    }
    applyLang(currentLang);
  });
});
