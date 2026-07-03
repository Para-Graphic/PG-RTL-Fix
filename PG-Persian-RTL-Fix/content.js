/**
 * PG Persian RTL Fix v4.1 — ParaGraphic / Nader Ahangarzadeh
 * FIX: Only touch TEXT-LEVEL elements (p, li, h1-h6, blockquote, td, th, dt, dd, span)
 * NEVER touch layout/container elements (div, section, header, footer, aside, article)
 * This prevents sidebar, toolbar, and page structure from breaking.
 */
(function () {
  "use strict";

  const RTL_RE    = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const THRESHOLD = 0.12;
  const DISABLED_CLASS = "pg-rtl-disabled";

  // Tags we SKIP entirely (never enter)
  const SKIP_TAGS = new Set([
    "CODE","PRE","SCRIPT","STYLE","NOSCRIPT","IFRAME",
    "KBD","SAMP","VAR","MATH","SVG","CANVAS","INPUT","SELECT",
  ]);

  // ONLY these tags get dir=rtl — purely text-content elements
  // DIV / SECTION / HEADER / FOOTER / ASIDE / ARTICLE → intentionally excluded
  const TEXT_TAGS = new Set([
    "P","LI","H1","H2","H3","H4","H5","H6",
    "BLOCKQUOTE","TD","TH","DT","DD","SPAN","LABEL","FIGCAPTION",
  ]);

  // ── State ────────────────────────────────────────────────────────────────
  let enabled = true;

  function applyEnabledState() {
    document.documentElement.classList.toggle(DISABLED_CLASS, !enabled);
  }

  function setEnabled(val) {
    enabled = val;
    chrome.storage.local.set({ pgRtlEnabled: val });
    applyEnabledState();
    if (enabled) scanAll();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function rtlRatio(text) {
    const s = text.replace(/\s/g, "");
    if (!s.length) return 0;
    let n = 0;
    for (const c of s) if (RTL_RE.test(c)) n++;
    return n / s.length;
  }

  function inSkipTree(el) {
    return !!el.closest(
      "pre,code,script,style,[class*='hljs'],[class*='prism'],[class*='katex'],.math"
    );
  }

  // ── Fix ONE element (only TEXT_TAGS) ────────────────────────────────────
  function fix(el) {
    if (!el || el.nodeType !== 1) return;
    if (!TEXT_TAGS.has(el.tagName)) return;   // ← key guard: skip divs/sections
    if (SKIP_TAGS.has(el.tagName)) return;
    if (inSkipTree(el)) return;

    const text = el.innerText || el.textContent || "";
    if (!RTL_RE.test(text)) return;
    if (rtlRatio(text) < THRESHOLD) return;

    if (el.getAttribute("dir") !== "rtl") {
      el.setAttribute("dir", "rtl");
      el.classList.add("pg-rtl");
    }
  }

  // ── Walk body with TreeWalker — only TEXT_TAGS ───────────────────────────
  function scanAll() {
    if (!enabled) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          // Don't descend into skip tags
          if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
          if (inSkipTree(node))            return NodeFilter.FILTER_REJECT;
          // Only accept text-level elements for fixing
          if (TEXT_TAGS.has(node.tagName)) return NodeFilter.FILTER_ACCEPT;
          // Descend into containers but don't fix them
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    const els = [];
    let cur = walker.nextNode();
    while (cur) { els.push(cur); cur = walker.nextNode(); }

    // Bottom-up: fix deepest elements first
    for (let i = els.length - 1; i >= 0; i--) fix(els[i]);

    attachInputs();
  }

  // ── Inputs live RTL ──────────────────────────────────────────────────────
  function handleInput(el) {
    if (!enabled) {
      el.removeAttribute("dir");
      el.style.textAlign = "";
      return;
    }
    const t = el.value || el.innerText || el.textContent || "";
    const rtl = rtlRatio(t) >= THRESHOLD;
    el.setAttribute("dir", rtl ? "rtl" : "ltr");
    el.style.textAlign = rtl ? "right" : "left";
  }

  function attachInputs() {
    [
      '[contenteditable="true"]', 'textarea',
      '#prompt-textarea', 'rich-textarea',
    ].forEach(s => {
      try {
        document.querySelectorAll(s).forEach(inp => {
          if (inp.dataset.pgRtl) return;
          inp.dataset.pgRtl = "1";
          const h = () => handleInput(inp);
          inp.addEventListener("input", h);
          inp.addEventListener("keyup", h);
          inp.addEventListener("paste", () => setTimeout(h, 15));
          h();
        });
      } catch(_) {}
    });
  }

  // ── MutationObserver ─────────────────────────────────────────────────────
  let _t = null;
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.addedNodes.length || m.type === "characterData") {
        clearTimeout(_t);
        _t = setTimeout(scanAll, 100);
        return;
      }
    }
  }).observe(document.body, { childList:true, subtree:true, characterData:true });

  // ── SPA nav ──────────────────────────────────────────────────────────────
  let _url = location.href;
  setInterval(() => {
    if (location.href !== _url) {
      _url = location.href;
      setTimeout(scanAll, 700);
      setTimeout(scanAll, 2000);
    }
  }, 500);

  // ── Messages from popup ──────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "scanAll")    { scanAll(); sendResponse({ ok: true }); }
    if (msg.action === "setEnabled") { setEnabled(msg.value); sendResponse({ ok: true }); }
    if (msg.action === "getEnabled") { sendResponse({ enabled }); }
  });

  // ── Boot — WAIT for stored preference before scanning anything ────────────
  // This fixes the bug where a page refresh briefly re-enabled RTL even
  // though the user had disabled it: previously scanAll() ran immediately
  // using the default `enabled = true`, before storage had a chance to load.
  chrome.storage.local.get("pgRtlEnabled", (res) => {
    enabled = res.pgRtlEnabled !== false;
    applyEnabledState();
    if (enabled) {
      scanAll();
      setTimeout(scanAll, 800);
      setTimeout(scanAll, 2500);
    }
  });

})();
