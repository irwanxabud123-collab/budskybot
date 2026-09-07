const app=document.querySelector('#app');
let wallet=null,walletProvider=null,data=null,filter='ALL',sort='score',lastError='',pendingTrade=null,systemHealth=null,controlState=null;
function base58Encode(bytes){const a='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let digits=[0];for(const byte of bytes){let carry=byte;for(let i=0;i<digits.length;i++){const n=digits[i]*256+carry;digits[i]=n%58;carry=Math.floor(n/58)}while(carry){digits.push(carry%58);carry=Math.floor(carry/58)}}let out='';for(let i=0;i<bytes.length&&bytes[i]===0;i++)out+='1';for(let i=digits.length-1;i>=0;i--)out+=a[digits[i]];return out}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>{n=Number(n||0);return n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(n<1?5:2)};
function filtered(){let xs=(data?.opportunities||[]).filter(x=>filter==='ALL'||x.category===filter);if(sort==='score')xs.sort((a,b)=>b.opportunityScore-a.opportunityScore);if(sort==='risk')xs.sort((a,b)=>b.riskScore-a.riskScore);return xs.slice(0,50)}
function render(){const xs=filtered();const top=xs[0];app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><img src="/budsky-logo.jpg"><div><strong>BUDSKY BOT</strong><span>REAL-TIME TRADING OS</span></div></div><div class="nav"><button class="active"><span class="ico">◈</span><span>Market Scanner</span></button><button onclick="openPortfolio()"><span class="ico">◉</span><span>Portfolio</span></button><button onclick="alert('Positions view is connected to the execution/persistence layer in the next transaction lifecycle step.')"><span class="ico">↗</span><span>Positions</span></button><button onclick="alert('Backtest is a feature mode. It does not replace the live application.')"><span class="ico">⌁</span><span>Backtest</span></button><button onclick="openControl()"><span class="ico">⚙</span><span>Control</span></button></div><div class="sidebar-foot"><div class="health"><span><i class="dot"></i> SYSTEM</span><b>${esc(systemHealth?.mode||'STARTING')}</b></div><div style="font-size:8px;color:#66586f;margin-top:7px">Market data refreshes continuously.</div></div></aside><main class="main"><div class="topbar"><div style="display:flex;gap:10px;align-items:center"><button class="mobile-menu">☰</button><div><div class="top-title">Market Intelligence</div><div class="top-sub">Automatic opportunity discovery across Solana markets</div></div></div><div class="top-actions"><button class="control-pill" onclick="openControl()">${controlState?.mode==='LIVE'&&controlState?.liveEnabled?'🔴 LIVE':'🟢 PAPER'}</button><div class="live-pill"><b>●</b> ${esc(controlState?.mode||systemHealth?.mode||'STARTING')} <span id="clock">${new Date().toLocaleTimeString()}</span></div><button id="wallet" class="wallet">${wallet?wallet.slice(0,4)+'…'+wallet.slice(-4):'Connect Wallet'}</button></div></div><section class="hero"><div><div class="eyebrow">BUDSKY BOT · ${esc(systemHealth?.mode||'MARKET SCANNER')} MARKET SCANNER</div><h1>Let Budsky find the <em>best markets</em> right now.</h1><p>Budsky is a real application with explicit operating modes. Backtest is an optional feature, not a separate demo application. Budsky continuously ranks large caps, altcoins and meme coins using market data, technical momentum, liquidity, activity and execution-risk signals.</p><div class="tabs"><button class="active">REAL-TIME</button><button onclick="setSort('score')">TOP OPPORTUNITIES</button><button onclick="setSort('risk')">LOWER RISK</button></div></div><div class="hero-right"><div class="mini"><span>TOP MARKET</span><b>${top?esc(top.symbol):'—'}</b><small>${top?top.opportunityScore+'/100':'waiting'}</small></div><div class="mini"><span>SCANNED</span><b>${data?.universeSize||0}</b><small>candidate assets</small></div><div class="mini"><span>DATA</span><b>${data?'LIVE':'—'}</b><small>${data?new Date(data.updatedAtMs).toLocaleTimeString():'connecting'}</small></div><div class="mini"><span>WALLET</span><b>${wallet?'READY':'—'}</b><small>${wallet?'signature enabled':'connect to trade'}</small></div></div></section><div class="section-head"><div><h2>Opportunities</h2><p>Ranked automatically — evidence first, decision remains yours.</p></div><div class="refresh">Auto refresh · 20s · ${data?new Date(data.updatedAtMs).toLocaleTimeString():'connecting'}</div></div><div class="tabs" style="padding-top:0">${['ALL','LARGE_CAP','ALTCOIN','MEME','OTHER'].map(x=>`<button class="${filter===x?'active':''}" onclick="setFilter('${x}')">${x.replace('_',' ')}</button>`).join('')}</div><section class="grid">${xs.map((x,i)=>card(x,i)).join('')}</section><div class="footer"><span>Market source: Jupiter Tokens API V2</span><span>Live data only · stale data is rejected by trading gates</span><span>Budsky Bot · real application / optional backtest feature</span></div></main><nav class="bottom"><button class="active">◈<br>Markets</button><button onclick="openPortfolio()">◉<br>Portfolio</button><button>↗<br>Positions</button><button onclick="alert('Backtest is an optional feature mode.')">⌁<br>Backtest</button></nav></div>`;document.querySelector('#wallet').onclick=connectWallet;}
function card(x,i){const status=x.status==='CANDIDATE'?'candidate':x.status==='AVOID'?'avoid':'';return `<article class="card ${status}"><div class="rank">#${i+1}</div><div class="token"><div class="coin">${x.icon?`<img src="${esc(x.icon)}" onerror="this.style.display='none'">`:esc((x.symbol||'?')[0])}</div><div><h3>${esc(x.symbol)} <small>${esc(x.name)}</small></h3><p>${esc(x.category.replace('_',' '))} · ${money(x.liquidityUsd)} liquidity</p></div></div><div class="score"><b>${x.opportunityScore}</b><span>/100</span><label>OPPORTUNITY</label></div><div class="bar"><i style="width:${x.opportunityScore}%"></i></div><div class="metrics"><div class="metric"><span>TA</span><b>${x.technicalScore===null?'MISSING':x.technicalScore}</b></div><div class="metric"><span>MARKET QUALITY</span><b>${x.marketScore===null?'MISSING':x.marketScore}</b></div><div class="metric"><span>RISK</span><b>${x.riskScore}</b></div><div class="metric"><span>24H</span><b class="${x.change24h>=0?'up':'down'}">${x.change24h>=0?'+':''}${Number(x.change24h).toFixed(2)}%</b></div></div><div class="reasons">${(x.reasons||[]).slice(0,2).map(r=>`<span>• ${esc(r)}</span>`).join('')}</div><div class="actions"><button class="ghost" onclick="showAnalysis('${esc(x.mint)}')">View Full Analysis</button><button class="primary" onclick="openTrade('${esc(x.mint)}')">Open Position</button></div></article>`}
const priceHistory=new Map();let liveChart=null,liveChartInterval=null,liveChartMint=null;
const LIVE_POINT_LIMIT=120;
async function pollLivePrice(mint){
  try{
    const r=await fetch(`/api/price?ids=${encodeURIComponent(mint)}`,{cache:'no-store'});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||'PRICE_POLL_FAILED');
    const row=j.prices?.[mint];
    if(!row||row.usdPrice==null)return;
    const hist=priceHistory.get(mint)||[];
    hist.push({t:j.updatedAtMs,price:row.usdPrice});
    while(hist.length>LIVE_POINT_LIMIT)hist.shift();
    priceHistory.set(mint,hist);
    updateLiveChart(mint);
  }catch(e){console.error('live price poll failed',e)}
}
function updateLiveChart(mint){
  const hist=priceHistory.get(mint)||[];
  const canvas=document.querySelector('#liveChart');
  if(!canvas||typeof Chart==='undefined')return;
  const labels=hist.map(p=>new Date(p.t).toLocaleTimeString());
  const values=hist.map(p=>p.price);
  const first=values[0],last=values[values.length-1];
  const up=first!=null&&last!=null?last>=first:true;
  const lineColor=up?'#54e6a5':'#ff6f91';
  const fillColor=up?'rgba(84,230,165,0.12)':'rgba(255,111,145,0.12)';
  if(liveChart&&liveChart.mint===mint){
    liveChart.data.labels=labels;
    liveChart.data.datasets[0].data=values;
    liveChart.data.datasets[0].borderColor=lineColor;
    liveChart.data.datasets[0].backgroundColor=fillColor;
    liveChart.update('none');
  }else{
    if(liveChart)liveChart.destroy();
    liveChart=new Chart(canvas,{type:'line',data:{labels,datasets:[{data:values,borderColor:lineColor,backgroundColor:fillColor,borderWidth:2,pointRadius:0,fill:true,tension:.25}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{grid:{color:'#20142a'},ticks:{color:'#75667f',callback:v=>'$'+Number(v).toFixed(v<1?5:2)}}}}});
    liveChart.mint=mint;
  }
  const last1=document.querySelector('#liveChartPrice');
  if(last1&&last!=null)last1.textContent='$'+(last<1?last.toFixed(6):last.toFixed(2));
}
function startLiveChart(mint,seedPrice){
  stopLiveChart();
  liveChartMint=mint;
  if(seedPrice!=null){priceHistory.set(mint,[{t:Date.now(),price:seedPrice}]);updateLiveChart(mint);}
  pollLivePrice(mint);
  liveChartInterval=setInterval(()=>pollLivePrice(mint),5000);
}
function stopLiveChart(){
  if(liveChartInterval){clearInterval(liveChartInterval);liveChartInterval=null;}
  if(liveChart){liveChart.destroy();liveChart=null;}
  liveChartMint=null;
}
async function load(){try{const h=await fetch('/api/health',{cache:'no-store'});systemHealth=await h.json();try{const cr=await fetch('/api/control',{credentials:'include',cache:'no-store'});const cj=await cr.json();if(cr.ok)controlState=cj.control;}catch{} const r=await fetch('/api/markets',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'MARKET_SCAN_FAILED');data=j;lastError='';render()}catch(e){lastError=e.message;renderError(e.message)}}
function renderError(msg){app.innerHTML=`<div class="shell"><main class="main"><div class="error"><img src="/budsky-logo.jpg" style="width:75px;border-radius:22px"><h2>Budsky is waiting for live market data</h2><p>${esc(msg)}</p><button class="wallet" onclick="load()">Retry</button></div></main></div>`}
async function connectWallet(){try{const p=window.phantom?.solana||window.solana||window.solflare;if(!p){alert('Phantom or Solflare is not available in this browser. On mobile, open Budsky inside the wallet browser/deep-link flow.');return}const r=await p.connect();walletProvider=p;wallet=r.publicKey?.toString?.()||r.publicKey?.toBase58?.();const ch=await fetch('/api/wallet-challenge',{credentials:'include',cache:'no-store'});const cj=await ch.json();if(!ch.ok)throw new Error(cj.error||'WALLET_CHALLENGE_FAILED');if(!p.signMessage)throw new Error('WALLET_MESSAGE_SIGNING_UNAVAILABLE');const encoded=new TextEncoder().encode(cj.message);const signed=await p.signMessage(encoded);let b='';for(let i=0;i<signed.length;i+=0x8000)b+=String.fromCharCode(...signed.subarray(i,i+0x8000));const vr=await fetch('/api/wallet-verify',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({wallet,message:cj.message,signature:base58Encode(signed)})});const vj=await vr.json();if(!vr.ok)throw new Error(vj.error||'WALLET_AUTH_FAILED');render()}catch(e){console.error(e);wallet=null;walletProvider=null;alert(`Wallet authentication failed: ${e.message}`)}}

