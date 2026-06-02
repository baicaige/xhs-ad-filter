const SEEN_ATTR = "data-xhs-ad-filter-seen";
const DEFAULT_RULES = {
  rules: { keywords: ["复制口令", "启动小红书", "脱单群", "搭子群", "交流群"], regex: ["CA\\d{2,8}"] },
  authors: { authors: [] },
  notes: { notes: [] }
};
let ruleState = DEFAULT_RULES;
let mode = "hide";

init();

async function init() {
  const settings = await chrome.storage.sync.get({ mode: "hide" });
  mode = settings.mode;
  ruleState = { ...DEFAULT_RULES, ...(await chrome.runtime.sendMessage({ type: "getRules" })) };
  scan();
  new MutationObserver(() => scan()).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(async () => {
    ruleState = { ...DEFAULT_RULES, ...(await chrome.runtime.sendMessage({ type: "getRules" })) };
    scan();
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

function extractKeywords(text) {
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

function isLikelyComment(node) {
  const text = node.textContent || "";
  return text.length >= 8 && text.length <= 1200;
}

function scan() {
  document
    .querySelectorAll(".comment-item, .comment, [class*=comment], [class*=Comment]")
    .forEach(inspectNode);
}

function inspectNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE || node.hasAttribute(SEEN_ATTR) || !isLikelyComment(node)) return;
  node.setAttribute(SEEN_ATTR, "1");

  const text = node.textContent.trim().replace(/\s+/g, " ");
  const author = findAuthor(node);
  const noteId = extractNoteId();
  const keywords = extractKeywords(text);
  const authorHit = author && (ruleState.authors?.authors || []).includes(author);
  const noteHit = noteId && (ruleState.notes?.notes || []).includes(noteId);
  if (!keywords.length && !authorHit && !noteHit) return;

  markNode(node, keywords);
  chrome.runtime.sendMessage({
    type: "collectPending",
    payload: {
      id: uuid(),
      type: "group_ad",
      text,
      author,
      noteId,
      keywords,
      createdAt: new Date().toISOString()
    }
  });
}

function markNode(node, keywords) {
  node.dataset.xhsAdFilterHit = "1";
  node.title = `XHS Ad Filter: ${keywords.join(", ") || "blacklist"}`;
  if (mode === "mark") {
    node.style.outline = "2px solid #b42318";
    node.style.background = "rgba(180, 35, 24, .08)";
    return;
  }
  node.style.display = "none";
}
