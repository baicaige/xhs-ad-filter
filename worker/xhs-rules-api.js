const DEFAULT_REPO = {
  owner: "baicaige",
  repo: "xhs-ad-filter",
  branch: "main"
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "xhs-rules-api" });
      }
      if (request.method === "GET" && url.pathname === "/rules") {
        const bundle = await readBundle(env);
        return json(bundle);
      }
      if (request.method === "POST" && url.pathname === "/approve") {
        requireAdmin(request, env);
        const item = normalizePending(await request.json());
        const result = await approveItem(env, item);
        return json({ ok: true, ...result });
      }
      if (request.method === "POST" && url.pathname === "/rules/update") {
        requireAdmin(request, env);
        const result = await updateRules(env, await request.json());
        return json({ ok: true, ...result });
      }
      if (request.method === "POST" && url.pathname === "/submit") {
        requireSubmit(request, env);
        const item = normalizePending(await request.json());
        const result = await submitItem(env, item);
        return json({ ok: true, ...result });
      }
      if (request.method === "POST" && url.pathname === "/hit") {
        if (env.ALLOW_PUBLIC_HITS !== "true") throw httpError("Hit reporting is disabled", 403);
        const payload = await request.json();
        const result = await recordHit(env, payload);
        return json({ ok: true, ...result });
      }
      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      return json({ ok: false, error: error.message || "Internal error" }, error.status || 500);
    }
  }
};

async function readBundle(env) {
  const [rulesFile, authorsFile, notesFile, pendingFile] = await Promise.all([
    ghGet(env, "rules.json"),
    ghGet(env, "authors.json"),
    ghGet(env, "notes.json"),
    ghGet(env, "pending.json").catch(() => ({ json: { pending: [] } }))
  ]);
  return {
    rules: rulesFile.json,
    authors: authorsFile.json,
    notes: notesFile.json,
    pending: pendingFile.json
  };
}

async function approveItem(env, item) {
  const [rulesFile, authorsFile, notesFile, pendingFile] = await Promise.all([
    ghGet(env, "rules.json"),
    ghGet(env, "authors.json"),
    ghGet(env, "notes.json"),
    ghGet(env, "pending.json").catch(() => ({ json: { pending: [] }, sha: null }))
  ]);

  const nextRules = mergeApprovedRules(rulesFile.json, item);
  const nextAuthors = {
    ...authorsFile.json,
    authors: uniq([...(authorsFile.json.authors || []), item.author])
  };
  const nextNotes = {
    ...notesFile.json,
    notes: uniq([...(notesFile.json.notes || []), item.noteId])
  };
  const nextPending = {
    pending: (pendingFile.json.pending || []).filter((entry) => entry.id !== item.id)
  };

  const message = `Approve XHS ad sample ${item.id}`;
  await ghPut(env, "rules.json", nextRules, rulesFile.sha, message);
  await ghPut(env, "authors.json", nextAuthors, authorsFile.sha, message);
  await ghPut(env, "notes.json", nextNotes, notesFile.sha, message);
  if (pendingFile.sha) await ghPut(env, "pending.json", nextPending, pendingFile.sha, message);
  return { rules: nextRules, authors: nextAuthors, notes: nextNotes, pending: nextPending };
}

async function submitItem(env, item) {
  const pendingFile = await ghGet(env, "pending.json").catch(() => ({ json: { pending: [] }, sha: null }));
  const current = Array.isArray(pendingFile.json.pending) ? pendingFile.json.pending : [];
  const signature = pendingSignature(item);
  const exists = current.some((entry) => entry.id === item.id || pendingSignature(entry) === signature);
  if (exists) return { skipped: true, pending: pendingFile.json };

  const nextPending = {
    pending: [{
      ...item,
      status: "pending",
      source: item.source || "extension_report"
    }, ...current].slice(0, 500)
  };
  await ghPut(env, "pending.json", nextPending, pendingFile.sha, `Submit XHS ad sample ${item.id}`);
  return { pending: nextPending };
}

async function updateRules(env, payload) {
  const rulesFile = await ghGet(env, "rules.json");
  const current = normalizeRules(rulesFile.json);
  const nextRules = {
    ...current,
    keywords: mutateList(current.keywords, payload.addKeywords, payload.removeKeywords),
    postKeywords: mutateList(current.postKeywords, payload.addPostKeywords, payload.removePostKeywords),
    regex: mutateList(current.regex, payload.addRegex, payload.removeRegex)
  };
  await ghPut(env, "rules.json", nextRules, rulesFile.sha, "Update XHS filter rules");
  return { rules: nextRules };
}

async function recordHit(env, payload) {
  const keywords = uniq(payload.keywords || []);
  if (!keywords.length) return { skipped: true };
  const rulesFile = await ghGet(env, "rules.json");
  const nextRules = addRuleStats(rulesFile.json, keywords, payload.hitAt || new Date().toISOString());
  await ghPut(env, "rules.json", nextRules, rulesFile.sha, "Record XHS rule hit");
  return { rules: nextRules };
}

