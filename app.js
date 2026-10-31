const API = "https://gold-signal-api.vijaysaini637897.workers.dev";
const HISTORY_KEY = "gold-signal-studio-history-v1";
const MAX_HISTORY = 250;

const $ = id => document.getElementById(id);
let timer = null;
let lastAlert = "";
let historyReady = false;

const fmt = x =>
  Number.isFinite(x)
    ? x.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : "—";

const set = (id, v) => {
  const e = $(id);
  if (e) e.textContent = v;
};

const candleTime = t => {
  const n = Number(t);
  return new Date(n > 1e11 ? n : n * 1000);
};

function readHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("History read error:", e);
    return [];
  }
}

function saveHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch (e) {
    console.warn("History save error:", e);
    set("historyNote", "Browser storage full ya unavailable hai. History save nahi hui.");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function injectHistoryPanel() {
  if ($("historyPanel")) return;

  const style = document.createElement("style");
  style.textContent = `
    #historyPanel{margin:18px 0 28px;padding:20px;border:1px solid #293b52;border-radius:22px;background:#111e30;color:#e8eef7;font-family:inherit}
    #historyPanel .hs-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    #historyPanel .hs-title{font-size:21px;font-weight:800;color:#f0c76b}
    #historyPanel .hs-sub{font-size:13px;color:#9eafc4;margin-top:5px}
    #historyPanel .hs-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:17px 0}
    #historyPanel .hs-stat{background:#1a2a40;border-radius:14px;padding:12px;min-width:0}
    #historyPanel .hs-stat small{display:block;color:#9eafc4;font-size:11px}
    #historyPanel .hs-stat b{display:block;font-size:20px;margin-top:5px;overflow-wrap:anywhere}
    #historyPanel .hs-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
    #historyPanel button{border:1px solid #42546d;background:#263950;color:#f5f7fb;border-radius:10px;padding:10px 13px;font-weight:700}
    #historyPanel .hs-table-wrap{overflow-x:auto;border-radius:12px;border:1px solid #293b52}
    #historyPanel table{width:100%;border-collapse:collapse;min-width:620px;font-size:13px}
    #historyPanel th,#historyPanel td{text-align:left;padding:11px 9px;border-bottom:1px solid #293b52;white-space:nowrap}
    #historyPanel th{color:#9eafc4;background:#18273b;font-weight:700}
    #historyPanel tr:last-child td{border-bottom:0}
    #historyPanel .hs-buy{color:#42d3a0;font-weight:800}
    #historyPanel .hs-sell{color:#ff7d87;font-weight:800}
    #historyPanel .hs-wait{color:#f0c76b;font-weight:800}
    #historyPanel .hs-win{color:#42d3a0;font-weight:800}
    #historyPanel .hs-loss{color:#ff7d87;font-weight:800}
    #historyPanel .hs-pending{color:#f0c76b;font-weight:800}
    #historyPanel .hs-empty{padding:18px;color:#9eafc4;text-align:center}
    #historyPanel .hs-note{font-size:12px;line-height:1.5;color:#9eafc4;margin-top:12px}
    @media(max-width:520px){#historyPanel{padding:15px}#historyPanel .hs-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#historyPanel .hs-title{font-size:19px}}
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.id = "historyPanel";
  panel.innerHTML = `
    <div class="hs-head">
      <div>
        <div class="hs-title">SIGNAL HISTORY</div>
        <div class="hs-sub">Saved on this device · Paper tracking only</div>
      </div>
      <div class="hs-sub" id="historyCount">0 records</div>
    </div>
    <div class="hs-stats">
      <div class="hs-stat"><small>Total signals</small><b id="hsTotal">0</b></div>
      <div class="hs-stat"><small>Completed trades</small><b id="hsCompleted">0</b></div>
      <div class="hs-stat"><small>Wins / Losses</small><b id="hsWL">0 / 0</b></div>
      <div class="hs-stat"><small>Paper win rate</small><b id="hsWinRate">—</b></div>
    </div>
    <div class="hs-actions">
      <button type="button" id="hsExport">Export CSV</button>
      <button type="button" id="hsClear">Clear history</button>
    </div>
    <div class="hs-table-wrap">
      <table>
        <thead><tr><th>Date / Time</th><th>Signal</th><th>Entry</th><th>Stop</th><th>Target</th><th>Result</th></tr></thead>
        <tbody id="hsRows"><tr><td colspan="6" class="hs-empty">Abhi koi history nahi hai.</td></tr></tbody>
      </table>
    </div>
    <div class="hs-note" id="historyNote">
      History isi browser/device mein save hoti hai. BUY/SELL paper results ATR-based stop (1R) aur target (2R) se track hote hain. Agar ek hi 1-minute candle mein stop aur target dono touch hon, conservative rule se LOSS count hoga. Yeh verified accuracy ya live-trading recommendation nahi hai.
    </div>
  `;

  const main = document.querySelector("main") || document.body;
  main.appendChild(panel);

  $("hsExport").addEventListener("click", exportHistoryCSV);
  $("hsClear").addEventListener("click", () => {
    if (!window.confirm("Kya aap is device ki poori signal history clear karna chahte hain?")) return;
    saveHistory([]);
    renderHistory();
  });

  historyReady = true;
  renderHistory();
}

function renderHistory() {
  if (!$("historyPanel")) return;

  const items = readHistory();
  const trades = items.filter(x => x.signal === "BUY" || x.signal === "SELL");
  const wins = trades.filter(x => x.result === "WIN").length;
  const losses = trades.filter(x => x.result === "LOSS").length;
  const completed = wins + losses;
  const pending = trades.filter(x => x.result === "PENDING").length;
  const rate = completed ? `${(wins / completed * 100).toFixed(1)}%` : "—";

  set("hsTotal", items.length);
  set("hsCompleted", completed);
  set("hsWL", `${wins} / ${losses}`);
  set("hsWinRate", rate);
  set("historyCount", `${items.length} records · ${pending} pending`);

  const rows = items.slice(0, 30);
  if (!rows.length) {
    $("hsRows").innerHTML = '<tr><td colspan="6" class="hs-empty">Abhi koi history nahi hai. Naya 5-minute signal aane par record banega.</td></tr>';
    return;
  }

  $("hsRows").innerHTML = rows.map(x => {
    const signalClass = x.signal === "BUY" ? "hs-buy" : x.signal === "SELL" ? "hs-sell" : "hs-wait";
    const resultClass = x.result === "WIN" ? "hs-win" : x.result === "LOSS" ? "hs-loss" : "hs-pending";
    const date = new Date(x.time).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
    return `<tr>
      <td>${escapeHtml(date)}</td>
      <td class="${signalClass}">${escapeHtml(x.signal)}</td>
      <td>${fmt(Number(x.entry))}</td>
      <td>${x.stop == null ? "—" : fmt(Number(x.stop))}</td>
      <td>${x.target == null ? "—" : fmt(Number(x.target))}</td>
      <td class="${resultClass}">${escapeHtml(x.result || "—")}</td>
    </tr>`;
  }).join("");
}

function recordSignal(signal, price, atrValue) {
  const bucket = Math.floor(Date.now() / 300000) * 300000;
  const items = readHistory();

  if (items.some(x => x.bucket === bucket)) return;

  const isTrade = signal === "BUY" || signal === "SELL";
  const risk = Number.isFinite(atrValue) && atrValue > 0 ? atrValue : null;
  const entry = Number(price);
  const usable = isTrade && risk && Number.isFinite(entry);

  let stop = null;
  let target = null;

  if (usable) {
    stop = signal === "BUY" ? entry - risk : entry + risk;
    target = signal === "BUY" ? entry + 2 * risk : entry - 2 * risk;
  }

  items.unshift({
    id: `${bucket}-${signal}`,
    bucket,
    time: Date.now(),
    signal,
    entry: Number.isFinite(entry) ? entry : null,
    stop,
    target,
    evaluationFrom: bucket + 300000,
    result: usable ? "PENDING" : "N/A",
    note: usable ? "ATR paper levels" : "No trade setup"
  });

  saveHistory(items);
  renderHistory();
}

function updateHistoryOutcomes(minuteCandles) {
  const items = readHistory();
  let changed = false;

  for (const item of items) {
    if (item.result !== "PENDING" || !item.stop || !item.target) continue;

    const future = minuteCandles.filter(c => c.time.getTime() >= item.evaluationFrom);
    for (const c of future) {
      const hitStop = item.signal === "BUY" ? c.low <= item.stop : c.high >= item.stop;
      const hitTarget = item.signal === "BUY" ? c.high >= item.target : c.low <= item.target;

      if (hitStop && hitTarget) {
        item.result = "LOSS";
        item.closedAt = c.time.getTime();
        item.note = "Same 1m candle touched both; conservative LOSS";
        changed = true;
        break;
      }
      if (hitStop) {
        item.result = "LOSS";
        item.closedAt = c.time.getTime();
        changed = true;
        break;
      }
      if (hitTarget) {
        item.result = "WIN";
        item.closedAt = c.time.getTime();
        changed = true;
        break;
      }
    }

    if (item.result === "PENDING" && Date.now() - item.time > 24 * 60 * 60 * 1000) {
      item.result = "EXPIRED";
      changed = true;
    }
  }

  if (changed) {
    saveHistory(items);
    renderHistory();
  }
}

function exportHistoryCSV() {
  const items = readHistory();
  if (!items.length) {
    alert("Abhi export karne ke liye history nahi hai.");
    return;
  }

  const headers = ["DateTime", "Signal", "Entry", "Stop", "Target", "Result", "Note"];
  const lines = [headers.join(",")];

  for (const x of items) {
    const values = [
      new Date(x.time).toISOString(),
      x.signal,
      x.entry ?? "",
      x.stop ?? "",
      x.target ?? "",
      x.result ?? "",
      x.note ?? ""
    ];
    lines.push(values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gold-signal-history.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function getCandles(pair, resolution, days) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;

  const url =
    `${API}/candles?pair=${encodeURIComponent(pair)}` +
    `&resolution=${resolution}&from=${from}&to=${to}`;

  const r = await fetch(url, { cache: "no-store" });

  if (!r.ok) throw Error(`Candle API error (${r.status})`);

  const j = await r.json();

  if (j.s !== "ok" || !Array.isArray(j.data)) {
    throw Error(j.error || "Candle data nahi mila.");
  }

  return j.data
    .map(x => ({
      time: candleTime(x.time ?? x.timestamp),
      open: +x.open,
      high: +x.high,
      low: +x.low,
      close: +x.close,
      volume: +(x.volume || 0)
    }))
    .filter(x => [x.open, x.high, x.low, x.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

function aggregate(data, minutes) {
  const map = new Map();
  const ms = minutes * 60000;

  for (const c of data) {
    const k = Math.floor(c.time.getTime() / ms) * ms;

    if (!map.has(k)) {
      map.set(k, {
        time: new Date(k),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      });
    } else {
      const g = map.get(k);
      g.high = Math.max(g.high, c.high);
      g.low = Math.min(g.low, c.low);
      g.close = c.close;
      g.volume += c.volume;
    }
  }

  return [...map.values()];
}

function ema(a, n) {
  if (a.length < n) return NaN;
  const k = 2 / (n + 1);
  let v = a.slice(0, n).reduce((x, y) => x + y, 0) / n;

  for (let i = n; i < a.length; i++) v = a[i] * k + v * (1 - k);
  return v;
}

function rsi(a, n = 14) {
  if (a.length <= n) return NaN;

  let g = 0;
  let l = 0;

  for (let i = a.length - n; i < a.length; i++) {
    const d = a[i] - a[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }

  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

function atr(a, n = 14) {
  if (a.length <= n) return NaN;

  const t = [];
  for (let i = 1; i < a.length; i++) {
    const c = a[i];
    const p = a[i - 1].close;
    t.push(Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p)));
  }

  return t.slice(-n).reduce((x, y) => x + y, 0) / n;
}

function frame(tf, d) {
  const a = d.map(x => x.close);
  const p = a.at(-1);
  const e9 = ema(a, 9);
  const e21 = ema(a, 21);
  const e50 = ema(a, 50);
  const rr = rsi(a);

  let s = 0;
  if (e9 > e21) s++;
  else if (e9 < e21) s--;

  if (p > e50) s++;
  else if (p < e50) s--;

  if (rr >= 52) s++;
  else if (rr <= 48) s--;

  return {
    tf,
    signal: s >= 2 ? "BUY" : s <= -2 ? "SELL" : "WAIT",
    score: s,
    rsi: rr,
    close: p,
    atr: atr(d),
    count: d.length
  };
}

function clearLevels() {
  ["entry", "sl", "tp1", "tp2"].forEach(x => set(x, "—"));
}

async function analyze() {
  try {
    set("connection", "CONNECTING");
    const pair = $("pair").value;

    const [m1, m5, h1, d1] = await Promise.all([
      getCandles(pair, "1", 3),
      getCandles(pair, "5", 10),
      getCandles(pair, "60", 35),
      getCandles(pair, "1D", 220)
    ]);

    const fs = [
      frame("1m", m1),
      frame("5m", m5),
      frame("15m", aggregate(m5, 15)),
      frame("1H", h1),
      frame("4H", aggregate(h1, 240)),
      frame("1D", d1)
    ];

    const main = fs.find(x => x.tf === "5m");
    const higher = fs.filter(x => ["15m", "1H", "4H", "1D"].includes(x.tf));

    if (!main || main.count < 55 || higher.some(x => x.count < 55)) {
      throw Error("Kuch timeframes mein 55 se kam candles hain. Thodi der baad refresh karein.");
    }

    const buys = higher.filter(x => x.signal === "BUY").length;
    const sells = higher.filter(x => x.signal === "SELL").length;

    let final = "WAIT / NO TRADE";
    if (main.signal === "BUY" && buys >= 3 && sells === 0) final = "BUY SETUP";
    if (main.signal === "SELL" && sells >= 3 && buys === 0) final = "SELL SETUP";

    const price = m1.at(-1).close;
    set("price", fmt(price) + " USDT");
    set("updated", "Updated " + new Date().toLocaleTimeString() + " · Paper analysis only");
    set("connection", "LIVE DATA");
    if ($("connection")) $("connection").style.color = "#32c48d";

    set("finalSignal", final);
    if ($("finalSignal")) {
      $("finalSignal").className = "signal " +
        (final.startsWith("BUY") ? "buy" : final.startsWith("SELL") ? "sell" : "wait");
    }

    set("consensus", `${buys} BUY · ${sells} SELL`);
    set(
      "signalText",
      final === "WAIT / NO TRADE"
        ? "Timeframes agree nahi kar rahe. Trade skip karein."
        : "Technical conditions match hui hain. Yeh sirf experimental paper signal hai, live recommendation nahi."
    );

    clearLevels();
    set(
      "qty",
      "Position size disabled: futures multiplier, lot size, fees aur slippage verify nahi hain. Live order mein quantity use na karein."
    );

    if ($("tfbody")) {
      $("tfbody").innerHTML = fs.map(x => `
        <tr>
          <td>${escapeHtml(x.tf)}</td>
          <td>${escapeHtml(x.signal)}</td>
          <td>${fmt(x.score)}</td>
          <td>${fmt(x.rsi)}</td>
          <td>${fmt(x.close)}</td>
        </tr>
      `).join("");
    }

    set(
      "reasons",
      `5m: ${main.signal}, RSI ${fmt(main.rsi)}, score ${main.score}. Higher timeframes: ${buys} BUY, ${sells} SELL. Strategy ka historical backtest nahi hua.`
    );

    injectHistoryPanel();
    updateHistoryOutcomes(m1);

    const historySignal = final.startsWith("BUY") ? "BUY" :
      final.startsWith("SELL") ? "SELL" : "WAIT";

    recordSignal(historySignal, price, main.atr);

    if (
      final !== "WAIT / NO TRADE" &&
      final !== lastAlert &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification("Gold Signal Studio", {
        body: `${final} · ${fmt(price)} USDT · Paper signal only`
      });
      lastAlert = final;
    }

  } catch (e) {
    set("connection", "DATA ERROR");
    if ($("connection")) $("connection").style.color = "#ff6978";
    set("updated", e.message + " · Refresh karein.");
    set("finalSignal", "WAIT / NO TRADE");
    if ($("finalSignal")) $("finalSignal").className = "signal wait";
    set("consensus", "Data incomplete");
    set("signalText", "Data incomplete hone par signal nahi diya jayega.");

    if ($("tfbody")) {
      $("tfbody").innerHTML = '<tr><td colspan="5" class="muted">Data load nahi hua.</td></tr>';
    }

    set("reasons", e.message);
    clearLevels();
    set("qty", "Position size unavailable.");
    console.error(e);
  }
}

if ($("refreshBtn")) $("refreshBtn").addEventListener("click", analyze);

if ($("notifyBtn")) {
  $("notifyBtn").addEventListener("click", async () => {
    if (!("Notification" in window)) return alert("Notifications supported nahi hain.");
    const p = await Notification.requestPermission();
    alert(p === "granted" ? "Alerts enabled." : "Permission nahi mili.");
  });
}

if ($("refresh")) {
  $("refresh").addEventListener("change", () => {
    if (timer) clearInterval(timer);
    timer = setInterval(analyze, Math.max(15, +$("refresh").value || 15) * 1000);
  });
  $("refresh").dispatchEvent(new Event("change"));
}

if ($("installBtn")) {
  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    $("installBtn").classList.remove("hidden");
  });

  $("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("installBtn").classList.add("hidden");
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

analyze();
