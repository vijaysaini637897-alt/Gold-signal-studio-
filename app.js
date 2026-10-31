const API="https://api.coindcx.com";
const $=id=>document.getElementById(id);
let timer=null,lastAlert="";
function fmt(x){return Number.isFinite(x)?x.toLocaleString("en-IN",{maximumFractionDigits:2}):"—"}
function candleTime(t){let n=Number(t);return new Date(n>1e11?n:n*1000)}
async function fetchCandles(pair){
 const url=`${API}/market_data/candles?pair=${encodeURIComponent(pair)}&interval=1m&limit=500`;
 const res=await fetch(url,{cache:"no-store"});
 if(!res.ok)throw new Error("API HTTP "+res.status);
 const j=await res.json();if(!Array.isArray(j)||!j.length)throw new Error("No candle data received");
 return j.map(x=>({time:candleTime(x.time??x.timestamp??x.t),open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+(x.volume??0)}))
 .filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
}
function aggregate(data,mins){let out=new Map();for(const c of data){let k=Math.floor(c.time.getTime()/(mins*60000));let a=out.get(k);if(!a)out.set(k,{time:new Date(k*mins*60000),open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume});else{a.high=Math.max(a.high,c.high);a.low=Math.min(a.low,c.low);a.close=c.close;a.volume+=c.volume}}return [...out.values()]}
function ema(vals,n){let k=2/(n+1),a=vals[0];return vals.map((v,i)=>a=i===0?v:v*k+a*(1-k))}
function calc(d){
 let cl=d.map(x=>x.close),e9=ema(cl,9),e21=ema(cl,21),e50=ema(cl,50);
 let gains=[],losses=[];for(let i=1;i<cl.length;i++){let z=cl[i]-cl[i-1];gains.push(Math.max(z,0));losses.push(Math.max(-z,0))}
 let ag=gains.slice(0,14).reduce((a,b)=>a+b,0)/14,al=losses.slice(0,14).reduce((a,b)=>a+b,0)/14;
 for(let i=14;i<gains.length;i++){ag=(ag*13+gains[i])/14;al=(al*13+losses[i])/14}
 let rsi=al===0?100:100-100/(1+ag/al);
 let trs=[];for(let i=0;i<d.length;i++){let p=i?d[i-1].close:d[i].close;trs.push(Math.max(d[i].high-d[i].low,Math.abs(d[i].high-p),Math.abs(d[i].low-p)))}
 let atr=trs.slice(-14).reduce((a,b)=>a+b,0)/Math.min(14,trs.length);
 let macd=ema(cl,12).map((v,i)=>v-ema(cl,26)[i]),ms=ema(macd,9),score=0,why=[];
 let n=d.length-1;
 if(cl[n]>e21[n]&&e21[n]>e50[n]){score+=2;why.push("Price EMA21 aur EMA50 ke upar");}
 else if(cl[n]<e21[n]&&e21[n]<e50[n]){score-=2;why.push("Price EMA21 aur EMA50 ke neeche");}
 else why.push("EMA trend mixed hai");
 if(e9[n]>e21[n]){score++;why.push("EMA9 > EMA21")}else{score--;why.push("EMA9 < EMA21")}
 if(macd[n]>ms[n]){score++;why.push("MACD bullish")}else{score--;why.push("MACD bearish")}
 if(rsi>50&&rsi<70){score++;why.push(`RSI ${rsi.toFixed(1)} bullish zone`)}else if(rsi>30&&rsi<50){score--;why.push(`RSI ${rsi.toFixed(1)} bearish zone`)}else why.push(`RSI ${rsi.toFixed(1)} caution zone`);
 return {signal:score>=3?"BUY":score<=-3?"SELL":"WAIT",score,rsi,atr,close:cl[n],ema9:e9[n],ema21:e21[n],ema50:e50[n],why};
}
function setText(id,v){$(id).textContent=v}
async function analyze(){
 try{
  setText("connection","CONNECTING");
  let pair=$("pair").value,raw=await fetchCandles(pair);
  if(raw.length<60)throw new Error("Indicators ke liye paryapt candles nahi mili.");
  let configs=[["1m",1],["5m",5],["15m",15],["30m",30],["1H",60],["4H",240],["1D",1440]];
  let analyses=[];
  for(let [tf,m] of configs){let d=m===1?raw:aggregate(raw,m);if(d.length>=55)analyses.push({tf,...calc(d)});}
  let a5=analyses.find(x=>x.tf==="5m");if(!a5)throw new Error("5m candles abhi available nahi.");
  let higher=analyses.filter(x=>["15m","30m","1H","4H","1D"].includes(x.tf));
  let nb=higher.filter(x=>x.signal==="BUY").length,ns=higher.filter(x=>x.signal==="SELL").length;
  let final=a5.signal==="BUY"&&nb>=3&&ns===0?"BUY SETUP":a5.signal==="SELL"&&ns>=3&&nb===0?"SELL SETUP":"WAIT / NO TRADE";
  let p=raw[raw.length-1].close;
  setText("price",fmt(p)+" USDT");setText("updated","Updated "+new Date().toLocaleTimeString()+" · Last candle "+raw[raw.length-1].time.toLocaleTimeString());
  setText("connection","LIVE DATA");
  $("connection").style.color="#32c48d";
  let fs=$("finalSignal");fs.textContent=final;fs.className="signal "+(final.startsWith("BUY")?"buy":final.startsWith("SELL")?"sell":"wait");
  setText("consensus",`${nb} bullish / ${ns} bearish higher TF`);
  setText("signalText",final==="WAIT / NO TRADE"?"Higher timeframe confirmation nahi mila. Abhi trade force mat karo.":"5m setup aur higher timeframe alignment mila. Candle close, spread aur contract rules manually verify karo.");
  let levels={entry:"—",sl:"—",tp1:"—",tp2:"—",qty:"Position size: —"};
  if(final!=="WAIT / NO TRADE"){
   let buy=final.startsWith("BUY"),entry=p,sl=buy?p-a5.atr*1.5:p+a5.atr*1.5,r=Math.abs(entry-sl),tp1=buy?entry+r:entry-r,tp2=buy?entry+2*r:entry-2*r;
   Object.assign(levels,{entry:fmt(entry),sl:fmt(sl),tp1:fmt(tp1),tp2:fmt(tp2)});
   let ru=Math.max(1,+$("risk").value||300),fx=Math.max(1,+$("fx").value||90),qty=(ru/fx)/r;
   levels.qty=`Indicative size ≈ ${qty.toFixed(5)} units (₹${ru} risk, assumed 1:1 price exposure). Contract multiplier verified nahi hai—live order ke liye use mat karo.`;
   if(lastAlert!==final&&"Notification"in window&&Notification.permission==="granted"){new Notification("Gold Signal Studio",{body:`${final} · Entry ${fmt(entry)} · SL ${fmt(sl)} · T2 ${fmt(tp2)}`});}
   lastAlert=final;
  } else lastAlert=final;
  for(let k of ["entry","sl","tp1","tp2"])setText(k,levels[k]);setText("qty",levels.qty);
  $("tfbody").innerHTML=analyses.map(x=>`<tr><td>${x.tf}</td><td class="${x.signal==="BUY"?"positive":x.signal==="SELL"?"negative":""}">${x.signal}</td><td>${x.score}</td><td>${x.rsi.toFixed(1)}</td><td>${fmt(x.close)}</td></tr>`).join("");
  $("reasons").innerHTML=analyses.map(x=>`<p><b>${x.tf}: ${x.signal} (score ${x.score})</b><br>${x.why.join(" · ")}</p>`).join("");
 }catch(e){setText("connection","DATA ERROR");$("connection").style.color="#ff6978";setText("updated",e.message+" · Refresh karke dobara try karein.");console.error(e)}
}
function schedule(){if(timer)clearInterval(timer);timer=setInterval(analyze,(+$("refresh").value||15)*1000)}
$("refreshBtn").addEventListener("click",analyze);$("refresh").addEventListener("change",schedule);
$("notifyBtn").addEventListener("click",async()=>{if(!("Notification"in window)){alert("Is browser mein notifications supported nahi hain.");return}let p=await Notification.requestPermission();alert(p==="granted"?"Alerts enabled.":"Notification permission nahi mili.")});
let deferred;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;$("installBtn").classList.remove("hidden")});
$("installBtn").addEventListener("click",async()=>{if(deferred){deferred.prompt();await deferred.userChoice;deferred=null;$("installBtn").classList.add("hidden")}});
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
analyze();schedule();