function addRuleStats(rules, keywords, hitAt) {
  const next = normalizeRules(rules);
  for (const keyword of uniq(keywords)) {
    next.stats.keywords[keyword] = {
      hitCount: Number(next.stats.keywords[keyword]?.hitCount || 0) + 1,
      lastHitAt: hitAt || new Date().toISOString()
    };
  }
  return next;
}

function mergeApprovedRules(rules, item) {
  const next = normalizeRules(rules);
  const target = item.type === "post_ad" || item.type === "post_keyword" ? "postKeywords" : "keywords";
  next[target] = uniq([...(next[target] || []), ...(item.keywords || [])]);
  next.regex = uniq(next.regex || []);
  next.stats[target] = { ...(next.stats[target] || {}) };
  for (const keyword of uniq(item.keywords || [])) {
    next.stats[target][keyword] = {
      hitCount: Number(next.stats[target][keyword]?.hitCount || 0) + 1,
      lastHitAt: item.createdAt || new Date().toISOString()
    };
  }
  return next;
}

function normalizeRules(rules) {
  return {
    ...rules,
    keywords: uniq(rules.keywords || []),
    postKeywords: uniq(rules.postKeywords || []),
    regex: uniq(rules.regex || []),
    stats: {
      keywords: { ...(rules.stats?.keywords || {}) },
      postKeywords: { ...(rules.stats?.postKeywords || {}) },
      regex: { ...(rules.stats?.regex || {}) }
    }
  };
}

function mutateList(current, addItems, removeItems) {
  const remove = new Set(uniq(removeItems || []));
  return uniq([...(current || []), ...(addItems || [])]).filter((item) => !remove.has(item));
}

function requireAdmin(request, env) {
  if (!env.ADMIN_KEY) throw httpError("ADMIN_KEY is not configured", 500);
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== env.ADMIN_KEY) throw httpError("Unauthorized", 401);
}

function requireSubmit(request, env) {
  if (!env.SUBMIT_KEY) throw httpError("SUBMIT_KEY is not configured", 500);
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== env.SUBMIT_KEY) throw httpError("Unauthorized", 401);
}

function normalizePending(item) {
  if (!item?.text) throw httpError("Missing sample text", 400);
  return {
    id: item.id || crypto.randomUUID(),
    type: item.type || "group_ad",
    text: String(item.text),
    author: item.author || "",
    noteId: item.noteId || "",
    keywords: uniq(item.keywords || extractKeywords(item.text)),
    reason: item.reason || "",
    confidence: item.confidence || "",
    url: item.url || "",
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function pendingSignature(item) {
  return `${item.text || ""}|${item.author || ""}|${item.noteId || ""}`;
}

function extractKeywords(text) {
  const source = String(text || "");
  const fixed = ["复制口令", "启动小红书", "脱单群", "搭子群", "交流群", "找对象", "单身", "高质量男生群"];
  const codes = source.match(/\b[A-Z]{1,4}\d{2,8}\b/g) || [];
  const groups = source.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}(?:群|交流群|搭子|脱单故事)/g) || [];
  return uniq([...fixed.filter((word) => source.includes(word)), ...codes, ...groups]);
}

async function ghGet(env, path) {
  const repo = repoConfig(env);
  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${encodeURIComponent(repo.branch)}`, {
    headers: ghHeaders(env)
  });
  if (!res.ok) throw httpError(`${path} read failed: ${res.status}`, res.status);
  const data = await res.json();
  return {
    json: JSON.parse(atobUtf8(data.content.replace(/\n/g, ""))),
    sha: data.sha
  };
}

async function ghPut(env, path, value, sha, message) {
  const repo = repoConfig(env);
  const body = {
    message,
    content: btoaUtf8(`${JSON.stringify(value, null, 2)}\n`),
    branch: repo.branch
  };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw httpError(`${path} write failed: ${res.status} ${await res.text()}`, res.status);
  return res.json();
}

function ghHeaders(env) {
  if (!env.GITHUB_TOKEN) throw httpError("GITHUB_TOKEN is not configured", 500);
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "xhs-rules-api"
  };
}

function repoConfig(env) {
  return {
    owner: env.GITHUB_OWNER || DEFAULT_REPO.owner,
    repo: env.GITHUB_REPO || DEFAULT_REPO.repo,
    branch: env.GITHUB_BRANCH || DEFAULT_REPO.branch
  };
}

function uniq(items) {
  return [...new Set((items || []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: JSON_HEADERS });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function atobUtf8(value) {
  return decodeURIComponent(escape(atob(value)));
}

function btoaUtf8(value) {
  return btoa(unescape(encodeURIComponent(value)));
}
