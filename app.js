
const API = "https://gold-signal-api.vijaysaini637897.workers.dev";

const $ = id => document.getElementById(id);

let timer = null;
let lastAlert = "";

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

async function getCandles(pair, resolution, days) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;

  const url =
    `${API}/candles?pair=${encodeURIComponent(pair)}` +
    `&resolution=${resolution}&from=${from}&to=${to}`;

  const r = await fetch(url, { cache: "no-store" });

  if (!r.ok) {
    throw Error(`Candle API error (${r.status})`);
  }

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
    .filter(x =>
      [x.open, x.high, x.low, x.close].every(Number.isFinite)
    )
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

  for (let i = n; i < a.length; i++) {
    v = a[i] * k + v * (1 - k);
  }

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

    t.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - p),
        Math.abs(c.low - p)
      )
    );
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

    const higher = fs.filter(x =>
      ["15m", "1H", "4H", "1D"].includes(x.tf)
    );

    if (
      !main ||
      main.count < 55 ||
      higher.some(x => x.count < 55)
    ) {
      throw Error(
        "Kuch timeframes mein 55 se kam candles hain. Thodi der baad refresh karein."
      );
    }

    const buys = higher.filter(x => x.signal === "BUY").length;
    const sells = higher.filter(x => x.signal === "SELL").length;

    let final = "WAIT / NO TRADE";

    if (main.signal === "BUY" && buys >= 3 && sells === 0) {
      final = "BUY SETUP";
    }

    if (main.signal === "SELL" && sells >= 3 && buys === 0) {
      final = "SELL SETUP";
    }

    const price = m1.at(-1).close;

    set("price", fmt(price) + " USDT");

    set(
      "updated",
      "Updated " + new Date().toLocaleTimeString() +
      " · Paper analysis only"
    );

    set("connection", "LIVE DATA");
    $("connection").style.color = "#32c48d";

    set("finalSignal", final);

    $("finalSignal").className =
      "signal " +
      (final.startsWith("BUY")
        ? "buy"
        : final.startsWith("SELL")
          ? "sell"
          : "wait");

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

    $("tfbody").innerHTML = fs.map(x => `
      <tr>
        <td>${x.tf}</td>
        <td>${x.signal}</td>
        <td>${x.score}</td>
        <td>${fmt(x.rsi)}</td>
        <td>${fmt(x.close)}</td>
      </tr>
    `).join("");

    set(
      "reasons",
      `5m: ${main.signal}, RSI ${fmt(main.rsi)}, score ${main.score}. Higher timeframes: ${buys} BUY, ${sells} SELL. Strategy ka historical backtest nahi hua.`
    );

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
    $("connection").style.color = "#ff6978";

    set("updated", e.message + " · Refresh karein.");

    set("finalSignal", "WAIT / NO TRADE");
    $("finalSignal").className = "signal wait";

    set("consensus", "Data incomplete");

    set(
      "signalText",
      "Data incomplete hone par signal nahi diya jayega."
    );

    $("tfbody").innerHTML =
      '<tr><td colspan="5" class="muted">Data load nahi hua.</td></tr>';

    set("reasons", e.message);

    clearLevels();

    set("qty", "Position size unavailable.");

    console.error(e);
  }
}

$("refreshBtn").addEventListener("click", analyze);

$("notifyBtn").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    return alert("Notifications supported nahi hain.");
  }

  const p = await Notification.requestPermission();

  alert(
    p === "granted"
      ? "Alerts enabled."
      : "Permission nahi mili."
  );
});

$("refresh").addEventListener("change", () => {
  if (timer) clearInterval(timer);

  timer = setInterval(
    analyze,
    Math.max(15, +$("refresh").value || 15) * 1000
  );
});

$("refresh").dispatchEvent(new Event("change"));

analyze();

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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(console.error)
  );
   }
