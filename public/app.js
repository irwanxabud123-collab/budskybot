const app=document.querySelector('#app');
let wallet=null,walletProvider=null,data=null,filter='ALL',sort='score',searchQuery='',lastError='',pendingTrade=null,systemHealth=null,controlState=null,currency='USD',fxRate=16500,fxReady=false,tradeDraft={type:'MARKET',currency:'USD'},detailInterval=null,detailPriceInterval=null;
function base58Encode(bytes){const a='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let digits=[0];for(const byte of bytes){let carry=byte;for(let i=0;i<digits.length;i++){const n=digits[i]*256+carry;digits[i]=n%58;carry=Math.floor(n/58)}while(carry){digits.push(carry%58);carry=Math.floor(carry/58)}}let out='';for(let i=0;i<bytes.length&&bytes[i]===0;i++)out+='1';for(let i=digits.length-1;i>=0;i--)out+=a[digits[i]];return out}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>{n=Number(n||0);return n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(n<1?5:2)};
function filtered(){const q=searchQuery.trim().toLowerCase();let xs=(data?.opportunities||[]).filter(x=>filter==='ALL'||x.category===filter).filter(x=>!q||[x.symbol,x.name,x.mint,x.category].some(v=>String(v||'').toLowerCase().includes(q)));if(sort==='score')xs.sort((a,b)=>b.opportunityScore-a.opportunityScore);if(sort==='risk')xs.sort((a,b)=>a.riskScore-b.riskScore);return xs.slice(0,50)}
function setSearch(v){searchQuery=String(v||'');render();requestAnimationFrame(()=>{const el=document.querySelector('#marketSearch');if(el){el.focus();try{el.setSelectionRange(el.value.length,el.value.length)}catch{}}})}
function fmtCurrency(usd){const n=Number(usd||0);if(currency==='IDR'){const v=n*fxRate;return 'Rp '+v.toLocaleString('id-ID',{maximumFractionDigits:v<1000?2:0})}return money(n)}
async function loadFxRate(){try{const r=await fetch('https://open.er-api.com/v6/latest/USD',{cache:'no-store'});const j=await r.json();const rate=Number(j?.rates?.IDR);if(rate>1000&&rate<100000){fxRate=rate;fxReady=true;render();return}}catch{}fxReady=true;render()}
function openDrawer(){
 if(document.querySelector('#navDrawer'))return;
 document.body.insertAdjacentHTML('beforeend',`<div class="drawer-backdrop" id="navDrawer" data-action="closeDrawer"><aside class="nav-drawer"><div class="drawer-head"><div class="brand-mini"><img src="/budsky-logo.jpg"><div><strong>BUDSKY</strong><small>COMMAND MENU</small></div></div><button class="close" data-action="closeDrawer">×</button></div><div class="drawer-status"><span>MODE</span><b>${paperMode()?'🟢 PAPER':'🔴 LIVE WALLET'}</b></div><div class="drawer-nav">
 <button class="drawer-item active" data-action="closeDrawer"><span>◈</span><div><b>Market Scanner</b><small>Live opportunities</small></div></button>
 <div class="drawer-label">DISCOVER</div>
 <button class="drawer-item" data-action="discovery" data-view="PULSE"><span>✦</span><div><b>Pulse</b><small>Market overview</small></div></button>
 <button class="drawer-item" data-action="discovery" data-view="DISCOVER"><span>⌁</span><div><b>Discover</b><small>Token discovery</small></div></button>
 <button class="drawer-item" data-action="discovery" data-view="TRENDING"><span>↗</span><div><b>Trending</b><small>Top momentum</small></div></button>
 <button class="drawer-item" data-action="discovery" data-view="SMART_MONEY"><span>◉</span><div><b>Smart Money</b><small>Trader intelligence</small></div></button>
 <button class="drawer-item" data-action="discovery" data-view="ALPHASCAN"><span>⌖</span><div><b>AlphaScan</b><small>Highest conviction</small></div></button>
 <button class="drawer-item" data-action="discovery" data-view="WATCHLIST"><span>☆</span><div><b>Watchlist</b><small>Saved markets</small></div></button>
 <div class="drawer-label">MANAGE</div>
 <button class="drawer-item" data-action="openPortfolio"><span>◉</span><div><b>Portfolio</b><small>Balance & exposure</small></div></button>
 <button class="drawer-item" data-action="positionsInfo"><span>↗</span><div><b>Positions</b><small>Open & close trades</small></div></button>
 <div class="drawer-label">TOOLS</div>
 <button class="drawer-item" data-action="backtestInfo"><span>⌁</span><div><b>Backtest</b><small>Research & replay</small></div></button>
 <button class="drawer-item" data-action="openControl"><span>⚙</span><div><b>Control</b><small>PAPER / LIVE WALLET</small></div></button>
 </div><div class="drawer-tools"><button data-action="quickTrade">⌁ Quick Trade</button><button data-action="currency" data-currency="${currency==='USD'?'IDR':'USD'}">Switch to ${currency==='USD'?'Rupiah':'USD'}</button></div><div class="drawer-foot">Dashboard dibuat compact seperti terminal trading: 6 market utama terlihat sekaligus di desktop.</div></aside></div>`);
}
function closeDrawer(){document.querySelector('#navDrawer')?.remove()}
function quickTrade(){const x=filtered()[0];if(x)openTrade(x.mint);else alert('Belum ada market yang tersedia.');}
function processPaperOrders(){
 try{
  const orders=JSON.parse(localStorage.getItem('budsky.paper.orders')||'[]'); if(!orders.length||!data?.opportunities?.length)return;
  let changed=false; const remaining=[];
  for(const o of orders){const x=data.opportunities.find(v=>v.mint===o.mint); const price=Number(x?.priceUsd||0); const target=Number(o.limitPrice||0);
   if(o.status==='WAITING'&&price>0&&target>0&&price<=target){const positions=getPaperPositions();if(!positions.some(p=>p.mint===o.mint)){const qty=o.amountUsd/price;positions.push({...o,id:`paper-${Date.now()}`,entryPriceUsd:price,quantity:qty,status:'OPEN'});setPaperPositions(positions);changed=true;continue}}
   remaining.push(o);
  }
  if(changed)localStorage.setItem('budsky.paper.orders',JSON.stringify(remaining));
 }catch{}
}
function render(){
 const xs=filtered(); const top=xs[0];
 const fx=currency==='IDR'?fxRate:1;
 app.innerHTML=`<div class="app-shell"><main class="main compact-main">
 <header class="compact-topbar"><div class="top-left"><button class="menu-trigger" data-action="openDrawer">☰ <span>MENU</span></button><div class="brand-mini"><img src="/budsky-logo.jpg"><div><strong>BUDSKY</strong><small>TRADING TERMINAL</small></div></div><div class="market-ticker"><span>SOL ${money(top?.priceUsd||0)}</span><span>JUP LIVE</span><span>${data?.universeSize||0} MARKETS</span></div></div>
 <div class="top-actions"><div class="currency-switch"><button class="${currency==='USD'?'selected':''}" data-action="currency" data-currency="USD">USD</button><button class="${currency==='IDR'?'selected':''}" data-action="currency" data-currency="IDR">IDR</button></div><button class="control-pill" data-action="openControl">${controlState?.mode==='LIVE'&&controlState?.liveEnabled?'🔴 LIVE':'🟢 PAPER'}</button><button id="wallet" class="wallet">${wallet?wallet.slice(0,4)+'…'+wallet.slice(-4):'Connect'}</button></div></header>
 <section class="dashboard-hero"><div><div class="eyebrow">BUDSKY · MARKET PULSE</div><h1>Six markets. One compact command center.</h1><p>Jelajahi market tanpa halaman panjang. Gunakan search, filter, currency USD/IDR, lalu buka Market / Limit / DCA dari token yang dipilih.</p></div><div class="hero-actions"><button class="primary" data-action="quickTrade">⌁ Quick Trade</button><button class="ghost" data-action="openControl">⚙ Control</button></div></section>
 <div class="dashboard-tools"><div class="search-box"><span>⌕</span><input id="marketSearch" value="${esc(searchQuery)}" placeholder="Cari BTC, SOL, WBTC, nama atau mint…" autocomplete="off" spellcheck="false"></div><button class="quick-btn ${sort==='score'&&!searchQuery?'active':''}" data-action="sort-score">TOP</button><button class="quick-btn ${sort==='risk'?'active':''}" data-action="sort-risk">LOW RISK</button><span class="tool-note">${filtered().length} match · refresh 20s · ${currency} ${currency==='IDR'?'≈ Rp'+Number(fxRate).toLocaleString('id-ID')+'/USD':''}</span></div>
 <div class="market-section-head"><div><h2>Live Markets</h2><p>6 market utama ditampilkan sekaligus di desktop. Scroll hanya di dalam area market.</p></div><div class="tabs compact-tabs">${['ALL','LARGE_CAP','ALTCOIN','MEME','OTHER'].map(x=>`<button class="${filter===x?'active':''}" data-action="filter" data-filter="${x}">${x.replace('_',' ')}</button>`).join('')}</div></div>
 <section class="market-grid">${xs.slice(0,6).map((x,i)=>card(x,i)).join('')}</section>
 <div class="dashboard-footer"><span>Market source: Jupiter Tokens API V2</span><span>TA: GeckoTerminal 15m OHLCV · Probability only when calibrated</span><span>${data?new Date(data.updatedAtMs).toLocaleTimeString():'connecting'}</span></div>
 </main><div id="drawerRoot"></div><nav class="bottom"><button class="active">◈<br>Markets</button><button data-action="openPortfolio">◉<br>Portfolio</button><button data-action="positionsInfo">↗<br>Positions</button><button data-action="backtestInfo">⌁<br>Backtest</button></nav></div>`;
 document.querySelector('#wallet')?.addEventListener('click',connectWallet);
 if(currency==='IDR'&&!fxReady)loadFxRate();
}
function card(x,i){
 const status=x.status==='CANDIDATE'?'candidate':x.status==='AVOID'?'avoid':'';
 const p=Number(x.priceUsd||0); const display=fmtCurrency(p); const change=Number(x.change24h||0);
 return `<article class="card market-card ${status}" data-action="tokenDetail" data-mint="${esc(x.mint)}"><div class="rank">#${i+1}</div><div class="token"><div class="coin">${x.icon?`<img src="${esc(x.icon)}" data-action="hide-image">`:esc((x.symbol||'?')[0])}</div><div><h3>${esc(x.symbol)} <small>${esc(x.name)}</small></h3><p>${esc(String(x.category||'OTHER').replace('_',' '))} · ${money(x.liquidityUsd)} liq.</p></div></div><div class="market-price"><b>${display}</b><span class="${change>=0?'up':'down'}">${change>=0?'+':''}${change.toFixed(2)}%</span></div><div class="score-row"><span>OPPORTUNITY <b>${x.opportunityScore}</b></span><span>RISK <b>${x.riskScore}</b></span></div><div class="bar"><i style="width:${x.opportunityScore}%"></i></div><div class="metrics compact-metrics"><div class="metric"><span>TA</span><b>${typeof x.technicalScore==='number'?x.technicalScore:(x.technicalProvenance==='ON_DEMAND'?'LIVE':'—')}</b></div><div class="metric"><span>QUALITY</span><b>${x.marketScore===null?'—':x.marketScore}</b></div><div class="metric"><span>24H VOL</span><b>${x.volume24hUsd==null?'N/A':money(x.volume24hUsd)}</b></div><div class="metric"><span>LIQ</span><b>${money(x.liquidityUsd||0)}</b></div></div><div class="actions compact-actions"><button class="ghost" data-action="tokenDetail" data-mint="${esc(x.mint)}">Analysis</button><button class="primary" data-action="trade" data-mint="${esc(x.mint)}">Trade</button></div></article>`}

const priceHistory=new Map();
const candleHistory=new Map();
let liveChartInterval=null,liveChartMint=null,liveCandleAnimation=null;
const LIVE_POINT_LIMIT=120;
function drawCandleChart(mint){
  const canvas=document.querySelector('#liveChart');
  const candles=candleHistory.get(mint)||[];
  if(!canvas||!candles.length)return;
  const rect=canvas.getBoundingClientRect(); const dpr=window.devicePixelRatio||1;
  const w=Math.max(320,Math.floor(rect.width||640)), h=Math.max(180,Math.floor(rect.height||220));
  if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);}
  const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  const pad={l:12,r:58,t:10,b:22}; const plotW=w-pad.l-pad.r, plotH=h-pad.t-pad.b;
  const vis=candles.slice(-72); const highs=vis.map(c=>Number(c.high)), lows=vis.map(c=>Number(c.low));
  let hi=Math.max(...highs), lo=Math.min(...lows); if(!Number.isFinite(hi)||!Number.isFinite(lo))return;
  const span=hi-lo||Math.max(hi*0.002,0.000001); hi+=span*.06; lo-=span*.06;
  const y=v=>pad.t+(hi-v)/(hi-lo)*plotH;
  ctx.font='10px Inter, sans-serif'; ctx.strokeStyle='rgba(135,105,160,.16)'; ctx.fillStyle='#786a82'; ctx.lineWidth=1;
  for(let i=0;i<5;i++){const yy=pad.t+i*plotH/4;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(pad.l+plotW,yy);ctx.stroke();const val=hi-(hi-lo)*i/4;ctx.fillText('$'+(val<1?val.toFixed(6):val.toFixed(2)),w-pad.r+7,yy+3);}
  const step=plotW/vis.length, bodyW=Math.max(3,Math.min(10,step*.62));
  vis.forEach((c,i)=>{const x=pad.l+step*i+step/2, o=Number(c.open), cl=Number(c.close), hh=Number(c.high), ll=Number(c.low), rising=cl>=o;
    ctx.strokeStyle=rising?'#56e6ad':'#ff708f'; ctx.fillStyle=rising?'rgba(86,230,173,.78)':'rgba(255,112,143,.78)'; ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(x,y(hh));ctx.lineTo(x,y(ll));ctx.stroke();
    const top=y(Math.max(o,cl)), bottom=y(Math.min(o,cl));ctx.fillRect(x-bodyW/2,top,bodyW,Math.max(2,bottom-top));
  });
  const last=vis.at(-1); const lastPrice=Number(last.close); const yy=y(lastPrice); ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(194,139,255,.55)';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(pad.l+plotW,yy);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#c28bff';ctx.fillRect(w-pad.r+4,yy-9,pad.r-8,18);ctx.fillStyle='#100718';ctx.font='700 9px Inter,sans-serif';ctx.fillText('$'+(lastPrice<1?lastPrice.toFixed(6):lastPrice.toFixed(2)),w-pad.r+8,yy+3);
  ctx.fillStyle='#66586f';ctx.font='9px Inter,sans-serif';ctx.fillText('15m OHLCV · live refresh',pad.l,h-5);
  const last1=document.querySelector('#liveChartPrice'); if(last1&&Number.isFinite(lastPrice))last1.textContent='$'+(lastPrice<1?lastPrice.toFixed(6):lastPrice.toFixed(2));
}
function updateLastCandlePrice(mint,price){const candles=candleHistory.get(mint)||[];if(!candles.length||price==null)return;const c=candles[candles.length-1];c.close=Number(price);c.high=Math.max(Number(c.high),Number(price));c.low=Math.min(Number(c.low),Number(price));drawCandleChart(mint);}
async function pollLivePrice(mint){
  try{const r=await fetch(`/api/price?ids=${encodeURIComponent(mint)}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'PRICE_POLL_FAILED');const row=j.prices?.[mint];if(!row||row.usdPrice==null)return;const hist=priceHistory.get(mint)||[];hist.push({t:j.updatedAtMs,price:row.usdPrice});while(hist.length>LIVE_POINT_LIMIT)hist.shift();priceHistory.set(mint,hist);updateLastCandlePrice(mint,row.usdPrice);}catch(e){console.error('live price poll failed',e)}
}
async function pollLiveCandles(mint){
  try{const r=await fetch(`/api/technical?mint=${encodeURIComponent(mint)}`,{cache:'no-store'});const j=await r.json();if(!r.ok||!Array.isArray(j.candles)||!j.candles.length)return;candleHistory.set(mint,j.candles.slice(-120).map(c=>({...c,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})));drawCandleChart(mint);}catch(e){console.error('live candle refresh failed',e)}
}
function startLiveChart(mint,seedPrice){
  stopLiveChart(); liveChartMint=mint;
  if(seedPrice!=null)priceHistory.set(mint,[{t:Date.now(),price:seedPrice}]);
  pollLiveCandles(mint); pollLivePrice(mint);
  liveChartInterval=setInterval(()=>{pollLiveCandles(mint);pollLivePrice(mint)},15000);
  liveCandleAnimation=requestAnimationFrame(()=>drawCandleChart(mint));
}
function stopLiveChart(){if(liveChartInterval){clearInterval(liveChartInterval);liveChartInterval=null}if(liveCandleAnimation){cancelAnimationFrame(liveCandleAnimation);liveCandleAnimation=null}liveChartMint=null}
async function load(){try{const h=await fetch('/api/health',{cache:'no-store'});systemHealth=await h.json();try{const cr=await fetch('/api/control',{credentials:'include',cache:'no-store'});const cj=await cr.json();if(cr.ok)controlState=cj.control;}catch{} const r=await fetch('/api/markets',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'MARKET_SCAN_FAILED');data=j;lastError='';processPaperOrders();render()}catch(e){lastError=e.message;renderError(e.message)}}
function renderError(msg){app.innerHTML=`<div class="shell"><main class="main"><div class="error"><img src="/budsky-logo.jpg" style="width:75px;border-radius:22px"><h2>Budsky is waiting for live market data</h2><p>${esc(msg)}</p><button class="wallet" data-action="load">Retry</button></div></main></div>`}
async function connectWallet(){
  let stage='wallet provider';
  try{
    const candidates=[window.phantom?.solana,window.solflare,window.solana].filter(Boolean);
    const p=candidates.find(x=>x.isPhantom)||candidates.find(x=>x.isSolflare)||candidates[0];
    if(!p){alert('Phantom atau Solflare tidak ditemukan. Pasang/aktifkan salah satunya lalu coba lagi.');return}
    if(typeof p.connect!=='function') throw new Error('WALLET_CONNECT_UNAVAILABLE');
    walletProvider=p;
    stage='connect wallet';
    const r=await p.connect();
    wallet=r?.publicKey?.toString?.()||r?.publicKey?.toBase58?.()||p.publicKey?.toString?.()||p.publicKey?.toBase58?.();
    if(!wallet) throw new Error('WALLET_PUBLIC_KEY_UNAVAILABLE');
    stage='request authentication challenge';
    const ch=await fetch('/api/wallet-challenge',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});
    const ct=ch.headers.get('content-type')||'';
    const cj=ct.includes('application/json')?await ch.json():{error:`WALLET_CHALLENGE_HTTP_${ch.status}`};
    if(!ch.ok||!cj.message) throw new Error(cj.error||`WALLET_CHALLENGE_HTTP_${ch.status}`);
    if(typeof p.signMessage!=='function') throw new Error('WALLET_MESSAGE_SIGNING_UNAVAILABLE');
    stage='sign authentication message';
    const encoded=new TextEncoder().encode(cj.message);
    let signedResult;
    try { signedResult=await p.signMessage(encoded,'utf8'); }
    catch (firstError) {
      if (p.isPhantom || p.isSolflare) throw firstError;
      signedResult=await p.signMessage(encoded);
    }
    const rawSignature=signedResult?.signature ?? signedResult;
    const signed=rawSignature instanceof Uint8Array ? rawSignature : (rawSignature ? new Uint8Array(rawSignature) : null);
    if(!signed||signed.length!==64) throw new Error('WALLET_SIGNATURE_FORMAT_INVALID');
    stage='verify wallet authentication';
    const vr=await fetch('/api/wallet-verify',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({wallet,message:cj.message,signature:base58Encode(signed)})});
    const vt=vr.headers.get('content-type')||'';
    const vj=vt.includes('application/json')?await vr.json():{error:`WALLET_VERIFY_HTTP_${vr.status}`};
    if(!vr.ok) throw new Error(vj.error||`WALLET_VERIFY_HTTP_${vr.status}`);
    render();
  }catch(e){
    console.error('Budsky wallet authentication error',{stage,error:e});
    const raw=(e&&typeof e==='object')?e:null;
    const detail=e instanceof Error?e.message:(raw?JSON.stringify(raw):String(e));
    wallet=null;walletProvider=null;
    alert(`Wallet authentication gagal pada tahap ${stage}: ${detail}`);
  }
}

function getWatchlist(){try{return JSON.parse(localStorage.getItem('budsky.watchlist')||'[]')}catch{return []}}
function setWatchlist(v){localStorage.setItem('budsky.watchlist',JSON.stringify(v))}
function isWatched(mint){return getWatchlist().includes(mint)}
function toggleWatch(mint){const a=getWatchlist();const next=a.includes(mint)?a.filter(x=>x!==mint):[...a,mint].slice(-100);setWatchlist(next);const btn=document.querySelector('.detail-watch');if(btn&&document.querySelector('#modal')){btn.textContent=next.includes(mint)?'★ In Watchlist':'☆ Add to Watchlist';return}renderDiscovery('WATCHLIST')}
function discoveryRows(kind){const d=data?.discovery||{}; if(kind==='TRENDING')return d.trending||[]; if(kind==='SMART_MONEY')return d.traded||[]; if(kind==='DISCOVER')return d.organic||[]; return filtered()}
function discoveryToken(row){return data?.opportunities?.find(o=>o.mint===row?.id)||null}
function openDiscovery(view='PULSE'){
 closeDrawer(); renderDiscovery(view);
}
function renderDiscovery(view='PULSE'){
 const rows=discoveryRows(view); const opp=data?.opportunities||[]; const watched=getWatchlist();
 let body='';
 if(view==='PULSE') body=`<div class="discovery-stats"><div class="analysis-box"><span>MARKETS</span><b>${data?.universeSize||0}</b></div><div class="analysis-box"><span>TOP SCORE</span><b>${opp[0]?.opportunityScore??'—'}</b></div><div class="analysis-box"><span>WATCHLIST</span><b>${watched.length}</b></div><div class="analysis-box"><span>MODE</span><b>${paperMode()?'PAPER':'LIVE'}</b></div></div><div class="discovery-grid">${opp.slice(0,9).map((x,i)=>discoveryCard(x,i)).join('')}</div>`;
 else if(view==='WATCHLIST'){
   const ws=watched.map(m=>opp.find(x=>x.mint===m)).filter(Boolean); body=ws.length?`<div class="discovery-grid">${ws.map((x,i)=>discoveryCard(x,i,true)).join('')}</div>`:`<div class="empty-state"><b>Watchlist masih kosong</b><span>Tambahkan token dari Market Scanner atau halaman ini.</span></div>`;
 } else if(view==='SMART_MONEY') body=`<div class="notice smart-note"><b>Smart Money source</b><br>Data wallet-level P/L, win rate, dan influencer ranking belum tersedia dari endpoint market saat ini. Budsky tidak mengarang wallet activity. Tab ini menggunakan <b>top traded 1h</b> sebagai market-activity proxy sampai feed wallet analytics terhubung.</div><div class="discovery-table">${rows.slice(0,20).map((r,i)=>{const x=discoveryToken(r);return `<div class="discovery-row"><span>#${i+1}</span><b>${esc(r?.symbol||x?.symbol||'—')}</b><span>${money(Number(r?.volume24h||r?.daily_volume||x?.volume24hUsd||0))}</span><span>${x?((Number(x.change24h||0)>=0?'+':'')+Number(x.change24h||0).toFixed(2)+'%'):'Market activity'}</span><button class="ghost" data-action="tokenDetail" data-mint="${esc(x?.mint||r?.id||'')}">Open</button></div>`}).join('')}</div>`;
 else { const title=view==='TRENDING'?'Trending':'Discover'; body=`<div class="discovery-table">${rows.slice(0,25).map((r,i)=>{const x=discoveryToken(r);const mint=x?.mint||r?.id||'';const sym=x?.symbol||r?.symbol||'—';const price=x?.priceUsd??Number(r?.usdPrice||r?.priceUsd||0);const ch=x?.change24h??Number(r?.stats24h?.priceChange||0);return `<div class="discovery-row"><span>#${i+1}</span><b>${esc(sym)}</b><span>${fmtCurrency(price)}</span><span class="${Number(ch)>=0?'up':'down'}">${Number(ch)>=0?'+':''}${Number(ch||0).toFixed(2)}%</span><span>MC ${x?.marketCapUsd==null&&r?.marketCap==null?'N/A':money(Number(x?.marketCapUsd??r?.marketCap))}</span><span>Vol ${x?.volume24hUsd==null&&r?.volume24h==null?'N/A':money(Number(x?.volume24hUsd??r?.volume24h))}</span><button class="ghost" data-action="watch" data-mint="${esc(mint)}">${isWatched(mint)?'★':'☆'}</button><button class="primary" data-action="tokenDetail" data-mint="${esc(mint)}">Trade</button></div>`}).join('')}</div>`; if(!rows.length) body='<div class="empty-state">Belum ada data discovery.</div>'; body=`<div class="notice">${title} menggunakan data live dari Jupiter Tokens API V2. Klik token untuk masuk ke flow trading Budsky.</div>${body}`; }
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="discoveryModal"><div class="dialog discovery-dialog"><div class="dialog-head"><div><div class="eyebrow">MARKET DISCOVERY</div><h2>${view==='SMART_MONEY'?'Smart Money':view==='ALPHASCAN'?'AlphaScan':view==='WATCHLIST'?'Watchlist':view==='TRENDING'?'Trending':view==='DISCOVER'?'Discover':'Pulse'}</h2><div style="color:#786a82;font-size:9px">Compact market intelligence · ${data?.source||'Jupiter'}</div></div><button class="close" data-action="closeDiscovery">×</button></div><div class="discovery-tabs">${['PULSE','DISCOVER','TRENDING','SMART_MONEY','ALPHASCAN','WATCHLIST'].map(v=>`<button class="${v===view?'selected':''}" data-action="discovery" data-view="${v}">${v.replace('_',' ')}</button>`).join('')}</div>${view==='ALPHASCAN'?`<div class="discovery-grid">${opp.slice().sort((a,b)=>b.opportunityScore-a.opportunityScore).slice(0,12).map((x,i)=>discoveryCard(x,i)).join('')}</div>`:body}</div></div>`);
}
function discoveryCard(x,i,watchOnly=false){const watched=isWatched(x.mint);return `<article class="discovery-card" data-action="tokenDetail" data-mint="${esc(x.mint)}"><div class="discovery-card-head"><span>#${i+1}</span><button class="star-btn" data-action="watch" data-mint="${esc(x.mint)}">${watched?'★':'☆'}</button></div><div class="token"><div class="coin">${x.icon?`<img src="${esc(x.icon)}">`:esc((x.symbol||'?')[0])}</div><div><h3>${esc(x.symbol)} <small>${esc(x.name)}</small></h3><p>${esc(String(x.category||'OTHER').replace('_',' '))}</p></div></div><div class="market-price"><b>${fmtCurrency(x.priceUsd)}</b><span class="${Number(x.change24h)>=0?'up':'down'}">${Number(x.change24h)>=0?'+':''}${Number(x.change24h||0).toFixed(2)}%</span></div><div class="compact-metrics metrics"><div class="metric"><span>MC</span><b>${x.marketCapUsd==null?'N/A':money(x.marketCapUsd)}</b></div><div class="metric"><span>VOL</span><b>${x.volume24hUsd==null?'N/A':money(x.volume24hUsd)}</b></div><div class="metric"><span>LIQ</span><b>${money(x.liquidityUsd||0)}</b></div><div class="metric"><span>SCORE</span><b>${x.opportunityScore}</b></div></div><div class="actions compact-actions"><button class="ghost" data-action="tokenDetail" data-mint="${esc(x.mint)}">Analysis</button><button class="primary" data-action="discoveryTrade" data-mint="${esc(x.mint)}">Trade</button></div></article>`}
async function openControl(){
  try{
    const r=await fetch('/api/control',{credentials:'include',cache:'no-store'});const j=await r.json();
    if(!r.ok) throw new Error(j.error||'CONTROL_UNAVAILABLE'); controlState=j.control;
    document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="controlModal"><div class="dialog control-dialog"><div class="dialog-head"><div><div class="eyebrow">CONTROL CENTER</div><h2>Budsky operating mode</h2><p>Choose PAPER for simulation or LIVE WALLET for real execution. This switch is in-app; you do not edit source files.</p></div><button class="close" data-action="closeControl">×</button></div><div class="mode-card ${controlState.mode==='LIVE'?'live':'paper'}"><div><span class="mode-label">CURRENT MODE</span><strong>${controlState.mode==='LIVE'&&controlState.liveEnabled?'LIVE WALLET ACTIVE':'PAPER / SIMULATION'}</strong><small>${controlState.emergencyStop?'Emergency stop is active.':(j.persistenceOk===false?'Persistence unavailable — LIVE remains locked.':'Operational state is stored durably.')}</small></div><div class="mode-switch"><button class="${controlState.mode==='PAPER'?'selected':''}" data-action="control" data-control="SET_PAPER">🟢 PAPER</button><button class="${controlState.mode==='LIVE'?'selected':''}" data-action="control" data-control="ACTIVATE_LIVE">🔴 LIVE WALLET</button></div></div><div class="control-grid"><div><span>LIVE availability</span><b>${j.baseMode==='LIVE'&&j.baseLiveEnabled?'READY':'LOCKED'}</b></div><div><span>Emergency stop</span><b>${controlState.emergencyStop?'ACTIVE':'OFF'}</b></div><div><span>Control version</span><b>${controlState.version}</b></div><div><span>Last change</span><b>${new Date(controlState.updatedAtMs).toLocaleString()}</b></div></div><div class="control-warning">${j.baseMode==='LIVE'&&j.baseLiveEnabled?'LIVE WALLET is available from this screen. You still must connect/authenticate a wallet and pass every server-side safety gate.':'LIVE WALLET is not armed at the deployment level yet. PAPER remains fully usable; once the one-time server gate is enabled, you can switch modes here without editing source files.'}</div><div class="control-warning">${j.persistenceOk===false?`Control persistence error: ${esc(j.controlError||'unknown')}. PAPER fallback is active.`:''}</div><div class="control-warning">LIVE activation never bypasses server-side risk, transaction, signer, reconciliation, or safety gates. Emergency stop always disables new LIVE entries.</div><div class="actions"><button class="ghost" data-action="control" data-control="DEACTIVATE_LIVE">Return to PAPER</button><button class="danger" data-action="control" data-control="EMERGENCY_STOP">🛑 EMERGENCY STOP</button>${controlState.emergencyStop?`<button class="ghost" data-action="control" data-control="CLEAR_EMERGENCY_STOP">Clear Emergency Stop</button>`:''}</div></div></div>`);
  }catch(e){alert(`Control Center unavailable: ${e.message}`)}
}
async function setControl(action){
  const needsWallet=action==='ACTIVATE_LIVE'||action==='EMERGENCY_STOP'||action==='CLEAR_EMERGENCY_STOP';
  if(needsWallet&&!wallet){alert('Connect and authenticate your wallet first.');return;}
  const messages={ACTIVATE_LIVE:'ACTIVATE LIVE WALLET? This arms real-money execution only after every server safety gate passes.',DEACTIVATE_LIVE:'Return to PAPER mode?',SET_PAPER:'Switch to PAPER mode?',EMERGENCY_STOP:'EMERGENCY STOP: block LIVE immediately?',CLEAR_EMERGENCY_STOP:'Clear emergency stop?'};
  if(!confirm(messages[action]||'Confirm change?'))return;
  try{const r=await fetch('/api/control',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({action,...(wallet?{wallet}:{})})});const j=await r.json();if(!r.ok)throw new Error(j.detail||j.error||'CONTROL_CHANGE_FAILED');controlState=j.control;closeControl();render();if(action==='ACTIVATE_LIVE')alert('LIVE WALLET is now armed. Real execution still requires wallet signatures and every server-side safety gate.');else if(action==='EMERGENCY_STOP')alert('Emergency stop is ACTIVE. New LIVE entries are blocked.');else if(action==='SET_PAPER'||action==='DEACTIVATE_LIVE')alert('PAPER mode is active. No real-money execution will be attempted.');}catch(e){alert(`Control change failed: ${e.message}`)}}
function closeControl(){document.querySelector('#controlModal')?.remove()}
async function showTokenDetail(mint){
 const x=data?.opportunities?.find(o=>o.mint===mint); if(!x){alert('Token market data is no longer available. Refresh market data and try again.');return}
 stopLiveChart();
 const fmt=v=>v==null?'N/A':fmtCurrency(v); const pct=v=>v==null?'N/A':`${Number(v)>=0?'+':''}${Number(v).toFixed(2)}%`;
 const buy=x.buyVolume24hUsd, sell=x.sellVolume24hUsd, net=x.netVolume24hUsd;
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog token-detail-dialog"><div class="dialog-head"><div class="token-detail-title"><div class="coin big">${x.icon?`<img src="${esc(x.icon)}">`:esc((x.symbol||'?')[0])}</div><div><div class="eyebrow">TOKEN DETAIL · LIVE MARKET ANALYSIS</div><h2>${esc(x.name)} <span>${esc(x.symbol)}</span></h2><div class="token-mint">${esc(x.mint)}</div></div></div><button class="close" data-action="closeModal">×</button></div>
 <div class="token-header-stats"><div><span>PRICE</span><b id="detailPrice">${fmtCurrency(x.priceUsd)}</b><em id="detailChange" class="${Number(x.change24h)>=0?'up':'down'}">${pct(x.change24h)}</em></div><div><span>MARKET CAP</span><b id="detailMcap">${fmt(x.marketCapUsd)}</b></div><div><span>FDV</span><b id="detailFdv">${fmt(x.fdvUsd)}</b></div><div><span>LIQUIDITY</span><b id="detailLiq">${fmt(x.liquidityUsd)}</b></div><div><span>HOLDERS</span><b>${x.holders==null?'N/A':Number(x.holders).toLocaleString('en-US')}</b></div><div><span>24H VOLUME</span><b id="detailVol">${fmt(x.volume24hUsd)}</b></div><div><span>BUY</span><b>${fmt(buy)}</b></div><div><span>SELL</span><b>${fmt(sell)}</b></div><div><span>NET FLOW</span><b class="${net==null?'':net>=0?'up':'down'}">${fmt(net)}</b></div></div>
 <div class="token-detail-main"><section class="token-chart-panel"><div class="detail-toolbar"><div><b>Market Chart</b><small id="detailChartStatus">Loading real OHLCV…</small></div><div class="timeframe-tabs">${['1m','5m','15m','30m','1h','4h','1D'].map(tf=>`<button data-action="detailTf" data-tf="${tf}" class="${tf==='15m'?'selected':''}">${tf}</button>`).join('')}</div></div><div class="premium-chart detail-chart"><canvas id="detailChart"></canvas></div><div class="chart-legend"><span>● OHLCV actual</span><span id="detailLastCandle">—</span><span id="detailSource">GeckoTerminal</span></div></section>
 <aside class="detail-trade-panel"><div class="eyebrow">TRADING</div><h3>${esc(x.symbol)} / USDC</h3><div class="detail-mode"><span>${paperMode()?'PAPER':'LIVE WALLET'}</span><b>${paperMode()?'No wallet required':'Wallet signature required'}</b></div><div class="order-tabs"><button class="selected" data-action="detailTrade" data-type="MARKET" data-mint="${esc(x.mint)}">MARKET</button><button data-action="detailTrade" data-type="LIMIT" data-mint="${esc(x.mint)}">LIMIT</button><button data-action="detailTrade" data-type="DCA" data-mint="${esc(x.mint)}">DCA</button></div><button class="primary detail-trade-btn" data-action="detailTrade" data-type="MARKET" data-mint="${esc(x.mint)}">${paperMode()?'Open Paper Position':'Open Live Position'}</button><button class="ghost detail-watch" data-action="watch" data-mint="${esc(x.mint)}">${isWatched(x.mint)?'★ In Watchlist':'☆ Add to Watchlist'}</button></aside></div>
 <section class="analysis-section"><div class="section-title"><div><div class="eyebrow">BUDSKY AUTOMATIC ANALYSIS</div><h3 id="analysisState">Analyzing market…</h3><small id="analysisUpdated">Using real market/API data for ${esc(x.symbol)}</small></div><div class="verdict-badge" id="detailVerdict">LOADING</div></div><div class="analysis-grid detail-score-grid" id="detailScores"><div class="analysis-box"><span>OPPORTUNITY</span><b>${x.opportunityScore}/100</b></div><div class="analysis-box"><span>TECHNICAL</span><b id="detailTa">Loading…</b></div><div class="analysis-box"><span>FUNDAMENTAL</span><b id="detailFa">Loading…</b></div><div class="analysis-box"><span>RISK</span><b>${x.riskScore}/100</b></div><div class="analysis-box"><span>MARKET QUALITY</span><b>${x.marketScore==null?'N/A':x.marketScore+'/100'}</b></div></div><div class="analysis-columns"><div class="analysis-panel"><h4>Technical Analysis</h4><div id="technicalDetail" class="analysis-list">Analyzing real OHLCV…</div></div><div class="analysis-panel"><h4>Fundamental Analysis</h4><div id="fundamentalDetail" class="analysis-list">Loading real market and on-chain data…</div></div><div class="analysis-panel"><h4>Risk Analysis</h4><div id="riskDetail" class="analysis-list">Evaluating existing Budsky risk score…</div></div><div class="analysis-panel"><h4>Smart Money Analysis</h4><div id="smartDetail" class="analysis-list">Using available market-flow data…</div></div></div><div class="verdict-panel"><div><h4>Budsky Verdict</h4><div id="verdictReasons">Building verdict from actual signals…</div></div><div><h4>Why / Risks</h4><div id="verdictRisks">—</div></div></div></section></div></div>`);
 const detailState={mint,tf:'15m',base:x}; window.__budskyDetail=detailState; if(detailInterval)clearInterval(detailInterval); if(detailPriceInterval)clearInterval(detailPriceInterval);
 async function loadDetail(tf='15m'){
   const status=document.querySelector('#detailChartStatus'); if(status)status.textContent=`Loading ${tf} OHLCV…`;
   try{
    const r=await fetch(`/api/technical?mint=${encodeURIComponent(mint)}&timeframe=${encodeURIComponent(tf)}&detail=1`,{cache:'no-store'}); const j=await r.json(); if(!r.ok)throw new Error(j.message||j.error||'ANALYSIS_UNAVAILABLE');
    detailState.tf=tf; detailState.analysis=j; if(Array.isArray(j.candles)&&j.candles.length){candleHistory.set(mint,j.candles.map(c=>({...c,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})));drawDetailChart(mint);}
    const d=j.details||{}, f=j.fundamental||{}, m=j.market||{}, c=j.canonical||{};
    const signal=d.rsi14==null?'NEUTRAL':(Number(d.rsi14)>55?'BULLISH':Number(d.rsi14)<45?'BEARISH':'NEUTRAL');
    const trend=d.trendAlignment===1?'Bullish alignment':d.trendAlignment===-1?'Bearish alignment':'Mixed alignment';
    const verdict=x.status==='CANDIDATE'?'BULLISH':x.status==='AVOID'?'AVOID':'WATCH';
    const technicalReasons=[d.rsi14!=null?`RSI ${Number(d.rsi14).toFixed(2)} → ${signal.toLowerCase()} momentum`:null,d.macdHistogram!=null?`MACD histogram ${Number(d.macdHistogram)>0?'positive':'negative'}`:null,trend,d.relativeVolume!=null?`Relative volume ${Number(d.relativeVolume).toFixed(2)}x`:null].filter(Boolean);
    const riskReasons=[x.liquidityUsd!=null&&x.liquidityUsd<250000?'Liquidity below Budsky monitoring threshold':null,d.volatilityRegime==='HIGH'?'High volatility regime':null,f.mintAuthorityDisabled===false?'Mint authority is enabled':null,f.freezeAuthorityDisabled===false?'Freeze authority is enabled':null].filter(Boolean);
    const taEl=document.querySelector('#detailTa'),faEl=document.querySelector('#detailFa'); if(taEl)taEl.textContent=c.taScore==null?(j.score==null?'N/A':j.score+'/100'):Math.round(c.taScore)+'/100'; if(faEl)faEl.textContent=c.faScore==null?'Insufficient':Math.round(c.faScore)+'/100';
    const verdictEl=document.querySelector('#detailVerdict'); if(verdictEl){verdictEl.textContent=verdict;verdictEl.className=`verdict-badge ${verdict.toLowerCase()}`}
    const state=document.querySelector('#analysisState'); if(state)state.textContent=`${verdict} · automatic analysis updated`; const upd=document.querySelector('#analysisUpdated'); if(upd)upd.textContent=`Real data · ${new Date(j.updatedAtMs).toLocaleTimeString()} · ${tf}`;
    const td=document.querySelector('#technicalDetail'); if(td)td.innerHTML=`<div><span>Signal</span><b>${signal}</b></div><div><span>Trend</span><b>${esc(trend)}</b></div><div><span>RSI14</span><b>${d.rsi14==null?'N/A':Number(d.rsi14).toFixed(2)}</b></div><div><span>MACD</span><b>${d.macdHistogram==null?'N/A':Number(d.macdHistogram).toFixed(6)}</b></div><div><span>EMA 9 / 21 / 50 / 200</span><b>${[d.ema9,d.ema21,d.ema50,d.ema200].map(v=>v==null?'N/A':Number(v).toPrecision(6)).join(' / ')}</b></div><div><span>Volume / Relative</span><b>${d.volume==null?'N/A':money(d.volume)} · ${d.relativeVolume==null?'N/A':Number(d.relativeVolume).toFixed(2)+'x'}</b></div><div><span>Support / Resistance</span><b>${d.support==null?'N/A':fmtCurrency(d.support)} / ${d.resistance==null?'N/A':fmtCurrency(d.resistance)}</b></div><div><span>Volatility</span><b>${esc(d.volatilityRegime||'N/A')}</b></div>`;
    const fd=document.querySelector('#fundamentalDetail'); if(fd)fd.innerHTML=`<div><span>Market Cap</span><b>${m.marketCapUsd==null?'N/A':fmt(m.marketCapUsd)}</b></div><div><span>FDV</span><b>${m.fdvUsd==null?'N/A':fmt(m.fdvUsd)}</b></div><div><span>Liquidity</span><b>${m.liquidityUsd==null?'N/A':fmt(m.liquidityUsd)}</b></div><div><span>Mint Authority</span><b>${f.mintAuthorityDisabled==null?'N/A':f.mintAuthorityDisabled?'Disabled':'Enabled'}</b></div><div><span>Freeze Authority</span><b>${f.freezeAuthorityDisabled==null?'N/A':f.freezeAuthorityDisabled?'Disabled':'Enabled'}</b></div><div><span>Top Holder Concentration</span><b>${f.topHolderConcentrationPct==null?'N/A':Number(f.topHolderConcentrationPct).toFixed(2)+'%'}</b></div><div><span>Supply</span><b>${f.features?.supply?.value==null?'N/A':Number(f.features.supply.value).toLocaleString()}</b></div><div><span>Data quality</span><b>${esc(c.dataQuality||'PARTIAL')}</b></div>`;
    const rd=document.querySelector('#riskDetail'); if(rd)rd.innerHTML=`<div><span>Existing Budsky Risk Score</span><b>${x.riskScore}/100</b></div><div><span>Opportunity Status</span><b>${esc(x.status)}</b></div><div><span>Liquidity</span><b>${fmt(x.liquidityUsd)}</b></div><div><span>Volatility</span><b>${esc(d.volatilityRegime||'N/A')}</b></div><div><span>Security flags</span><b>${f.mintAuthorityDisabled===false||f.freezeAuthorityDisabled===false?'Review':'No enabled authority flag observed'}</b></div><div><span>Risk notes</span><b>${riskReasons.length?esc(riskReasons.join(' · ')):'No additional risk signal available from current data.'}</b></div>`;
    const sd=document.querySelector('#smartDetail'); if(sd)sd.innerHTML=`<div><span>24h Buy Volume</span><b>${fmt(buy)}</b></div><div><span>24h Sell Volume</span><b>${fmt(sell)}</b></div><div><span>Net Flow</span><b class="${net==null?'':net>=0?'up':'down'}">${fmt(net)}</b></div><div><span>Holders</span><b>${x.holders==null?'N/A':Number(x.holders).toLocaleString()}</b></div><div><span>Holder Change</span><b>${x.holderChange24h==null?'N/A':pct(x.holderChange24h)}</b></div><div><span>Source</span><b>Jupiter market activity</b></div>`;
    const vr=document.querySelector('#verdictReasons'); if(vr)vr.innerHTML=`${technicalReasons.length?technicalReasons.map(v=>'• '+esc(v)).join('<br>'):'• Insufficient technical evidence.'}<br>${(x.reasons||[]).slice(0,3).map(v=>'• '+esc(v)).join('<br>')}`;
    const rr=document.querySelector('#verdictRisks'); if(rr)rr.innerHTML=riskReasons.length?riskReasons.map(v=>'• '+esc(v)).join('<br>'):'• No additional risk signal available from current data.';
    if(status)status.textContent=`${tf} · ${j.candles?.length||0} actual candles`;
    const last=document.querySelector('#detailLastCandle'); if(last)last.textContent=d.lastCandleAtMs?`Last candle ${new Date(d.lastCandleAtMs).toLocaleTimeString()}`:'Last candle N/A';
   }catch(e){
    const msg=esc(e instanceof Error?e.message:'ANALYSIS_UNAVAILABLE'); const status=document.querySelector('#detailChartStatus'); if(status)status.textContent='Analysis unavailable'; const state=document.querySelector('#analysisState'); if(state)state.textContent='Insufficient data'; const td=document.querySelector('#technicalDetail'); if(td)td.innerHTML=`<div class="data-error">${msg}<br>Budsky tidak mengarang market data.</div>`;
   }
 }
 window.__budskyLoadDetail=loadDetail; loadDetail('15m');
 detailInterval=setInterval(()=>{if(document.querySelector('#modal'))loadDetail(detailState.tf);},30000);
 detailPriceInterval=setInterval(async()=>{try{const r=await fetch(`/api/price?ids=${encodeURIComponent(mint)}`,{cache:'no-store'});const j=await r.json();const row=j.prices?.[mint];if(!row)return;const price=Number(row.usdPrice);if(!Number.isFinite(price))return;const pe=document.querySelector('#detailPrice');if(pe)pe.textContent=fmtCurrency(price);const last=document.querySelector('#detailChart');if(last){const cs=candleHistory.get(mint)||[];if(cs.length){const c=cs[cs.length-1];c.close=price;c.high=Math.max(c.high,price);c.low=Math.min(c.low,price);drawDetailChart(mint);}}}catch{}} ,10000);
}
function drawDetailChart(mint){
 const canvas=document.querySelector('#detailChart'); if(!canvas)return; const ctx=canvas.getContext('2d'); const cs=candleHistory.get(mint)||[]; if(!cs.length)return;
 const w=canvas.clientWidth||900,h=canvas.clientHeight||430,dpr=window.devicePixelRatio||1; canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const pad={l:55,r:55,t:18,b:42}; const vis=cs.slice(-100); const hi=Math.max(...vis.map(c=>c.high)),lo=Math.min(...vis.map(c=>c.low)); const maxVol=Math.max(...vis.map(c=>Number(c.volume)||0),1); const plotH=h-pad.t-pad.b; const chartH=plotH*.78,volH=plotH*.18,step=(w-pad.l-pad.r)/vis.length,bodyW=Math.max(3,Math.min(10,step*.62));
 const y=v=>pad.t+(hi-v)/(hi-lo||1)*chartH; ctx.font='9px Inter,sans-serif';ctx.strokeStyle='rgba(112,91,130,.16)';ctx.fillStyle='#6f6179';
 for(let i=0;i<5;i++){const yy=pad.t+i*chartH/4;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillText(hi-(hi-lo)*i/4<1?Number(hi-(hi-lo)*i/4).toPrecision(6):Number(hi-(hi-lo)*i/4).toFixed(2),w-pad.r+7,yy+3)}
 vis.forEach((c,i)=>{const x=pad.l+step*i+step/2,o=Number(c.open),cl=Number(c.close),hh=Number(c.high),ll=Number(c.low),rise=cl>=o;ctx.strokeStyle=rise?'#54e6a5':'#ff6f91';ctx.fillStyle=rise?'rgba(84,230,165,.8)':'rgba(255,111,145,.8)';ctx.beginPath();ctx.moveTo(x,y(hh));ctx.lineTo(x,y(ll));ctx.stroke();const top=y(Math.max(o,cl)),bot=y(Math.min(o,cl));ctx.fillRect(x-bodyW/2,top,bodyW,Math.max(2,bot-top));const vh=(Number(c.volume)||0)/maxVol*volH;ctx.globalAlpha=.3;ctx.fillRect(x-bodyW/2,pad.t+chartH+volH-vh,bodyW,vh);ctx.globalAlpha=1});
 const last=vis.at(-1); if(last){const yy=y(Number(last.close));ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(194,139,255,.6)';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.setLineDash([]);}
 ctx.fillStyle='#6f6179';ctx.fillText('PRICE',pad.l,11);ctx.fillText('VOLUME',pad.l,pad.t+chartH+volH+15);
}
async function showAnalysis(mint){
 const x=data?.opportunities?.find(o=>o.mint===mint); if(!x)return;
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">FULL MARKET ANALYSIS</div><h2 style="font-family:'Space Grotesk';margin:5px 0">${esc(x.symbol)} · ${x.opportunityScore}/100</h2><div style="color:#786a82;font-size:9px">${esc(x.name)} · ${esc(x.category.replace('_',' '))}</div></div><button class="close" data-action="closeModal">×</button></div><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px"><div><div style="font-size:9px;color:#75667f;letter-spacing:.1em">15M LIVE CANDLESTICKS</div><span style="display:block;color:#5f526a;font-size:8px;margin-top:3px">OHLCV dari GeckoTerminal · candle baru masuk otomatis</span></div><b id="liveChartPrice" style="font:700 18px 'Space Grotesk'">${money(x.priceUsd)}</b></div><div class="premium-chart"><canvas id="liveChart"></canvas></div><div id="taPanel"><div class="analysis-grid"><div class="analysis-box"><span>TECHNICAL</span><b>${x.technicalScore===null?'LOADING…':x.technicalScore}</b></div><div class="analysis-box"><span>MARKET</span><b>${x.marketScore===null?'INSUFFICIENT':x.marketScore}</b></div><div class="analysis-box"><span>RISK</span><b>${x.riskScore}</b></div></div><div class="reason-list"><b style="color:#e7d9ef">Analysis provenance</b><br><span style="color:#c5a9d4">TA: ${esc(x.technicalProvenance||'LOADING')} · Probability: ${esc(x.probabilityStatus||'NOT CALIBRATED')}</span><br><span style="color:#8f8198">The TA score is derived from GeckoTerminal 15m OHLCV candles. Probability is shown only when a validated calibration dataset exists; it is never invented.</span><br><br>${(x.reasons||[]).map(r=>'• '+esc(r)).join('<br>')}</div></div></div><button class="primary" style="width:100%;margin-top:14px;padding:11px;border-radius:9px" data-action="trade" data-mint="${esc(x.mint)}">${paperMode()?'Open Paper Position':'Open Live Position'}</button></div></div>`);
 startLiveChart(mint,x.priceUsd);
 try{
   const r=await fetch(`/api/technical?mint=${encodeURIComponent(mint)}`,{cache:'no-store'}); const j=await r.json();
   if(!r.ok) throw new Error(j.error||'TECHNICAL_UNAVAILABLE');
   const panel=document.querySelector('#taPanel'); if(!panel)return;
   const d=j.details||{};
   panel.innerHTML=`<div class="analysis-grid"><div class="analysis-box"><span>TECHNICAL</span><b>${j.score===null?'INSUFFICIENT':j.score}</b></div><div class="analysis-box"><span>MARKET</span><b>${x.marketScore===null?'INSUFFICIENT':x.marketScore}</b></div><div class="analysis-box"><span>RISK</span><b>${x.riskScore}</b></div></div><div class="reason-list"><b style="color:#e7d9ef">Technical analysis</b><br><span style="color:#c5a9d4">Source: ${esc(d.source||j.provenance)} · ${esc(String(d.candleCount||0))} candles · last candle ${d.lastCandleAtMs?new Date(d.lastCandleAtMs).toLocaleString():'—'}</span><br><br>RSI14: <b>${d.rsi14==null?'—':Number(d.rsi14).toFixed(2)}</b> · MACD hist: <b>${d.macdHistogram==null?'—':Number(d.macdHistogram).toFixed(6)}</b><br>EMA 9/21/50/200: <b>${[d.ema9,d.ema21,d.ema50,d.ema200].map(v=>v==null?'—':Number(v).toPrecision(6)).join(' / ')}</b><br>Rel. volume: <b>${d.relativeVolume==null?'—':Number(d.relativeVolume).toFixed(2)}x</b> · Trend: <b>${d.trendAlignment==null?'—':d.trendAlignment}</b> · Breakout: <b>${d.breakout==null?'—':d.breakout?'YES':'NO'}</b><br>Support / resistance: <b>${d.support==null?'—':money(d.support)} / ${d.resistance==null?'—':money(d.resistance)}</b><br>Volatility: <b>${esc(d.volatilityRegime||'—')}</b> · Trend strength: <b>${d.trendStrength==null?'—':Number(d.trendStrength).toFixed(1)}</b><br><br><span style="color:#c5a9d4">Probability: ${esc(j.probabilityStatus||'NOT CALIBRATED')} ${j.probability==null?'':'· '+(Number(j.probability)*100).toFixed(1)+'%'}</span><br><span style="color:#66586f">Probability is shown only when a validated calibration artifact exists. It is never inferred from price movement alone.</span><br><br>${(x.reasons||[]).map(r=>'• '+esc(r)).join('<br>')}</div>`;
   if(Array.isArray(j.candles)&&j.candles.length){
     candleHistory.set(mint,j.candles.slice(-120).map(c=>({...c,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)}))); drawCandleChart(mint);
   }
 }catch(e){ const panel=document.querySelector('#taPanel'); if(panel)panel.innerHTML=`<div class="reason-list"><b style="color:#e7d9ef">Technical data unavailable</b><br>${esc(e instanceof Error?e.message:'TECHNICAL_UNAVAILABLE')}<br><br>Budsky will not fabricate a TA score. The market discovery score remains separate from technical analysis.</div>`; }
}
function paperMode(){return (controlState?.mode||systemHealth?.mode||'PAPER')!=='LIVE';}
function getPaperPositions(){try{return JSON.parse(localStorage.getItem('budsky.paper.positions')||'[]')}catch{return []}}
function setPaperPositions(v){localStorage.setItem('budsky.paper.positions',JSON.stringify(v))}
function openTrade(mint){
 const x=data?.opportunities?.find(o=>o.mint===mint); if(!x)return;
 if(x.status==='AVOID'){alert('Budsky blocks this candidate because its current risk status is AVOID.');return}
 tradeDraft={type:'MARKET',currency}; const paper=paperMode();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog trade-dialog"><div class="dialog-head"><div><div class="eyebrow">${paper?'PAPER TRADE LAB':'LIVE WALLET TRADE LAB'}</div><h2 style="font-family:'Space Grotesk';margin:5px 0">${esc(x.symbol)} / USDC</h2><div style="color:#786a82;font-size:9px">Opportunity ${x.opportunityScore}/100 · Risk ${x.riskScore}/100</div></div><button class="close" data-action="closeModal">×</button></div>
 <div class="order-tabs"><button class="selected" data-action="orderType" data-order-type="MARKET">MARKET</button><button data-action="orderType" data-order-type="LIMIT">LIMIT</button><button data-action="orderType" data-order-type="DCA">DCA</button></div>
 <div class="order-type-copy" id="orderTypeCopy">Market order: masuk sekarang pada harga market terbaru.</div>
 <div class="trade-grid"><div class="trade-field"><label>AMOUNT / TOTAL MODAL</label><div class="input-unit"><input id="tradeAmount" type="number" min="1" step="1" placeholder="100" value="100"><select id="tradeCurrency"><option value="USD" ${currency==='USD'?'selected':''}>USD</option><option value="IDR" ${currency==='IDR'?'selected':''}>IDR</option></select></div><small id="tradeUsdHint">≈ ${currency==='USD'?'$100.00':'$'+(100/fxRate).toFixed(2)}</small></div><div class="trade-field"><label>LIMIT / TRIGGER PRICE</label><input id="tradeLimitPrice" type="number" min="0" step="any" placeholder="Aktif untuk LIMIT / trigger"><small>Current: ${fmtCurrency(x.priceUsd)}</small></div></div>
 <div id="dcaFields" class="dca-fields" hidden><div class="trade-grid"><div class="trade-field"><label>INTERVAL</label><select id="dcaInterval"><option value="15">15 menit</option><option value="60" selected>1 jam</option><option value="240">4 jam</option><option value="1440">1 hari</option></select></div><div class="trade-field"><label>JUMLAH PEMBELIAN</label><input id="dcaEntries" type="number" min="2" max="30" value="5"></div><div class="trade-field"><label>AMOUNT / ENTRY</label><input id="dcaPerEntry" type="number" min="1" step="1" value="20"></div><div class="trade-field"><label>TRIGGER (OPSIONAL)</label><input id="dcaTrigger" type="number" min="0" step="any" placeholder="Kosong = jadwal"></div></div><div class="notice">DCA total = amount per entry × jumlah pembelian. Preview jadwal dihitung dari waktu sekarang. PAPER menyimpan rencana di browser; LIVE DCA tetap planner-only sampai setiap entry meminta konfirmasi wallet.</div></div>
 <div class="notice">${paper?'PAPER: Market/Limit/DCA tidak memakai wallet dan tidak memindahkan dana nyata.':'LIVE: hanya MARKET yang bisa diteruskan ke Jupiter sekarang. LIMIT/DCA disimpan sebagai planner agar tidak ada transaksi otomatis tanpa konfirmasi wallet.'}</div>
 <button class="primary" style="width:100%;padding:12px" data-action="prepareTrade" data-mint="${esc(x.mint)}">${paper?'Review Order':'Review Live Market Order'}</button></div></div>`);
}
function refreshTradeDraftUI(){
 const t=tradeDraft.type; const copy=document.querySelector('#orderTypeCopy'); const dca=document.querySelector('#dcaFields'); const limit=document.querySelector('#tradeLimitPrice'); const btn=document.querySelector('[data-action="prepareTrade"]');
 if(copy)copy.textContent=t==='MARKET'?'Market order: masuk sekarang pada harga market terbaru.':t==='LIMIT'?'Limit order: entry hanya dipicu ketika harga mencapai target.':'DCA: bagi modal menjadi beberapa entry sesuai interval yang kamu atur.';
 if(dca)dca.hidden=t!=='DCA'; if(limit)limit.disabled=t==='MARKET'; if(btn)btn.textContent=paperMode()?(t==='DCA'?'Review DCA Plan':t==='LIMIT'?'Review Limit Order':'Review Market Order'):'Review Live Market Order';
 document.querySelectorAll('.order-tabs button').forEach(b=>b.classList.toggle('selected',b.dataset.orderType===t));
}
function selectOrderType(type){tradeDraft.type=type;refreshTradeDraftUI()}

async function prepareTrade(mint){
 const x=data?.opportunities?.find(o=>o.mint===mint); if(!x)return;
 const amountText=String(document.querySelector('#tradeAmount')?.value||'').trim();
 const inputCurrency=document.querySelector('#tradeCurrency')?.value||currency;
 const amountRaw=Number(amountText);
 if(!Number.isFinite(amountRaw)||amountRaw<=0){alert('Masukkan jumlah yang valid.');return}
 const amountUsd=inputCurrency==='IDR'?amountRaw/fxRate:amountRaw;
 if(amountUsd<=0){alert('Nilai USD tidak valid.');return}
 const orderType=tradeDraft.type||'MARKET'; const limitInput=Number(document.querySelector('#tradeLimitPrice')?.value||0); const limitPrice=inputCurrency==='IDR'?limitInput/fxRate:limitInput;
 const dcaInterval=Number(document.querySelector('#dcaInterval')?.value||60); const dcaEntries=Number(document.querySelector('#dcaEntries')?.value||5); const dcaPerEntryRaw=Number(document.querySelector('#dcaPerEntry')?.value||0); const dcaTriggerInput=Number(document.querySelector('#dcaTrigger')?.value||0); const dcaTriggerPrice=inputCurrency==='IDR'?dcaTriggerInput/fxRate:dcaTriggerInput; const dcaTotalUsd=orderType==='DCA'?(dcaPerEntryRaw*(inputCurrency==='IDR'?1/fxRate:1)*dcaEntries):amountUsd;
 if(orderType==='LIMIT'&&(!limitPrice||limitPrice<=0)){alert('Isi target Limit Price.');return}
 if(orderType==='DCA'&&(dcaEntries<2||dcaEntries>30)){alert('DCA entries harus 2–30.');return}
 if(orderType==='DCA'&&(!dcaPerEntryRaw||dcaPerEntryRaw<=0)){alert('Isi amount per entry DCA.');return}
 if(orderType==='DCA'&&dcaTotalUsd>100){alert('Paper DCA dibatasi total $100 per plan.');return}
 if(!paperMode()&&orderType!=='MARKET'){alert('LIVE LIMIT/DCA masih planner-only. Gunakan MARKET untuk transaksi Jupiter yang meminta signature wallet.');return}
 if(paperMode()){
   if(amountUsd>100){alert('Paper position limit is $100 per position in this demo.');return}
   const existing=getPaperPositions(); if(orderType==='MARKET'&&existing.some(p=>p.mint===mint)){alert('A paper position for this token is already open.');return}
   const qty=x.priceUsd>0?amountUsd/x.priceUsd:0; if(!qty){alert('Current market price is unavailable.');return}
   pendingTrade={paper:true,mint,symbol:x.symbol,name:x.name,amountUsd:orderType==='DCA'?dcaTotalUsd:amountUsd,amountInput:amountRaw,inputCurrency,entryPriceUsd:x.priceUsd,quantity:qty,createdAtMs:Date.now(),orderType,limitPrice,dcaInterval,dcaEntries,dcaPerEntryUsd:orderType==='DCA'?dcaTotalUsd/dcaEntries:null,dcaTriggerPrice:orderType==='DCA'&&dcaTriggerPrice>0?dcaTriggerPrice:null};
   document.querySelector('#modal')?.remove();
   const planText=orderType==='LIMIT'?`Target price: ${fmtCurrency(limitPrice)}. Total ${fmtCurrency(amountUsd)}.`:orderType==='DCA'?`DCA: ${dcaEntries} entries · ${fmtCurrency(dcaTotalUsd/dcaEntries)} / entry · setiap ${dcaInterval>=1440?(dcaInterval/1440)+' hari':dcaInterval>=60?(dcaInterval/60)+' jam':dcaInterval+' menit'} · total ${fmtCurrency(dcaTotalUsd)}${dcaTriggerPrice>0?` · trigger ${fmtCurrency(dcaTriggerPrice)}`:''}.`:'Entry sekarang pada market price.';
   document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">${orderType} PAPER REVIEW</div><h2 style="font-family:'Space Grotesk';margin:5px 0">${esc(x.symbol)} / USDC</h2></div><button class="close" data-action="cancelPendingTrade">×</button></div><div class="analysis-grid"><div class="analysis-box"><span>AMOUNT</span><b>${esc(inputCurrency==='IDR'?'Rp '+amountRaw.toLocaleString('id-ID'):'$'+amountRaw.toFixed(2))}</b></div><div class="analysis-box"><span>USD VALUE</span><b>${fmtCurrency(amountUsd)}</b></div><div class="analysis-box"><span>ENTRY</span><b>${fmtCurrency(x.priceUsd)}</b></div></div><div class="reason-list"><b style="color:#e7d9ef">PAPER ONLY · ${orderType}</b><br>${esc(planText)}<br><br>No wallet signature. No SOL/USDC is moved. No blockchain transaction is created.</div><button class="primary" style="width:100%;margin-top:14px;padding:12px" data-action="confirmTrade">${orderType==='LIMIT'?'Save Limit Order':orderType==='DCA'?'Start DCA Plan':'Open Paper Position'}</button></div></div>`);return;
 }
 if(!wallet||!walletProvider){alert('Connect Phantom atau Solflare dulu.');return}
 const idempotency=(crypto.randomUUID?.()||(()=>{const a=new Uint32Array(4);crypto.getRandomValues(a);return Array.from(a).map(x=>x.toString(16).padStart(8,'0')).join('');})()).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
 try{
  const r=await fetch('/api/prepare-trade',{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-idempotency-key':idempotency},body:JSON.stringify({wallet,outputMint:mint,amountUsdc:amountUsd.toFixed(6)})});
  const j=await r.json(); if(!r.ok)throw new Error(j.error||'TRADE_PREPARATION_FAILED'); pendingTrade={...j,idempotency,orderType:'MARKET'}; const q=j.quote||{};
  document.querySelector('#modal')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">JUPITER EXECUTION REVIEW</div><h2 style="font-family:'Space Grotesk';margin:5px 0">${esc(j.output?.symbol||mint)} / USDC</h2><div style="color:#786a82;font-size:9px">Budsky Risk Engine approved · Jupiter prepared the route</div></div><button class="close" data-action="cancelPendingTrade">×</button></div><div class="analysis-grid"><div class="analysis-box"><span>YOU PAY</span><b>${esc(amountUsd.toFixed(2))} USDC</b></div><div class="analysis-box"><span>EXPECTED</span><b>${esc(String(q.outAmount||'—'))}</b></div><div class="analysis-box"><span>MAX SLIPPAGE</span><b>${Number(q.slippageBps||0)/100}%</b></div></div><div class="reason-list"><b style="color:#e7d9ef">Execution path</b><br>1. Budsky Risk Engine → APPROVE<br>2. Jupiter Swap API → route + transaction<br>3. Wallet → kamu menyetujui signature<br>4. Jupiter → Solana confirmation + reconciliation</div><button class="primary" style="width:100%;margin-top:14px;padding:12px" data-action="confirmTrade">Sign & Execute via Jupiter</button></div></div>`);
 }catch(e){alert(`Trade not prepared: ${e.message}`)}
}

async function confirmTrade(){
 if(!pendingTrade){alert('Trade review expired. Start again.');return}
 if(pendingTrade.paper){
   const t=pendingTrade; pendingTrade=null;
   if(t.orderType==='LIMIT'){
     const orders=JSON.parse(localStorage.getItem('budsky.paper.orders')||'[]'); orders.push({...t,id:`limit-${Date.now()}`,status:'WAITING'}); localStorage.setItem('budsky.paper.orders',JSON.stringify(orders)); closeModal(); alert('Limit order tersimpan di browser. Saat harga menyentuh target, Budsky dapat membuat paper position.'); return;
   }
   const positions=getPaperPositions();
   if(t.orderType==='DCA'){
     const firstAmount=t.amountUsd/t.dcaEntries; const qty=t.entryPriceUsd>0?firstAmount/t.entryPriceUsd:0;
     positions.push({...t,id:`paper-${Date.now()}`,amountUsd:firstAmount,quantity:qty,dcaPlan:{totalUsd:t.amountUsd,entries:t.dcaEntries,intervalMin:t.dcaInterval,completed:1}});
     setPaperPositions(positions); closeModal(); alert(`DCA PAPER dimulai: entry 1/${t.dcaEntries}. Sisa plan tersimpan sebagai rencana manual di browser.`); renderPaperPositionsModal(); return;
   }
   positions.push({...t,id:`paper-${Date.now()}`}); setPaperPositions(positions); closeModal(); renderPaperPositionsModal(); return;
 }
 if(!walletProvider||!wallet){alert('Connect and authenticate your wallet first.');return}
 const trade=pendingTrade;
 try{
  const tx=window.solanaWeb3?.VersionedTransaction?window.solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(trade.transaction),c=>c.charCodeAt(0))):null;
  if(!tx)throw new Error('SOLANA_WEB3_BROWSER_BUNDLE_UNAVAILABLE');
  const signed=await walletProvider.signTransaction(tx);
  const bytes=new Uint8Array(signed.serialize());
  let binary=''; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  const signedBase64=btoa(binary);
  const ex=await fetch('/api/execute-trade',{method:'POST',headers:{'content-type':'application/json','x-idempotency-key':trade.idempotency},body:JSON.stringify({wallet,signedTransaction:signedBase64,requestId:trade.requestId})});
  const ej=await ex.json();
  if(ej.state==='UNKNOWN'){closeModal();pendingTrade=null;const sig=ej.signature||'not available';alert(`Transaction state is UNKNOWN.
Signature: ${sig}
No automatic retry was performed. Use Reconcile to verify the chain state.`);if(ej.signature) { if(confirm('Reconcile this transaction now?')) await reconcileTrade(trade.idempotency); }return}
  if(!ex.ok)throw new Error(ej.error||'TRADE_EXECUTION_FAILED');
  closeModal();pendingTrade=null;alert(`${trade.close?'Position closed':'Trade confirmed'} on Solana via Jupiter\n${ej.result?.signature||ej.signature||''}`); await load();
 }catch(e){alert(`Trade not executed: ${e.message}`)}
}
async function reconcileTrade(idempotency){if(!idempotency)return;try{const r=await fetch('/api/reconcile-trade',{method:'POST',credentials:'include',headers:{'x-idempotency-key':idempotency}});const j=await r.json();if(j.state==='RECONCILED'){alert(`Trade reconciled on Solana
${j.signature}`);await load();return}alert(`Reconciliation status: ${j.state||j.error}
${j.reason||''}`)}catch(e){alert(`Reconciliation failed: ${e.message}`)}}
function cancelPendingTrade(){pendingTrade=null;closeModal()}
function closeModal(){stopLiveChart();if(detailInterval){clearInterval(detailInterval);detailInterval=null}if(detailPriceInterval){clearInterval(detailPriceInterval);detailPriceInterval=null}document.querySelector('#modal')?.remove();window.__budskyDetail=null}
function getPaperOrders(){try{return JSON.parse(localStorage.getItem('budsky.paper.orders')||'[]')}catch{return []}}
function setPaperOrders(v){localStorage.setItem('budsky.paper.orders',JSON.stringify(v))}
function cancelPaperOrder(id){setPaperOrders(getPaperOrders().filter(o=>o.id!==id));renderPaperPositionsModal()}
function toggleDcaPause(id){const ps=getPaperPositions();const p=ps.find(x=>x.id===id);if(!p?.dcaPlan)return;p.dcaPlan.paused=!p.dcaPlan.paused;setPaperPositions(ps);renderPaperPositionsModal()}
function cancelDca(id){setPaperPositions(getPaperPositions().filter(p=>p.id!==id));renderPaperPositionsModal()}
function editDca(id){const ps=getPaperPositions();const p=ps.find(x=>x.id===id);if(!p?.dcaPlan)return;const v=prompt('Interval DCA dalam menit:',String(p.dcaPlan.intervalMin||60));const n=Number(v);if(!Number.isFinite(n)||n<=0)return;p.dcaPlan.intervalMin=n;setPaperPositions(ps);renderPaperPositionsModal()}
function renderPaperPositionsModal(){
 const positions=getPaperPositions(), orders=getPaperOrders();
 const html=positions.map(p=>{const x=data?.opportunities?.find(o=>o.mint===p.mint);const price=x?.priceUsd??p.entryPriceUsd;const pnl=(price-p.entryPriceUsd)*p.quantity;const pct=p.entryPriceUsd?((price-p.entryPriceUsd)/p.entryPriceUsd*100):0;const d=p.dcaPlan;return `<div class="analysis-box" style="margin:8px 0"><span>${esc(p.symbol)} · PAPER POSITION</span><b>${fmtCurrency(p.amountUsd)} invested</b><small>Entry ${money(p.entryPriceUsd)} · Now ${money(price)} · Qty ${p.quantity.toPrecision(8)} · P/L ${pnl>=0?'+':''}${fmtCurrency(pnl)} (${pct>=0?'+':''}${pct.toFixed(2)}%)</small>${d?`<div class="dca-status"><b>DCA ${d.completed}/${d.entries}</b><span>${d.paused?'PAUSED':'ACTIVE'} · every ${d.intervalMin}m</span></div><div class="actions"><button class="ghost" data-action="dcaPause" data-id="${esc(p.id)}">${d.paused?'Resume':'Pause'}</button><button class="ghost" data-action="dcaEdit" data-id="${esc(p.id)}">Edit</button><button class="danger" data-action="dcaCancel" data-id="${esc(p.id)}">Cancel DCA</button></div>`:''}<button class="ghost" style="margin-top:8px;width:100%" data-action="closePaper" data-id="${esc(p.id)}">Close Paper Position</button></div>`}).join('');
 const orderHtml=orders.length?orders.map(o=>`<div class="analysis-box pending-order"><span>${esc(o.symbol)} · LIMIT ${o.status}</span><b>Target ${fmtCurrency(o.limitPrice)}</b><small>Total ${fmtCurrency(o.amountUsd)} · Current ${fmtCurrency(data?.opportunities?.find(x=>x.mint===o.mint)?.priceUsd||0)}</small><button class="danger" style="margin-top:8px;width:100%" data-action="cancelOrder" data-id="${esc(o.id)}">Cancel Limit Order</button></div>`).join(''):'<div class="reason-list">No pending Limit orders.</div>';
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">POSITIONS · ORDERS</div><h2 style="font-family:'Space Grotesk';margin:5px 0">Paper Trading</h2><div style="color:#786a82;font-size:9px">Stored in this browser · simulated only · no wallet or blockchain transaction</div></div><button class="close" data-action="closeModal">×</button></div><div class="notice" style="margin-bottom:12px">PAPER mode mendukung Market, Limit dan DCA. Limit dipantau saat market refresh. DCA planner menampilkan status dan dapat di-pause/edit/cancel; tidak ada dana nyata yang bergerak.</div><h3 style="font-size:11px;margin:14px 0 8px">Open Positions</h3>${html||'<div class="reason-list">No paper positions open.</div>'}<h3 style="font-size:11px;margin:16px 0 8px">Pending Limit Orders</h3>${orderHtml}</div></div>`);
}
async function openPositions(){
 if(paperMode()){renderPaperPositionsModal();return}
 if(!wallet){alert('Connect and authenticate your wallet first.');return}
 try{const r=await fetch(`/api/positions?wallet=${encodeURIComponent(wallet)}`,{credentials:'include',cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'POSITIONS_UNAVAILABLE');document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">LIVE POSITIONS</div><h2 style="font-family:'Space Grotesk';margin:5px 0">Open Positions</h2><div style="color:#786a82;font-size:9px">Confirmed/reconciled on-chain positions for this wallet</div></div><button class="close" data-action="closeModal">×</button></div><div class="notice" style="margin-bottom:12px"><b>To close a LIVE position:</b> click <b>Close Position</b>. Budsky prepares a fresh Jupiter exit quote, runs exit risk checks, shows the route, then your wallet signs. Nothing is broadcast without your approval.</div>${(j.positions||[]).map(p=>`<div class="analysis-box" style="margin:8px 0"><span>${esc(p.mint)} · LIVE</span><b>Qty ${esc(p.quantityRaw)}</b><small>Notional $${Number(p.notionalUsd||0).toFixed(2)} · Updated ${new Date(p.updatedAtMs).toLocaleString()}</small><button class="danger" style="margin-top:8px;width:100%" data-action="closeLive" data-position-id="${esc(p.positionId)}">Close Position</button></div>`).join('')||'<div class="reason-list">No open LIVE positions recorded for this wallet.</div>'}</div></div>`)}catch(e){alert(`Positions unavailable: ${e.message}`)} }
async function closeLivePosition(positionId){
 if(!wallet||!walletProvider){alert('Connect and authenticate your wallet first.');return}
 if(!confirm('Close this LIVE position? Budsky will prepare an exit transaction and ask your wallet to sign it.'))return;
 const idempotency=(crypto.randomUUID?.()||String(Date.now())+Math.random()).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
 try{
  const r=await fetch('/api/prepare-close-position',{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-idempotency-key':idempotency},body:JSON.stringify({wallet,positionId})});
  const j=await r.json(); if(!r.ok)throw new Error(j.detail||j.error||'CLOSE_PREPARATION_FAILED');
  closeModal(); pendingTrade={...j,idempotency,positionId,close:true};
  const q=j.quote||{};
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">CLOSE LIVE POSITION</div><h2 style="font-family:'Space Grotesk';margin:5px 0">Review Exit</h2><div style="color:#786a82;font-size:9px">Jupiter prepared the exit route · server risk checks passed</div></div><button class="close" data-action="cancelPendingTrade">×</button></div><div class="analysis-grid"><div class="analysis-box"><span>INPUT TOKEN</span><b>${esc(String(q.inputMint||positionId))}</b></div><div class="analysis-box"><span>EXPECTED USDC</span><b>${esc(String(q.outAmount||'—'))}</b></div><div class="analysis-box"><span>SLIPPAGE</span><b>${Number(q.slippageBps||0)/100}%</b></div></div><div class="reason-list"><b style="color:#e7d9ef">Exit path</b><br>1. Fresh Jupiter exit quote<br>2. Exit Risk Engine approval<br>3. Transaction intent inspection + simulation<br>4. Your wallet signs<br>5. Jupiter submits<br>6. Solana confirmation + reconciliation</div><button class="primary" style="width:100%;margin-top:14px;padding:12px" data-action="confirmTrade">Sign & Close Position</button></div></div>`);
 }catch(e){alert(`Close position failed: ${e.message}`)}
}
function closePaper(id){const positions=getPaperPositions();const p=positions.find(x=>x.id===id);if(!p)return;const x=data?.opportunities?.find(o=>o.mint===p.mint);const price=x?.priceUsd??p.entryPriceUsd;const pnl=(price-p.entryPriceUsd)*p.quantity;setPaperPositions(positions.filter(x=>x.id!==id));closeModal();alert(`Paper position closed. Simulated P/L: ${pnl>=0?'+':''}$${pnl.toFixed(2)}`);}
function openBacktestInfo(){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">BACKTEST</div><h2 style="font-family:'Space Grotesk';margin:5px 0">Research Mode</h2></div><button class="close" data-action="closeModal">×</button></div><div class="reason-list"><b style="color:#e7d9ef">Backtest is isolated from live execution.</b><br><br>The repository includes deterministic replay/backtest datasets and risk caps. This UI entry is informational; it cannot arm LIVE or execute real transactions.</div></div></div>`)}
async function openPortfolio(){
 if(paperMode()){
   const positions=getPaperPositions(); const exposure=positions.reduce((n,p)=>n+Number(p.amountUsd||0),0);
   document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">PORTFOLIO</div><h2 style="font-family:'Space Grotesk';margin:5px 0">Demo Portfolio</h2><div style="color:#786a82;font-size:9px">PAPER only · browser-simulated · no real wallet balance</div></div><button class="close" data-action="closeModal">×</button></div><div class="analysis-grid"><div class="analysis-box"><span>PAPER POSITIONS</span><b>${positions.length}</b></div><div class="analysis-box"><span>OPEN EXPOSURE</span><b>$${exposure.toFixed(2)}</b></div><div class="analysis-box"><span>WALLET</span><b>NOT REQUIRED</b></div></div><div class="notice"><b>Where to open:</b> use <b>Open Paper Position</b> on any Market Scanner card. This portfolio is only a summary; manage entries/exits from <b>Positions</b>.</div><button class="primary" style="width:100%;margin-top:12px;padding:12px" data-action="positionsInfo">View Paper Positions</button></div></div>`); return;
 }
 if(!wallet){alert('Connect and authenticate your wallet first.');return}
 try{const r=await fetch(`/api/portfolio?wallet=${encodeURIComponent(wallet)}`,{credentials:'include',cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'PORTFOLIO_UNAVAILABLE');document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">PORTFOLIO</div><h2 style="font-family:'Space Grotesk';margin:5px 0">Live Wallet</h2><div style="color:#786a82;font-size:9px">${esc(wallet)}</div></div><button class="close" data-action="closeModal">×</button></div><div class="analysis-grid"><div class="analysis-box"><span>SOL BALANCE</span><b>${Number(j.solBalance||0).toFixed(4)}</b></div><div class="analysis-box"><span>TOKEN ACCOUNTS</span><b>${j.tokenAccounts?.length||0}</b></div><div class="analysis-box"><span>UPDATED</span><b>${new Date(j.updatedAtMs).toLocaleTimeString()}</b></div></div><div class="reason-list"><b style="color:#e7d9ef">Wallet assets</b><br>${(j.tokenAccounts||[]).slice(0,30).map(t=>`• ${esc(t.mint)} · ${esc(t.amount)}`).join('<br>')||'No token accounts found.'}</div></div></div>`)}catch(e){alert(`Portfolio unavailable: ${e.message}`)}}

document.addEventListener('input',e=>{if(e.target?.id==='marketSearch'){searchQuery=e.target.value;render();requestAnimationFrame(()=>{const el=document.querySelector('#marketSearch');if(el){el.focus();try{el.setSelectionRange(el.value.length,el.value.length)}catch{}}})}});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]'); if(!el)return;
 const a=el.dataset.action;
 if(a==='openDrawer')return openDrawer();
 if(a==='closeDrawer')return closeDrawer();
 if(a==='discovery')return openDiscovery(el.dataset.view||'PULSE');
 if(a==='closeDiscovery'){document.querySelector('#discoveryModal')?.remove();return;}
 if(a==='watch')return toggleWatch(el.dataset.mint||'');
 if(a==='discoveryTrade'){document.querySelector('#discoveryModal')?.remove();return showTokenDetail(el.dataset.mint||'');}
 if(a==='tokenDetail'){return showTokenDetail(el.dataset.mint||'');}
 if(a==='openPortfolio'){closeDrawer();return openPortfolio();}
 if(a==='openControl'){closeDrawer();return openControl();}
 if(a==='quickTrade'){closeDrawer();return quickTrade();}
 if(a==='currency'){closeDrawer();currency=el.dataset.currency||'USD';fxReady=currency==='USD';render();return;}
 if(a==='orderType')return selectOrderType(el.dataset.orderType||'MARKET');
 if(a==='positionsInfo'){closeDrawer();return openPositions();}
 if(a==='backtestInfo'){closeDrawer();return openBacktestInfo();}
 if(a==='sort-score')return setSort('score');
 if(a==='sort-risk')return setSort('risk');
 if(a==='filter')return setFilter(el.dataset.filter||'ALL');
 if(a==='analysis')return showTokenDetail(el.dataset.mint||'');
 if(a==='trade')return openTrade(el.dataset.mint||'');
 if(a==='detailTf'){document.querySelectorAll('.timeframe-tabs button').forEach(b=>b.classList.toggle('selected',b.dataset.tf===el.dataset.tf));return window.__budskyLoadDetail?.(el.dataset.tf||'15m');}
 if(a==='detailTrade'){const mint=el.dataset.mint||'';const type=el.dataset.type||'MARKET';closeModal();tradeDraft={type,currency};openTrade(mint);refreshTradeDraftUI();return;}
 if(a==='load')return load();
 if(a==='closeControl')return closeControl();
 if(a==='closeModal')return closeModal();
 if(a==='cancelPendingTrade')return cancelPendingTrade();
 if(a==='prepareTrade')return prepareTrade(el.dataset.mint||'');
 if(a==='confirmTrade')return confirmTrade();
 if(a==='control')return setControl(el.dataset.control||'');
 if(a==='hide-image')return el.remove();
 if(a==='closePaper')return closePaper(el.dataset.id||'');
 if(a==='cancelOrder'){cancelPaperOrder(el.dataset.id||'');return;}
 if(a==='dcaPause'){toggleDcaPause(el.dataset.id||'');return;}
 if(a==='dcaEdit'){editDca(el.dataset.id||'');return;}
 if(a==='dcaCancel'){cancelDca(el.dataset.id||'');return;}
 if(a==='closeLive')return closeLivePosition(el.dataset.positionId||'');
});
window.setFilter=x=>{filter=x;render()};window.setSort=x=>{sort=x;render()};window.showAnalysis=showAnalysis;window.openTrade=openTrade;window.prepareTrade=prepareTrade;window.confirmTrade=confirmTrade;window.cancelPendingTrade=cancelPendingTrade;window.reconcileTrade=reconcileTrade;window.closeModal=closeModal;window.openPortfolio=openPortfolio;window.load=load;window.openControl=openControl;window.setControl=setControl;window.closeControl=closeControl;window.closePaper=closePaper;window.closeLivePosition=closeLivePosition;
render();load();setInterval(load,20000);setInterval(()=>{const c=document.querySelector('#clock');if(c)c.textContent=new Date().toLocaleTimeString()},1000);
