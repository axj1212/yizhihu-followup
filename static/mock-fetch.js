/* 医智呼 · 静态演示版 API 模拟层
 * 数据来源：make_snapshot.py 从真实 FastAPI 服务导出的接口快照（snapshot.js）
 * 只拦截同源 /api/* 请求，其余交给浏览器原生 fetch。
 * 写操作在浏览器内存中更新快照；刷新页面会回到初始演示数据。
 * 这样 Vercel / Cloudflare Pages 这类纯静态托管也能完整演示业务流程。
 */
(function () {
  "use strict";
  var nativeFetch = window.fetch.bind(window);
  var S = window.__YZH_SNAPSHOT__ || {};
  var byPath = S.byPath || {}, byId = S.byId || {}, query = S.query || {};
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  function reply(data, status) {
    return Promise.resolve(new Response(JSON.stringify(data === undefined ? {} : data), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    }));
  }
  function bodyOf(opts) {
    var b = opts && opts.body;
    if (!b || (typeof FormData !== "undefined" && b instanceof FormData)) return {};
    try { return typeof b === "string" ? JSON.parse(b) : b; } catch (e) { return {}; }
  }
  function rows(key) {
    var d = byPath[key];
    if (Array.isArray(d)) return d;
    return d && Array.isArray(d.items) ? d.items : [];
  }

  /* 患者列表：按 page / size / q / dept / status 做内存分页与筛选 */
  function patientsResponse(url) {
    var base = byPath["/api/patients"] || { total: 0, items: [], depts: [] };
    var items = (base.items || []).slice();
    var q = url.searchParams.get("q") || "";
    var dept = url.searchParams.get("dept") || "";
    var status = url.searchParams.get("status") || "";
    if (q) {
      items = items.filter(function (p) {
        return [p.name, p.inpatient_no, p.diagnosis, p.phone]
          .some(function (v) { return String(v || "").indexOf(q) >= 0; });
      });
    }
    if (dept) items = items.filter(function (p) { return p.dept === dept; });
    if (status) items = items.filter(function (p) { return p.status === status; });
    var page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    var size = Math.max(1, parseInt(url.searchParams.get("size") || "12", 10) || 12);
    return { total: items.length, items: items.slice((page - 1) * size, page * size), depts: base.depts || [] };
  }

  /* 用一条真实的「已完成通话」作为新外呼的结果，保留完整转写/结构化/工单 */
  function demoTaskFor(id, persona) {
    var t = clone(S.demoCall || {});
    t.id = String(id);
    t.status = "completed";
    if (persona) t.persona = persona;
    if (t.result) t.risk = t.result.risk_level || t.risk;
    return t;
  }
  function completeCall(id, persona) {
    var t = demoTaskFor(id, persona);
    var row = rows("/api/calls").filter(function (x) { return String(x.id) === String(id); })[0];
    if (row) {
      row.status = "completed";
      row.summary = (t.result && t.result.summary) || t.summary || row.summary;
      row.risk = (t.result && t.result.risk_level) || row.risk;
      if (persona) row.persona = persona;
    }
    if (byId.calls) byId.calls[String(id)] = t;
    var q = query["/api/calls?status=queued"];
    if (q && Array.isArray(q.items)) {
      q.items = q.items.filter(function (x) { return String(x.id) !== String(id); });
    }
    var c = byPath["/api/calls"];
    if (c && c.counts) {
      c.counts.completed = (c.counts.completed || 0) + 1;
      c.counts.queued = Math.max(0, (c.counts.queued || 0) - 1);
    }
    return t;
  }

  function handleGet(url) {
    var path = url.pathname, full = path + url.search;
    if (path === "/api/patients") return reply(patientsResponse(url));
    if (has(query, full)) return reply(query[full]);
    if (has(byPath, full)) return reply(byPath[full]);
    if (has(byPath, path)) return reply(byPath[path]);
    var m = path.match(/^\/api\/(protocols|patients|plans|calls)\/([^/]+)$/);
    if (m && byId[m[1]] && has(byId[m[1]], m[2])) return reply(byId[m[1]][m[2]]);
    return reply({});
  }

  function handleWrite(method, path, body) {
    var m;
    m = path.match(/^\/api\/calls\/([^/]+)\/run$/);
    if (m && method === "POST") {
      return reply({ ok: true, status: "completed", task: completeCall(m[1], body.persona || null) });
    }
    if (path === "/api/calls/batch" && method === "POST") {
      var queued = (query["/api/calls?status=queued"] || {}).items || [];
      var picked = queued.slice(0, Math.min(5, queued.length));
      picked.forEach(function (x) { completeCall(x.id, body.persona || null); });
      return reply({ ok: true, count: picked.length });
    }
    m = path.match(/^\/api\/protocols\/([^/]+)\/generate$/);
    if (m) {
      var p = (byId.protocols || {})[m[1]] || {};
      var qs = [];
      (p.stages || []).forEach(function (s) {
        (s.questions || []).forEach(function (q) { if (qs.length < 5) qs.push(q); });
      });
      if (!qs.length) {
        qs = ["最近一周血糖控制得怎么样？请告诉我空腹和餐后的读数？",
              "降糖药是否按时服用，有没有漏服或自行停药？",
              "有没有出现头晕、心慌、足部麻木等不适？"];
      }
      return reply({ questions: qs });
    }
    m = path.match(/^\/api\/protocols\/([^/]+)$/);
    if (m && method === "PATCH") {
      var proto = clone((byId.protocols || {})[m[1]] || { id: m[1], stages: [] });
      if (body.stages) proto.stages = body.stages;
      proto.status = "reviewing";
      if (byId.protocols) byId.protocols[m[1]] = proto;
      var plist = rows("/api/protocols");
      var pi = plist.filter(function (x) { return String(x.id) === m[1]; })[0];
      if (pi) pi.status = "reviewing";
      return reply(proto);
    }
    if (/^\/api\/protocols\/[^/]+\/publish$/.test(path)) return reply({ ok: true });
    if (/^\/api\/patients\/[^/]+\/plan$/.test(path)) return reply({ ok: true, stages: [{}, {}, {}, {}] });
    if (/^\/api\/patients\/[^/]+\/readmission$/.test(path)) return reply({ ok: true });
    if (/^\/api\/plans\/[^/]+\/terminate$/.test(path)) return reply({ ok: true });
    m = path.match(/^\/api\/tickets\/([^/]+)\/handle$/);
    if (m) {
      var tk = rows("/api/tickets").filter(function (x) { return String(x.id) === m[1]; })[0];
      if (tk) { tk.status = "closed"; tk.doctor_note = body.doctor_note || ""; }
      return reply({ ok: true });
    }
    if (path === "/api/import/patients") {
      return reply({ ok: true, message: "导入完成（静态演示环境不写入服务器，刷新后回到初始数据）" });
    }
    if (path === "/api/settings" && method === "PUT") {
      var s = byPath["/api/settings"] || {};
      if (body.line) s.line = Object.assign({}, s.line || {}, body.line);
      if (body.business_date) s.business_date = body.business_date;
      byPath["/api/settings"] = s;
      return reply({ ok: true });
    }
    if (path === "/api/patients" && method === "POST") {
      var base = byPath["/api/patients"];
      if (base && Array.isArray(base.items)) {
        base.items.unshift(Object.assign({
          id: "P" + Date.now(), status: "在访", plan_id: null, protocol_name: "—"
        }, body));
      }
      return reply({ ok: true });
    }
    return reply({ ok: true });
  }

  window.fetch = function (input, opts) {
    var url;
    try {
      url = new URL(typeof input === "string" ? input : input.url, location.href);
    } catch (e) { return nativeFetch(input, opts); }
    if (url.origin !== location.origin || url.pathname.indexOf("/api/") !== 0) {
      return nativeFetch(input, opts);
    }
    var method = String((opts && opts.method) || (typeof input !== "string" && input.method) || "GET").toUpperCase();
    if (method === "GET") return handleGet(url);
    return handleWrite(method, url.pathname, bodyOf(opts));
  };
})();
