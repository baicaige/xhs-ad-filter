async function render() {
  const { pending_ads: pending = [], stats = {}, rulesUpdatedAt } = await chrome.storage.local.get(["pending_ads", "stats", "rulesUpdatedAt"]);
  const blocked = Number(stats.blocked || 0);
  const reported = Number(stats.reported || 0);
  document.getElementById("blocked").textContent = blocked;
  document.getElementById("pending").textContent = pending.length;
  document.getElementById("reported").textContent = reported;
  document.getElementById("hitRate").textContent = blocked ? `${Math.round((reported / blocked) * 100)}%` : "-";
  document.getElementById("updated").textContent = rulesUpdatedAt ? `规则同步：${new Date(rulesUpdatedAt).toLocaleString()}` : "尚未同步规则";
  document.getElementById("reportError").textContent = stats.lastReportError ? `上报失败：${stats.lastReportError}` : "";
}

document.getElementById("refresh").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "refreshRules" });
  await render();
});

document.getElementById("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
render();
