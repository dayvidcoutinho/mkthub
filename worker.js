/* mkthub — hub do escritorio de marketing. Cada secao (conta) tem sua propria
   pagina estatica e sua propria tabela D1 de versoes, sem chave de acesso -
   editar e' aberto a quem tiver o link. Pra adicionar uma conta nova, basta
   uma linha em SECTIONS + o arquivo .html correspondente na raiz do site. */
var SECTIONS = {
  kaylua: { table: "kaylua_versions", asset: "/kaylua.html" },
  msb: { table: "msb_versions", asset: "/msb.html" }
};
var MAX_HTML_LEN = 3000000;

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname;

    if (path === "/" || path === "") {
      var to = new URL(request.url);
      to.pathname = "/kaylua";
      return Response.redirect(to.toString(), 302);
    }

    if (path === "/calendario" || path === "/calendario/") {
      return serveAsset(env, request, "/calendario.html");
    }

    for (var key in SECTIONS) {
      var sec = SECTIONS[key];
      if (path === "/" + key || path === "/" + key + "/") {
        return serveAsset(env, request, sec.asset);
      }
      if (path === "/api/" + key && request.method === "GET") {
        return getContent(env, sec.table);
      }
      if (path === "/api/" + key && request.method === "POST") {
        return saveContent(request, env, sec.table);
      }
      if (path === "/api/" + key + "/history" && request.method === "GET") {
        return listHistory(env, sec.table);
      }
      if (path.indexOf("/api/" + key + "/history/") === 0 && request.method === "GET") {
        return getVersion(env, sec.table, path.slice(("/api/" + key + "/history/").length));
      }
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

/* ---------------- Conteudo versionado (generico por secao) ---------------- */

async function ensureTable(env, table) {
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS " + table + " (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, html TEXT NOT NULL)"
  );
}

async function getContent(env, table) {
  await ensureTable(env, table);
  var row = await env.DB.prepare("SELECT id, created_at, html FROM " + table + " ORDER BY id DESC LIMIT 1").first();
  if (!row) return json({ html: null });
  return json({ id: row.id, created_at: row.created_at, html: row.html });
}

async function saveContent(request, env, table) {
  await ensureTable(env, table);
  var data;
  try { data = await request.json(); } catch (e) { return json({ error: "JSON invalido" }, 400); }
  if (!data.html || typeof data.html !== "string") return json({ error: "html obrigatorio" }, 400);
  if (data.html.length > MAX_HTML_LEN) return json({ error: "conteudo grande demais" }, 400);
  var createdAt = new Date().toISOString();
  var result = await env.DB.prepare(
    "INSERT INTO " + table + " (created_at, html) VALUES (?, ?)"
  ).bind(createdAt, data.html).run();
  return json({ ok: true, id: result.meta && result.meta.last_row_id, created_at: createdAt });
}

async function listHistory(env, table) {
  await ensureTable(env, table);
  var result = await env.DB.prepare(
    "SELECT id, created_at, length(html) as size FROM " + table + " ORDER BY id DESC LIMIT 200"
  ).all();
  return json(result.results || []);
}

async function getVersion(env, table, idStr) {
  await ensureTable(env, table);
  var id = parseInt(idStr, 10);
  if (!id) return json({ error: "id invalido" }, 400);
  var row = await env.DB.prepare("SELECT id, created_at, html FROM " + table + " WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "nao encontrado" }, 404);
  return json(row);
}
