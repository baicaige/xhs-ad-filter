const SEEN_ATTR = "data-xhs-ad-filter-seen";
const BADGE_ID = "xhs-ad-filter-badge";
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
  rules: { keywords: ["复制口令", "启动小红书", "脱单群", "搭子群", "交流群"], postKeywords: [], regex: ["CA\\d{2,8}"] },
  authors: { authors: [] },
  notes: { notes: [] }
};

let ruleState = DEFAULT_RULES;
let settings = { mode: "hide", showPageBadge: true, reportMode: "local" };
let pageStats = { blocked: 0, suspected: 0, reported: 0 };

init();

async function init() {
  settings = { ...settings, ...(await chrome.runtime.sendMessage({ type: "getSettings" })) };
  ruleState = { ...DEFAULT_RULES, ...(await chrome.runtime.sendMessage({ type: "getRules" })) };
  ensureBadge();
  scan();
  new MutationObserver(() => scan()).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(async () => {
    settings = { ...settings, ...(await chrome.runtime.sendMessage({ type: "getSettings" })) };
    ruleState = { ...DEFAULT_RULES, ...(await chrome.runtime.sendMessage({ type: "getRules" })) };
    updateBadge();
  }, 5 * 60 * 1000);
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractNoteId() {
  const match = location.href.match(/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/);
  return match ? match[1] : "";
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

function extractRuleKeywords(text) {
  const keywords = ruleState.rules?.keywords || [];
  const keywordHits = keywords.filter((word) => text.includes(word));
  const regexHits = (ruleState.rules?.regex || []).flatMap((pattern) => {
    try {
      return [...text.matchAll(new RegExp(pattern, "g"))].map((match) => match[0]);
    } catch {
      return [];
    }
  });
  return [...new Set([...keywordHits, ...regexHits])];
}

function extractPostKeywords(text) {
  const keywords = ruleState.rules?.postKeywords || [];
  return keywords.filter((word) => text.includes(word));
}

function detectSuspicion(text) {
  const source = String(text || "");
  const hits = [];
  const patterns = [
    { label: "口令/邀请码", re: /\b[A-Z]{1,4}\d{2,8}\b/g },
    { label: "复制口令", re: /复制.{0,6}口令/g },
    { label: "启动小红书", re: /启动小红书/g },
    { label: "群/交流群", re: /(?:脱单|搭子|交友|对象|单身|高质量).{0,8}(?:群|交流群)/g },
    { label: "私信/进群引导", re: /(?:私信|进群|加群|拉你|群内|群里)/g }
  ];
  patterns.forEach(({ label, re }) => {
    if (re.test(source)) hits.push(label);
  });
  return [...new Set(hits)];
}

function isLikelyComment(node) {
  const text = node.textContent || "";
  if (text.length < 8 || text.length > 1200) return false;
  if (node.matches("button, a, [role='button'], input, textarea, [contenteditable='true']")) return false;
  if ((node.querySelectorAll(COMMENT_SELECTORS.join(",")).length || 0) > 1) return false;
  if ((node.querySelectorAll("button, a, input, textarea, [role='button']").length || 0) > 8) return false;
  return true;
}

function scan() {
  document
    .querySelectorAll(COMMENT_SELECTORS.join(","))
    .forEach(inspectNode);
  document
    .querySelectorAll(POST_SELECTORS.join(","))
    .forEach(inspectPostNode);
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
  const noteHit = noteId && (ruleState.notes?.notes || []).includes(noteId);
  const suspicion = detectSuspicion(text);
  const isBlocked = Boolean(keywords.length || noteHit);
  const isSuspected = !isBlocked && suspicion.length >= 2;
  if (!isBlocked && !isSuspected) return;

  const item = {
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
  };

  if (isBlocked) {
    pageStats.blocked += 1;
    hidePostNode(node, item);
  } else {
    pageStats.suspected += 1;
    markSuspectedNode(node, suspicion);
  }
  chrome.runtime.sendMessage({ type: "collectPending", payload: item }, (response) => {
    if (response?.ok && settings.reportMode !== "local") {
      pageStats.reported += 1;
      updateBadge();
    }
  });
  updateBadge();
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

function inspectNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE || node.hasAttribute(SEEN_ATTR) || !isLikelyComment(node)) return;
  node.setAttribute(SEEN_ATTR, "1");

  const text = node.textContent.trim().replace(/\s+/g, " ");
  const author = findAuthor(node);
  const noteId = extractNoteId();
  const keywords = extractRuleKeywords(text);
  const authorHit = author && (ruleState.authors?.authors || []).includes(author);
  const noteHit = noteId && (ruleState.notes?.notes || []).includes(noteId);
  const suspicion = detectSuspicion(text);
  const isBlocked = Boolean(keywords.length || authorHit || noteHit);
  const isSuspected = !isBlocked && suspicion.length >= 2;
  if (!isBlocked && !isSuspected) return;

  const item = {
    id: uuid(),
    type: "group_ad",
    text,
    author,
    noteId,
    keywords: keywords.length ? keywords : suspicion,
    reason: isBlocked ? "matched_rule" : "suspected_pattern",
    confidence: isBlocked ? "high" : "medium",
    url: location.href,
    createdAt: new Date().toISOString()
  };

  if (isBlocked) {
    pageStats.blocked += 1;
    markBlockedNode(node, keywords, item);
  } else {
    pageStats.suspected += 1;
    markSuspectedNode(node, suspicion);
  }
  chrome.runtime.sendMessage({ type: "collectPending", payload: item }, (response) => {
    if (response?.ok && settings.reportMode !== "local") {
      pageStats.reported += 1;
      updateBadge();
    }
  });
  updateBadge();
}

function markBlockedNode(node, keywords, item) {
  node.dataset.xhsAdFilterHit = "blocked";
  node.title = `XHS Ad Filter: ${keywords.join(", ") || "blacklist"}`;
  if (settings.mode === "mark") {
    node.style.outline = "2px solid #b42318";
    node.style.background = "rgba(180, 35, 24, .08)";
    prependLabel(node, "已屏蔽规则命中", "#b42318");
    return;
  }
  const placeholder = document.createElement("div");
  placeholder.className = "xhs-ad-filter-placeholder";
  placeholder.textContent = `已隐藏疑似广告评论：${(item.keywords || []).join("、") || "黑名单命中"}`;
  placeholder.style.cssText = "margin:8px 0;padding:8px 10px;border:1px solid #fecdca;border-radius:6px;background:#fff1f3;color:#b42318;font-size:12px;";
  node.insertAdjacentElement("beforebegin", placeholder);
  node.style.display = "none";
}

function hidePostNode(node, item) {
  node.dataset.xhsAdFilterHit = "blocked-post";
  node.title = `XHS Ad Filter post: ${(item.keywords || []).join(", ") || "blacklist"}`;
  node.style.display = "none";
}

function markSuspectedNode(node, reasons) {
  node.dataset.xhsAdFilterHit = "suspected";
  node.title = `XHS Ad Filter suspected: ${reasons.join(", ")}`;
  node.style.outline = "2px dashed #b54708";
  node.style.background = "rgba(181, 71, 8, .08)";
  prependLabel(node, `疑似广告，已加入待审核：${reasons.join("、")}`, "#b54708");
}

function prependLabel(node, text, color) {
  if (node.querySelector(":scope > .xhs-ad-filter-label")) return;
  const label = document.createElement("div");
  label.className = "xhs-ad-filter-label";
  label.textContent = text;
  label.style.cssText = `display:inline-block;margin:0 0 6px;padding:3px 8px;border-radius:999px;background:#fff;color:${color};border:1px solid currentColor;font-size:12px;font-weight:650;`;
  node.prepend(label);
}

function ensureBadge() {
  if (!settings.showPageBadge || document.getElementById(BADGE_ID)) return;
  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 12px;border-radius:8px;background:#102027;color:#fff;font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);";
  document.documentElement.append(badge);
  updateBadge();
}

function updateBadge() {
  const badge = document.getElementById(BADGE_ID);
  if (!settings.showPageBadge) {
    badge?.remove();
    return;
  }
  if (!badge) return ensureBadge();
  badge.textContent = `XHS Ad Filter · 屏蔽 ${pageStats.blocked} · 疑似 ${pageStats.suspected} · 上报 ${pageStats.reported}`;
}
