const DEFAULTS = {
  rulesBaseUrl: "https://baicaige.github.io/xhs-ad-filter",
  mode: "hide"
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set({ ...DEFAULTS, ...current });
  chrome.alarms.create("refreshRules", { periodInMinutes: 15 });
  await refreshRules();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshRules") refreshRules();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "getRules") {
    chrome.storage.local.get(["rules", "authors", "notes"], sendResponse);
    return true;
  }
  if (message?.type === "collectPending") {
    collectPending(message.payload).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "refreshRules") {
    refreshRules().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function refreshRules() {
  const { rulesBaseUrl } = await chrome.storage.sync.get(DEFAULTS);
  const [rules, authors, notes] = await Promise.all([
    fetchJson(`${rulesBaseUrl}/rules.json`),
    fetchJson(`${rulesBaseUrl}/authors.json`),
    fetchJson(`${rulesBaseUrl}/notes.json`)
  ]);
  await chrome.storage.local.set({
    rules: rules || { keywords: [], regex: [] },
    authors: authors || { authors: [] },
    notes: notes || { notes: [] },
    rulesUpdatedAt: new Date().toISOString()
  });
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function collectPending(item) {
  if (!item?.text) return;
  const { pending_ads: current = [], stats = {} } = await chrome.storage.local.get(["pending_ads", "stats"]);
  const signature = `${item.text}|${item.author || ""}|${item.noteId || ""}`;
  if (current.some((entry) => `${entry.text}|${entry.author || ""}|${entry.noteId || ""}` === signature)) return;
  await chrome.storage.local.set({
    pending_ads: [item, ...current].slice(0, 500),
    stats: {
      ...stats,
      blocked: Number(stats.blocked || 0) + 1,
      lastBlockedAt: new Date().toISOString()
    }
  });
}
