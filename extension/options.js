const DEFAULTS = {
  rulesBaseUrl: "https://baicaige.github.io/xhs-ad-filter",
  mode: "hide"
};

async function restore() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById("rulesBaseUrl").value = settings.rulesBaseUrl;
  document.getElementById("mode").value = settings.mode;
}

async function save() {
  const rulesBaseUrl = document.getElementById("rulesBaseUrl").value.trim().replace(/\/$/, "");
  const mode = document.getElementById("mode").value;
  await chrome.storage.sync.set({ rulesBaseUrl, mode });
  await chrome.runtime.sendMessage({ type: "refreshRules" });
  document.getElementById("status").textContent = "已保存并刷新规则。";
}

document.getElementById("save").addEventListener("click", save);
restore();
