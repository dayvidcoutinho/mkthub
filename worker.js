export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname;

    if (path === "/" || path === "") {
      var to = new URL(request.url);
      to.pathname = "/kaylua";
      return Response.redirect(to.toString(), 302);
    }

    if (path === "/kaylua" || path === "/kaylua/") {
      return serveAsset(env, request, "/kaylua.html");
    }
    if (path === "/api/kaylua" && request.method === "GET") {
      return getKaylua(request, env);
    }
    if (path === "/api/kaylua" && request.method === "POST") {
      return saveKaylua(request, env);
    }
    if (path === "/api/kaylua/history" && request.method === "GET") {
      return listKayluaHistory(request, env);
    }
    if (path.indexOf("/api/kaylua/history/") === 0 && request.method === "GET") {
      return getKayluaVersion(request, env, path.slice("/api/kaylua/history/".length));
    }

    return env.ASSETS.fetch(request);
  }
};

function serveAsset(env, request, assetPath) {
  var assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

/* ---------------- Kaylua (gerenciador de conteudo, sem chave - edicao aberta a quem tem o link) ---------------- */

var KAYLUA_MAX_HTML_LEN = 3000000;

async function ensureKayluaTable(env) {
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS kaylua_versions (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, html TEXT NOT NULL)"
  );
}

async function getKaylua(request, env) {
  await ensureKayluaTable(env);
  var row = await env.DB.prepare("SELECT id, created_at, html FROM kaylua_versions ORDER BY id DESC LIMIT 1").first();
  if (!row) return json({ html: null });
  return json({ id: row.id, created_at: row.created_at, html: row.html });
}

async function saveKaylua(request, env) {
  await ensureKayluaTable(env);
  var data;
  try { data = await request.json(); } catch (e) { return json({ error: "JSON invalido" }, 400); }
  if (!data.html || typeof data.html !== "string") return json({ error: "html obrigatorio" }, 400);
  if (data.html.length > KAYLUA_MAX_HTML_LEN) return json({ error: "conteudo grande demais" }, 400);
  var createdAt = new Date().toISOString();
  var result = await env.DB.prepare(
    "INSERT INTO kaylua_versions (created_at, html) VALUES (?, ?)"
  ).bind(createdAt, data.html).run();
  return json({ ok: true, id: result.meta && result.meta.last_row_id, created_at: createdAt });
}

async function listKayluaHistory(request, env) {
  await ensureKayluaTable(env);
  var result = await env.DB.prepare(
    "SELECT id, created_at, length(html) as size FROM kaylua_versions ORDER BY id DESC LIMIT 200"
  ).all();
  return json(result.results || []);
}

async function getKayluaVersion(request, env, idStr) {
  await ensureKayluaTable(env);
  var id = parseInt(idStr, 10);
  if (!id) return json({ error: "id invalido" }, 400);
  var row = await env.DB.prepare("SELECT id, created_at, html FROM kaylua_versions WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "nao encontrado" }, 404);
  return json(row);
}
