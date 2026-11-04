// The end-of-run report for load.js: handleSummary(data) gets k6's summary, and this turns it into
// reports/index.html (one row per endpoint, from the per-endpoint thresholds' submetrics) and a text table for the log.
const STATS = ["avg", "med", "p(90)", "p(95)", "p(99)", "max"];
const PHASES = ["http_req_blocked", "http_req_connecting", "http_req_sending", "http_req_waiting", "http_req_receiving"];

function ms(v) {
  if (v == null) return "–";
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`;
  return `${v.toFixed(v < 10 ? 2 : 0)} ms`;
}
const STAT_HEADS = STATS.map((s) => `<th>${s}</th>`).join("");
const statCells = (values) => STATS.map((s) => `<td data-v="${values[s]}">${ms(values[s])}</td>`).join("");
const pct = (v) => `${(v * 100).toFixed(v > 0 && v < 0.001 ? 3 : 2)}%`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.codePointAt(0)};`);
const passed = (metric) => Object.values(metric?.thresholds ?? {}).every((t) => t.ok);
const limits = (metric) => Object.keys(metric?.thresholds ?? {});

// http_req_failed is a rate of "true" values: passes are the failed requests.
function requests(failed) {
  const total = (failed?.values.passes ?? 0) + (failed?.values.fails ?? 0);
  return { total, failed: failed?.values.passes ?? 0, rate: failed?.values.rate ?? 0 };
}

function rows(data, tag) {
  const seconds = data.state.testRunDurationMs / 1000;
  const prefix = `http_req_duration{${tag}:`;
  return Object.keys(data.metrics)
    .filter((key) => key.startsWith(prefix))
    .map((key) => {
      const name = key.slice(prefix.length, -1);
      const duration = data.metrics[key];
      const failed = data.metrics[`http_req_failed{${tag}:${name}}`];
      const reqs = requests(failed);
      return {
        name,
        ...reqs,
        rps: reqs.total / seconds,
        stats: duration.values,
        min: duration.values.min,
        ok: passed(duration) && passed(failed),
        limits: [...limits(duration).map((t) => `duration ${t}`), ...limits(failed).map((t) => `failed ${t}`)],
      };
    })
    .sort((a, b) => b.stats["p(95)"] - a.stats["p(95)"]);
}

export function textReport(data) {
  const endpoints = rows(data, "name");
  const width = Math.max(...endpoints.map((r) => r.name.length), 8);
  const head = ["endpoint".padEnd(width), "reqs".padStart(7), "failed".padStart(8), ...STATS.map((s) => s.padStart(9)), "  "];
  const lines = endpoints.map((r) =>
    [
      r.name.padEnd(width),
      String(r.total).padStart(7),
      pct(r.rate).padStart(8),
      ...STATS.map((s) => ms(r.stats[s]).padStart(9)),
      r.ok ? "  ok" : "  FAIL",
    ].join(" "),
  );
  const all = requests(data.metrics.http_req_failed);
  return [
    "",
    `${all.total} requests, ${pct(all.rate)} failed, p95 ${ms(data.metrics.http_req_duration.values["p(95)"])}`,
    "",
    head.join(" "),
    ...lines,
    "",
    "Report: open the k6-report resource's link in the Aspire dashboard (backend/perf/k6/reports/index.html).",
    "",
  ].join("\n");
}

// A log scale from min to max: one outlier (a 70 s max beside a 2 ms median) would squash a linear one to a dot.
function distribution(r) {
  const lo = Math.log(Math.max(r.min, 0.01));
  const span = Math.log(Math.max(r.stats.max, 0.01)) - lo || 1;
  const at = (v) => `${Math.min(100, ((Math.log(Math.max(v, 0.01)) - lo) / span) * 100).toFixed(2)}%`;
  const marks = ["med", "p(90)", "p(95)", "p(99)"]
    .map((s, i) => `<i class="mark" style="left:${at(r.stats[s])};height:${24 + i * 14}px" title="${s} ${ms(r.stats[s])}"><b>${s} ${ms(r.stats[s])}</b></i>`)
    .join("");
  return `<div class="dist">${marks}</div>
    <div class="dist-scale"><span>min ${ms(r.min)}</span><span>log scale</span><span>max ${ms(r.stats.max)}</span></div>`;
}

