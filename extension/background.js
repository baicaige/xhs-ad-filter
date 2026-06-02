const DEFAULTS = {
  rulesBaseUrl: "https://baicaige.github.io/xhs-ad-filter",
  apiBaseUrl: "https://xhs-rules-api.qbbaicai.workers.dev",
  mode: "hide",
  reportMode: "local",
  showPageBadge: true
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
  if (message?.type === "getSettings") {
    getRuntimeSettings().then(sendResponse);
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
  const exists = current.some((entry) => `${entry.text}|${entry.author || ""}|${entry.noteId || ""}` === signature);
  if (exists) return;
  await chrome.storage.local.set({
    pending_ads: [item, ...current].slice(0, 500),
    stats: {
      ...stats,
      blocked: Number(stats.blocked || 0) + 1,
      lastBlockedAt: new Date().toISOString()
    }
  });
  await reportPending(item);
}

async function getRuntimeSettings() {
  const syncSettings = await chrome.storage.sync.get(DEFAULTS);
  const localSettings = await chrome.storage.local.get(["submitKey", "adminKey"]);
  return { ...syncSettings, ...localSettings };
}

async function reportPending(item) {
  const settings = await getRuntimeSettings();
  if (settings.reportMode === "local") return;

  const endpoint = settings.reportMode === "approve" ? "/approve" : "/submit";
  const key = settings.reportMode === "approve" ? settings.adminKey : settings.submitKey;
  if (!settings.apiBaseUrl || !key) return;

  const { stats = {} } = await chrome.storage.local.get(["stats"]);
  try {
    const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json"
      },
      body: JSON.stringify(item)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    await chrome.storage.local.set({
      stats: {
        ...stats,
        reported: Number(stats.reported || 0) + 1,
        lastReportedAt: new Date().toISOString(),
        lastReportError: ""
      }
    });
  } catch (error) {
    await chrome.storage.local.set({
      stats: {
        ...stats,
        lastReportError: error.message || "report failed"
      }
    });
  }
}
