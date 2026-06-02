const DEFAULTS = {
  rulesBaseUrl: "https://baicaige.github.io/xhs-ad-filter",
  apiBaseUrl: "https://xhs-rules-api.qbbaicai.workers.dev",
  mode: "hide",
  reportMode: "local",
  showPageBadge: true
};

async function restore() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const secrets = await chrome.storage.local.get(["submitKey", "adminKey"]);
  document.getElementById("rulesBaseUrl").value = settings.rulesBaseUrl;
  document.getElementById("apiBaseUrl").value = settings.apiBaseUrl;
  document.getElementById("mode").value = settings.mode;
  document.getElementById("reportMode").value = settings.reportMode;
  document.getElementById("showPageBadge").checked = settings.showPageBadge;
  document.getElementById("submitKey").value = secrets.submitKey || "";
  document.getElementById("adminKey").value = secrets.adminKey || "";
}

async function save() {
  const rulesBaseUrl = document.getElementById("rulesBaseUrl").value.trim().replace(/\/$/, "");
  const apiBaseUrl = document.getElementById("apiBaseUrl").value.trim().replace(/\/$/, "");
  const mode = document.getElementById("mode").value;
  const reportMode = document.getElementById("reportMode").value;
  const showPageBadge = document.getElementById("showPageBadge").checked;
  const submitKey = document.getElementById("submitKey").value.trim();
  const adminKey = document.getElementById("adminKey").value.trim();
  await chrome.storage.sync.set({ rulesBaseUrl, apiBaseUrl, mode, reportMode, showPageBadge });
  await chrome.storage.local.set({ submitKey, adminKey });
  await chrome.runtime.sendMessage({ type: "refreshRules" });
  document.getElementById("status").textContent = "已保存并刷新规则。";
}

document.getElementById("save").addEventListener("click", save);
restore();