function endpointTable(list, scale, withDetails, label) {
  const body = list
    .map((r, i) => {
      const cells = `<td>${esc(r.name)}</td><td data-v="${r.total}">${r.total}</td><td data-v="${r.rps}">${r.rps.toFixed(1)}</td>
        <td data-v="${r.rate}" class="${r.failed ? "bad" : ""}">${pct(r.rate)} <small>(${r.failed})</small></td>
        ${statCells(r.stats)}
        <td data-v="${r.stats["p(95)"]}"><span class="bar"><span style="width:${Math.min(100, (r.stats["p(95)"] / scale) * 100)}%"></span></span></td>
        <td data-v="${r.ok ? 1 : 0}"><span class="pill ${r.ok ? "ok" : "fail"}">${r.ok ? "pass" : "fail"}</span></td>`;
      if (!withDetails) return `<tr>${cells}</tr>`;
      const detail = `<tr class="detail" hidden><td colspan="${STATS.length + 6}">
          <p><strong>${esc(r.name)}</strong> · min ${ms(r.min)} · max ${ms(r.stats.max)} · ${r.total} requests, ${r.failed} failed</p>
          ${distribution(r)}
          <p class="muted">Thresholds: ${r.limits.map(esc).join(", ") || "none"}</p></td></tr>`;
      return `<tr class="row" tabindex="0" aria-expanded="false" data-i="${i}">${cells}</tr>${detail}`;
    })
    .join("");
  return `<table class="sortable"><thead><tr><th>${label}</th><th>Requests</th><th>Req/s</th><th>Failed</th>
    ${STAT_HEADS}<th>p95 vs limit</th><th>Thresholds</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function htmlReport(data) {
  const endpoints = rows(data, "name");
  const scenarios = rows(data, "scenario");
  const all = requests(data.metrics.http_req_failed);
  const seconds = data.state.testRunDurationMs / 1000;
  const allOk = Object.values(data.metrics).every(passed);
  // A request can't outlast the run: k6 times requests on the wall clock, so a max over the run length means the clock
  // jumped mid-request (Docker Desktop's VM clock does, by about a minute), not a stall.
  const impossible = endpoints.filter((r) => r.stats.max > data.state.testRunDurationMs).map((r) => esc(r.name));
  const clockNote = impossible.length
    ? `<p class="warn" role="alert">Max over the whole run (${ms(data.state.testRunDurationMs)}) on ${impossible.join(", ")}: the container's clock jumped during those requests, so their max and avg (and maybe p99) are wrong, while the median and p95 hold. Compare <code>docker run --rm alpine date</code> with the host's clock.</p>`
    : "";
  // Bars are drawn against the endpoints' p95 limit (500 ms in load.js), or the slowest p95 if one went over it.
  const limit = Number(/p\(95\)<(\d+)/.exec(endpoints.flatMap((r) => r.limits).join(" "))?.[1] ?? 500);
  const scale = Math.max(limit, ...endpoints.map((r) => r.stats["p(95)"]));
  const checks = data.root_group.checks
    .map((c) => `<tr><td>${esc(c.name)}</td><td>${c.passes}</td><td class="${c.fails ? "bad" : ""}">${c.fails}</td></tr>`)
    .join("");
  const phases = PHASES.filter((p) => data.metrics[p])
    .map((p) => `<tr><td>${p.replace("http_req_", "")}</td>${statCells(data.metrics[p].values)}</tr>`)
    .join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>k6 load test · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</title><style>
:root{--ink:#222;--muted:#6a6a6a;--line:#ebebeb;--ok:#008a05;--bad:#c13515;--accent:#ff385c;font:14px/1.45 system-ui,sans-serif;color:var(--ink)}
body{margin:0 auto;max-width:1280px;padding:24px}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px}
.muted,small{color:var(--muted)}.bad{color:var(--bad)}a{color:inherit}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:16px 0}
.tile{border:1px solid var(--line);border-radius:14px;padding:12px 16px}.tile b{display:block;font-size:22px}
table{border-collapse:collapse;width:100%}th,td{text-align:right;padding:8px;border-bottom:1px solid var(--line);white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{cursor:pointer;user-select:none;font-weight:600}th[aria-sort]::after{content:" ▾"}th[aria-sort=ascending]::after{content:" ▴"}
tr.row{cursor:pointer}tr.row:hover,tr.row:focus-visible{background:#f7f7f7;outline:none}
.pill{border-radius:99px;padding:2px 10px;font-weight:600;color:#fff}.pill.ok{background:var(--ok)}.pill.fail{background:var(--bad)}
.bar{display:inline-block;width:120px;height:8px;background:var(--line);border-radius:4px;overflow:hidden;vertical-align:middle}.bar span{display:block;height:100%;background:var(--accent)}
tr.detail td{text-align:left;white-space:normal;background:#fafafa}
.dist{position:relative;height:12px;margin:72px 8px 4px;background:#ffd1da;border-radius:3px}
.mark{position:absolute;bottom:0;width:2px;height:24px;background:var(--ink)}.mark b{position:absolute;z-index:1;top:-2px;left:3px;padding:0 2px;background:#fafafa;font:600 11px system-ui;white-space:nowrap}
.dist-scale{display:flex;justify-content:space-between;margin:0 8px;color:var(--muted);font-size:12px}
.warn{border:1px solid var(--bad);border-radius:8px;padding:8px 12px;color:var(--bad)}
input{font:inherit;padding:6px 10px;border:1px solid #b0b0b0;border-radius:8px;width:260px}
</style></head><body>
<h1>k6 load test <span class="pill ${allOk ? "ok" : "fail"}">${allOk ? "thresholds passed" : "thresholds crossed"}</span></h1>
<p class="muted">Finished ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC · ${seconds.toFixed(0)} s ·
<a href="dashboard.html">Charts over time (k6 web dashboard)</a></p>
${clockNote}
<div class="tiles">
<div class="tile"><small>Requests</small><b>${all.total}</b></div>
<div class="tile"><small>Throughput</small><b>${(all.total / seconds).toFixed(1)}/s</b></div>
<div class="tile"><small>Failed</small><b class="${all.failed ? "bad" : ""}">${pct(all.rate)}</b></div>
<div class="tile"><small>p95</small><b>${ms(data.metrics.http_req_duration.values["p(95)"])}</b></div>
<div class="tile"><small>Max VUs</small><b>${data.metrics.vus_max?.values.max ?? "–"}</b></div>
</div>
<h2>Endpoints</h2>
<p class="muted">Slowest p95 first. Click a column to sort, a row for its latency spread. <input type="search" id="filter" placeholder="Filter endpoints" aria-label="Filter endpoints"></p>
${endpointTable(endpoints, scale, true, "Endpoint")}
<h2>Scenarios</h2>${endpointTable(scenarios, scale, false, "Scenario")}
<h2>Checks</h2><table><thead><tr><th>Check</th><th>Passed</th><th>Failed</th></tr></thead><tbody>${checks}</tbody></table>
<h2>Where the time goes (all requests)</h2>
<p class="muted">waiting is time to first byte (the server's work); blocked and connecting are the client waiting for a connection.</p>
<table><thead><tr><th>Phase</th>${STAT_HEADS}</tr></thead><tbody>${phases}</tbody></table>
<script>
for (const table of document.querySelectorAll("table.sortable")) {
  const ths = [...table.tHead.rows[0].cells];
  ths.forEach((th, col) => th.addEventListener("click", () => {
    const asc = th.getAttribute("aria-sort") !== "ascending";
    ths.forEach((h) => h.removeAttribute("aria-sort"));
    th.setAttribute("aria-sort", asc ? "ascending" : "descending");
    const body = table.tBodies[0];
    const pairs = [...body.querySelectorAll("tr:not(.detail)")].map((tr) => [tr, tr.nextElementSibling?.classList.contains("detail") ? tr.nextElementSibling : null]);
    const key = (tr) => tr.cells[col].dataset.v ?? tr.cells[col].textContent;
    pairs.sort(([a], [b]) => { const x = key(a), y = key(b); const d = isNaN(x) ? x.localeCompare(y) : x - y; return asc ? d : -d; });
    pairs.forEach(([tr, detail]) => { body.append(tr); if (detail) body.append(detail); });
  }));
}
for (const row of document.querySelectorAll("tr.row")) {
  const toggle = () => { const d = row.nextElementSibling; d.hidden = !d.hidden; row.setAttribute("aria-expanded", String(!d.hidden)); };
  row.addEventListener("click", toggle);
  row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
}
document.getElementById("filter").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  for (const row of document.querySelectorAll("tr.row")) {
    const hide = !row.cells[0].textContent.toLowerCase().includes(q);
    row.hidden = hide;
    if (hide) { row.nextElementSibling.hidden = true; row.setAttribute("aria-expanded", "false"); }
  }
});
</script></body></html>`;
}
