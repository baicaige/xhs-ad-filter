async function render() {
  const { pending_ads: pending = [], stats = {}, rulesUpdatedAt } = await chrome.storage.local.get(["pending_ads", "stats", "rulesUpdatedAt"]);
  document.getElementById("blocked").textContent = Number(stats.blocked || 0);
  document.getElementById("pending").textContent = pending.length;
  document.getElementById("updated").textContent = rulesUpdatedAt ? `规则同步：${new Date(rulesUpdatedAt).toLocaleString()}` : "尚未同步规则";
}

document.getElementById("refresh").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "refreshRules" });
  await render();
});

document.getElementById("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
render();