async function openControl(){
  try{
    const r=await fetch('/api/control',{credentials:'include',cache:'no-store'});const j=await r.json();
    if(!r.ok) throw new Error(j.error||'CONTROL_UNAVAILABLE'); controlState=j.control;
    document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="controlModal"><div class="dialog control-dialog"><div class="dialog-head"><div><div class="eyebrow">CONTROL CENTER</div><h2>Budsky operating mode</h2><p>Server-side control. Netlify environment variables are not changed by this switch.</p></div><button class="close" onclick="closeControl()">×</button></div><div class="mode-card ${controlState.mode==='LIVE'?'live':'paper'}"><div><span class="mode-label">CURRENT MODE</span><strong>${controlState.mode==='LIVE'&&controlState.liveEnabled?'LIVE ACTIVE':'PAPER / LOCKED'}</strong><small>${controlState.emergencyStop?'Emergency stop is active.':'Operational state is stored durably.'}</small></div><div class="mode-switch"><button class="${controlState.mode==='PAPER'?'selected':''}" onclick="setControl('SET_PAPER')">PAPER</button><button class="${controlState.mode==='LIVE'?'selected':''}" onclick="setControl('ACTIVATE_LIVE')">LIVE</button></div></div><div class="control-grid"><div><span>Deployment gate</span><b>${j.baseMode==='LIVE'&&j.baseLiveEnabled?'READY':'LOCKED'}</b></div><div><span>Emergency stop</span><b>${controlState.emergencyStop?'ACTIVE':'OFF'}</b></div><div><span>Control version</span><b>${controlState.version}</b></div><div><span>Last change</span><b>${new Date(controlState.updatedAtMs).toLocaleString()}</b></div></div><div class="control-warning">LIVE activation never bypasses server-side risk, transaction, signer, reconciliation, or safety gates. Emergency stop always disables new LIVE entries.</div><div class="actions"><button class="ghost" onclick="setControl('DEACTIVATE_LIVE')">Return to PAPER</button><button class="danger" onclick="setControl('EMERGENCY_STOP')">🛑 EMERGENCY STOP</button>${controlState.emergencyStop?`<button class="ghost" onclick="setControl('CLEAR_EMERGENCY_STOP')">Clear Emergency Stop</button>`:''}</div></div></div>`);
  }catch(e){alert(`Control Center unavailable: ${e.message}`)}
}
async function setControl(action){
  if(!wallet){alert('Connect and authenticate your wallet first.');return;}
  const messages={ACTIVATE_LIVE:'ACTIVATE LIVE? This enables real-money execution after all server gates pass.',DEACTIVATE_LIVE:'Return to PAPER mode?',SET_PAPER:'Switch to PAPER mode?',EMERGENCY_STOP:'EMERGENCY STOP: block LIVE immediately?',CLEAR_EMERGENCY_STOP:'Clear emergency stop?'};
  if(!confirm(messages[action]||'Confirm change?'))return;
  try{const r=await fetch('/api/control',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({action,wallet})});const j=await r.json();if(!r.ok)throw new Error(j.detail||j.error||'CONTROL_CHANGE_FAILED');controlState=j.control;closeControl();render();if(action==='ACTIVATE_LIVE')alert('LIVE is now armed at the control plane. Trading still requires every server-side safety gate.');else if(action==='EMERGENCY_STOP')alert('Emergency stop is ACTIVE. New LIVE entries are blocked.');}catch(e){alert(`Control change failed: ${e.message}`)}}
function closeControl(){document.querySelector('#controlModal')?.remove()}
function showAnalysis(mint){const x=data?.opportunities?.find(o=>o.mint===mint);if(!x)return;document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">FULL MARKET ANALYSIS</div><h2 style="font-family:'Space Grotesk';margin:5px 0">${esc(x.symbol)} · ${x.opportunityScore}/100</h2><div style="color:#786a82;font-size:9px">${esc(x.name)} · ${esc(x.category.replace('_',' '))}</div></div><button class="close" onclick="closeModal()">×</button></div><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px"><div style="display:flex;align-items:center;gap:6px;font-size:9px;color:#75667f;letter-spacing:.1em"><span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;animation:pulse 1.5s infinite"></span>LIVE PRICE</div><b id="liveChartPrice" style="font:700 18px 'Space Grotesk'">${money(x.priceUsd)}</b></div><div style="position:relative;height:130px;margin-bottom:14px"><canvas id="liveChart"></canvas></div><div class="analysis-grid"><div class="analysis-box"><span>TECHNICAL</span><b>${x.technicalScore}</b></div><div class="analysis-box"><span>MARKET</span><b>${x.marketScore}</b></div><div class="analysis-box"><span>RISK</span><b>${x.riskScore}</b></div></div><div class="reason-list"><b style="color:#e7d9ef">Why Budsky ranked it</b><br><span style="color:#c5a9d4">TA provenance: ${esc(x.technicalProvenance||'MISSING')} · Probability: ${esc(x.probabilityStatus||'UNAVAILABLE')}</span><br><br>${(x.reasons||[]).map(r=>'• '+esc(r)).join('<br>')}<br><br><span style="color:#66586f">Data timestamp: ${new Date(x.updatedAtMs).toLocaleString()}</span></div><button class="primary" style="width:100%;margin-top:14px;padding:11px;border-radius:9px" onclick="closeModal();openTrade('${esc(x.mint)}')">Open Position</button></div></div>`);startLiveChart(mint,x.priceUsd)}
function openTrade(mint){const x=data?.opportunities?.find(o=>o.mint===mint);if(!x)return;if(x.status==='AVOID'){alert('Budsky blocks this candidate because its current risk status is AVOID.');return}document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">OPEN POSITION</div><h2 style="font-family:'Space Grotesk';margin:5px 0">${esc(x.symbol)} / USDC</h2><div style="color:#786a82;font-size:9px">Opportunity ${x.opportunityScore}/100 · Risk ${x.riskScore}/100</div></div><button class="close" onclick="closeModal()">×</button></div><div class="trade-form"><label>AMOUNT (USDC)</label><input id="tradeAmount" type="number" min="1" step="1" placeholder="100"><div class="notice">Budsky will request a fresh Jupiter quote, run the Risk Engine, validate the transaction intent, then ask your connected wallet to sign. Budsky never asks for your seed phrase or private key.</div><button class="primary" style="padding:12px" onclick="prepareTrade('${esc(x.mint)}')">Review Live Trade</button></div></div></div>`)}
async function prepareTrade(mint){
 const amountText=String(document.querySelector('#tradeAmount')?.value||'').trim();
 if(!wallet||!walletProvider){alert('Connect Phantom or Solflare first.');return}
 if(!/^\d+(?:\.\d{1,6})?$/.test(amountText)||Number(amountText)<=0){alert('Enter a valid USDC amount.');return}
 const idempotency=(crypto.randomUUID?.()||(()=>{const a=new Uint32Array(4);crypto.getRandomValues(a);return Array.from(a).map(x=>x.toString(16).padStart(8,'0')).join('');})()).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
 try{
  const r=await fetch('/api/prepare-trade',{method:'POST',headers:{'content-type':'application/json','x-idempotency-key':idempotency},body:JSON.stringify({wallet,outputMint:mint,amountUsdc:amountText})});
  const j=await r.json(); if(!r.ok)throw new Error(j.error||'TRADE_PREPARATION_FAILED');
  pendingTrade={...j,idempotency};
  const q=j.quote||{};
  document.querySelector('#modal')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="dialog"><div class="dialog-head"><div><div class="eyebrow">JUPITER EXECUTION REVIEW</div><h2 style="font-family:'Space Grotesk';margin:5px 0">${esc(j.output?.symbol||mint)} / USDC</h2><div style="color:#786a82;font-size:9px">Budsky Risk Engine approved · Jupiter prepared the route</div></div><button class="close" onclick="cancelPendingTrade()">×</button></div><div class="analysis-grid"><div class="analysis-box"><span>YOU PAY</span><b>${esc(amountText)} USDC</b></div><div class="analysis-box"><span>EXPECTED</span><b>${esc(String(q.outAmount||'—'))}</b></div><div class="analysis-box"><span>MAX SLIPPAGE</span><b>${Number(q.slippageBps||0)/100}%</b></div></div><div class="reason-list"><b style="color:#e7d9ef">Execution path</b><br>1. Budsky Risk Engine → APPROVE<br>2. Jupiter Swap API → route + transaction<br>3. ${esc(walletProvider?.isPhantom?'Phantom':'Connected wallet')} → you approve the signature<br>4. Jupiter → managed transaction landing<br><br><span style="color:#786a82">This is an in-app Budsky trade powered by Jupiter. You do not need to open the Jupiter app separately.</span></div><button class="primary" style="width:100%;margin-top:14px;padding:12px;border-radius:9px" onclick="confirmTrade()">Sign & Execute via Jupiter</button></div></div>`);
 }catch(e){alert(`Trade not prepared: ${e.message}`)}
}
async function confirmTrade(){
 if(!pendingTrade||!walletProvider||!wallet){alert('Trade review expired. Start again.');return}
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
  closeModal();pendingTrade=null;alert(`Trade confirmed on Solana via Jupiter
${ej.result?.signature||ej.signature||''}`); await load();
 }catch(e){alert(`Trade not executed: ${e.message}`)}
}
async function reconcileTrade(idempotency){if(!idempotency)return;try{const r=await fetch('/api/reconcile-trade',{method:'POST',credentials:'include',headers:{'x-idempotency-key':idempotency}});const j=await r.json();if(j.state==='RECONCILED'){alert(`Trade reconciled on Solana
${j.signature}`);await load();return}alert(`Reconciliation status: ${j.state||j.error}
${j.reason||''}`)}catch(e){alert(`Reconciliation failed: ${e.message}`)}}
function cancelPendingTrade(){pendingTrade=null;closeModal()}
function closeModal(){stopLiveChart();document.querySelector('#modal')?.remove()}
function openPortfolio(){if(!wallet){alert('Connect your wallet to view the live portfolio.');return}alert('Portfolio view uses your connected public wallet address and live Solana RPC balances.');}
window.setFilter=x=>{filter=x;render()};window.setSort=x=>{sort=x;render()};window.showAnalysis=showAnalysis;window.openTrade=openTrade;window.prepareTrade=prepareTrade;window.confirmTrade=confirmTrade;window.cancelPendingTrade=cancelPendingTrade;window.reconcileTrade=reconcileTrade;window.closeModal=closeModal;window.openPortfolio=openPortfolio;window.load=load;window.openControl=openControl;window.setControl=setControl;window.closeControl=closeControl;
render();load();setInterval(load,20000);setInterval(()=>{const c=document.querySelector('#clock');if(c)c.textContent=new Date().toLocaleTimeString()},1000);
