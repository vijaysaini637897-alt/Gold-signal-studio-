GOLD SIGNAL STUDIO — ANDROID PWA

IMPORTANT:
Yeh ZIP app ka installable PWA source package hai. Android phone par install karne ke liye ise HTTPS website par host karna zaroori hai. ZIP ko seedha phone par kholne se PWA install nahi hoga.

HOST KARNE KA AASAN TAREEKA (GitHub Pages):
1. github.com par account banao/login karo.
2. New public repository banao, naam: gold-signal-studio
3. Is folder ke andar ki sabhi files repository ke root mein upload karo.
4. Repository Settings > Pages > Deploy from branch > main / root > Save.
5. GitHub Pages URL banne ke baad Android Chrome mein kholo.
6. Chrome menu (⋮) > Install app / Add to Home screen dabao.

APP:
- Public CoinDCX candle API ko browser se call karne ki koshish karta hai.
- 1m, 5m, 15m, 30m, 1H, 4H, 1D trend board.
- EMA, RSI, MACD, ATR heuristics.
- Entry, ATR stop-loss, T1/T2 indicative levels.
- Notification permission browser support ke mutabik.

LIMITATIONS / SAFETY:
- PWA offline shell cache karta hai; live prices ke liye internet chahiye.
- CoinDCX pair symbol/API/CORS access badal sakta hai. Agar DATA ERROR aaye to endpoint/pair ko official docs se update karna hoga.
- 1m data se 4H/1D candles banane ke liye 500 one-minute candles kaafi nahi hain; isliye higher timeframe history limited ho sakti hai aur board un timeframes ko tabhi dikhata hai jab enough candles hon. Production version mein timeframe-specific candle requests/WebSocket integration chahiye.
- Quantity estimate contract multiplier/lot-size verify kiye bina live order mein use na karein.
- Funding, spread, slippage, liquidation, fees/GST and exact FX conversion are not included.
- No login, no API keys, no order execution. Signals profit guarantee nahi karte.
