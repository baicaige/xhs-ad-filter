// ==UserScript==
// @name         XHS Ad Filter
// @namespace    https://github.com/baicaige/xhs-ad-filter
// @version      0.1.0
// @description  Detect and collect suspected Xiaohongshu ad comments for review.
// @match        https://www.xiaohongshu.com/*
// @match        https://*.xiaohongshu.com/*
// @grant        GM_xmlhttpRequest
// @connect      baicaige.github.io
// ==/UserScript==

(function () {
  "use strict";

  const BASE_URL = "https://baicaige.github.io/xhs-ad-filter";
  const STORAGE_KEY = "pending_ads";
  const SEEN_ATTR = "data-xhs-ad-filter-seen";
  const COMMENT_SELECTORS = [
    ".comment-item",
    ".comment-item-wrapper",
    "[data-testid='comment-item']",
    "div[class*='comment-item']",
    "div[class*='CommentItem']"
  ];
  const POST_SELECTORS = [
    "section.note-item",
    "div.note-item",
    "div[class*='note-item']",
    "section[class*='note-item']",
    "div[class*='feed-item']",
    "section[class*='feed-item']"
  ];
  const DEFAULT_RULES = {
    keywords: ["复制口令", "启动小红书", "脱单群", "搭子群", "交流群"],
    postKeywords: [],
    regex: ["CA\\d{2,8}"]
  };
  const state = {
    rules: DEFAULT_RULES,
    authors: { authors: [] },
    notes: { notes: [] },
    blocked: 0
  };

  function requestJson(url) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          onload: (res) => {
            try { resolve(JSON.parse(res.responseText)); } catch { resolve(null); }
          },
          onerror: () => resolve(null)
        });
        return;
      }
      fetch(url).then((res) => res.json()).then(resolve).catch(() => resolve(null));
    });
  }

  async function loadRules() {
    const [rules, authors, notes] = await Promise.all([
      requestJson(`${BASE_URL}/rules.json`),
      requestJson(`${BASE_URL}/authors.json`),
      requestJson(`${BASE_URL}/notes.json`)
    ]);
    state.rules = rules || DEFAULT_RULES;
    state.authors = authors || { authors: [] };
    state.notes = notes || { notes: [] };
    scan();
  }

  function getPending() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function savePending(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 500)));
  }

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function extractNoteId() {
    const match = location.href.match(/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : "";
  }

  function extractKeywords(text) {
    const keywords = state.rules.keywords || [];
    const keywordHits = keywords.filter((word) => text.includes(word));
    const regexHits = (state.rules.regex || []).flatMap((pattern) => {
      try {
        return [...text.matchAll(new RegExp(pattern, "g"))].map((match) => match[0]);
      } catch {
        return [];
      }
    });
    return [...new Set([...keywordHits, ...regexHits])];
  }

  function extractPostKeywords(text) {
    const keywords = state.rules.postKeywords || [];
    return keywords.filter((word) => text.includes(word));
  }

  function detectSuspicion(text) {
    const source = String(text || "");
    const patterns = [
      /\b[A-Z]{1,4}\d{2,8}\b/g,
      /复制.{0,6}口令/g,
      /启动小红书/g,
      /(?:脱单|搭子|交友|对象|单身|高质量).{0,8}(?:群|交流群)/g,
      /(?:私信|进群|加群|拉你|群内|群里)/g
    ];
    return patterns.filter((re) => re.test(source)).map((_, index) => `pattern_${index + 1}`);
  }

  function findAuthor(node) {
    const candidates = [
      node.querySelector(".author"),
      node.querySelector(".name"),
      node.querySelector("[class*=author]"),
      node.querySelector("[class*=name]")
    ].filter(Boolean);
    return candidates[0]?.textContent?.trim() || "";
  }

  function isLikelyComment(node) {
    const text = node.textContent || "";
    if (text.length < 8 || text.length > 1200) return false;
    if (node.matches("button, a, [role='button'], input, textarea, [contenteditable='true']")) return false;
    if ((node.querySelectorAll(COMMENT_SELECTORS.join(",")).length || 0) > 1) return false;
    if ((node.querySelectorAll("button, a, input, textarea, [role='button']").length || 0) > 8) return false;
    return true;
  }

  function collect(item) {
    const pending = getPending();
    const signature = `${item.text}|${item.author}|${item.noteId}`;
    if (pending.some((entry) => `${entry.text}|${entry.author}|${entry.noteId}` === signature)) return;
    pending.unshift(item);
    savePending(pending);
  }

  function markNode(node) {
    node.style.opacity = "0.35";
    node.style.filter = "grayscale(1)";
    node.title = "xhs-ad-filter: suspected ad";
  }

  function inspectNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE || node.hasAttribute(SEEN_ATTR) || !isLikelyComment(node)) return;
    node.setAttribute(SEEN_ATTR, "1");

    const text = node.textContent.trim().replace(/\s+/g, " ");
    const author = findAuthor(node);
    const noteId = extractNoteId();
    const keywords = extractKeywords(text);
    const authorHit = author && (state.authors.authors || []).includes(author);
    const noteHit = noteId && (state.notes.notes || []).includes(noteId);
    if (!keywords.length && !authorHit && !noteHit) return;

    state.blocked += 1;
    markNode(node);
    collect({
      id: uuid(),
      type: "group_ad",
      text,
      author,
      noteId,
      keywords,
      createdAt: new Date().toISOString()
    });
  }

  function inspectPostNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE || node.hasAttribute(SEEN_ATTR)) return;
    if (!isLikelyPost(node)) return;
    node.setAttribute(SEEN_ATTR, "1");

    const text = node.textContent.trim().replace(/\s+/g, " ");
    const link = node.querySelector("a[href*='/explore/'], a[href*='/discovery/item/']");
    const href = link ? new URL(link.getAttribute("href"), location.href).href : location.href;
    const noteId = extractNoteIdFromUrl(href);
    const keywords = extractPostKeywords(text);
    const noteHit = noteId && (state.notes.notes || []).includes(noteId);
    const suspicion = detectSuspicion(text);
    const isBlocked = Boolean(keywords.length || noteHit);
    const isSuspected = !isBlocked && suspicion.length >= 2;
    if (!isBlocked && !isSuspected) return;

    collect({
      id: uuid(),
      type: "post_ad",
      text,
      author: "",
      noteId,
      keywords: keywords.length ? keywords : suspicion,
      reason: isBlocked ? "matched_post_rule" : "suspected_post_pattern",
      confidence: isBlocked ? "high" : "medium",
      url: href,
      createdAt: new Date().toISOString()
    });

    if (isBlocked) {
      state.blocked += 1;
      node.style.display = "none";
    } else {
      markNode(node);
    }
  }

  function isLikelyPost(node) {
    const text = node.textContent || "";
    if (text.length < 6 || text.length > 1600) return false;
    if (node.matches("button, a, [role='button'], input, textarea, [contenteditable='true']")) return false;
    const hasPostLink = Boolean(node.querySelector("a[href*='/explore/'], a[href*='/discovery/item/']"));
    const hasMedia = Boolean(node.querySelector("img, video, picture"));
    return hasPostLink || hasMedia;
  }

  function extractNoteIdFromUrl(url) {
    const match = String(url || "").match(/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : "";
  }

  function scan() {
    document.querySelectorAll(COMMENT_SELECTORS.join(",")).forEach(inspectNode);
    document.querySelectorAll(POST_SELECTORS.join(",")).forEach(inspectPostNode);
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  loadRules();
  setInterval(loadRules, 15 * 60 * 1000);
})();
