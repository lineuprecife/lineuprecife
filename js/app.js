/* =====================================================================
   CONFIGURAÇÃO — é só aqui que se mexe.
   ===================================================================== */
var CONFIG = {
  /* Código da planilha: o trecho entre /d/ e /edit no endereço dela. */
  sheetId: "1XjIAXf2Gvq-qDe9cvhflgSkjTF3CJ-019d9Uqr2MDRg",

  /* Nome de cada aba, exatamente como aparece embaixo na planilha.
     "layout" diz em que colunas estão os dados (veja LAYOUTS abaixo).
     "url": opcional. Se a aba foi publicada na web em CSV, cole o link aqui. */
  tabs: {
    atracados:    {sheet:"ATRACADOS",    layout:"atracados", url:""},
    previstos:    {sheet:"PREVISTOS",    layout:"previstos", url:""},
    fundeados:    {sheet:"FUNDEADOS",    layout:"atracados", url:""},
    desatracados: {sheet:"DESATRACADOS", layout:"desatracados", url:""}
  },

  /* A página relê a planilha sozinha a cada tantos segundos. */
  api: "",   /* endereço do Apps Script (passo a passo no final da conversa) */
  diasDesatracados: 7,   /* quantos dias os desatracados continuam aparecendo na lista */
  refreshSeconds: 60,

  telefones: "81 3183-1919 · 81 99488-2036",
  emails: "operacoes@portodorecife.pe.gov.br · pedro.guarines@portodorecife.pe.gov.br"
};

/* Posição de cada informação na linha da planilha (A = 0, B = 1, C = 2...). */
var LAYOUTS = {
  atracados: {chegada:0, saida:1, cais:2, navio:3, cbo:4, comp:5, calado:6, agencia:7, operador:8, carga:9, mod:10, origem:11, anterior:12, proximo:13, prev:14, mov:15},
  desatracados: {saida:0, cais:1, navio:2, cbo:3, comp:4, calado:5, agencia:6, operador:7, carga:8, mod:9, origem:10, anterior:11, proximo:12, prev:13, mov:13},
  previstos: {chegada:0, saida:2, cais:3, navio:4, imo:5, comp:6, calado:7, agencia:8, operador:9, carga:10, mod:11, origem:12, anterior:13, proximo:14, prev:15}
};

/* ===== LEITURA DA PLANILHA ===== */
var TABS = [
  {id:"atracados",label:"Atracados"},
  {id:"previstos",label:"Previstos"},
  {id:"fundeados",label:"Fundeados"},
  {id:"desatracados",label:"Desatracados"}
];

function parseCsv(text){
  var rows = [], row = [], cell = "", q = false, i = 0, c;
  text = String(text).replace(/^\uFEFF/,"");
  for(; i<text.length; i++){
    c = text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if(c==='"'){ q = true; }
    else if(c===","){ row.push(cell); cell = ""; }
    else if(c==="\n" || c==="\r"){
      if(c==="\r" && text[i+1]==="\n") i++;
      row.push(cell); cell = ""; rows.push(row); row = [];
    } else cell += c;
  }
  if(cell!=="" || row.length){ row.push(cell); rows.push(row); }
  return rows;
}
function clean(v){
  v = String(v==null?"":v).trim();
  var u = v.toUpperCase();
  return (u==="N/I" || u==="N/A" || u==="-" ) ? "" : v;
}
function toNum(v){ var n = parseInt(String(v||"").replace(/\D/g,""),10); return isNaN(n)?0:n; }
function cap(s){ return s ? s.charAt(0)+s.slice(1).toLowerCase() : s; }
var DATE_RE = /^\d\d\/\d\d\/\d{4}/;

/* Lê as colunas pelo NOME do cabeçalho (cada aba pode ter colunas em posições diferentes). */
var HDR = {chegada:/chegada/, saida:/saida|desatrac/, cais:/^cais/, navio:/^navio|embarcac/, cbo:/^cbo/, imo:/^imo/, comp:/compr/, calado:/calado/, agencia:/agencia/, operador:/operador/, carga:/^carga/, mod:/modalidade/, origem:/proced|destino/, anterior:/anterior/, proximo:/proximo/, prev:/tonelagem.*prev|^prev.*ton/, mov:/movimentad/, ton:/^tonelagem$/};
function normH(t){ return String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }
function layoutPorCabecalho(rows){
  for(var i=0;i<Math.min(rows.length,8);i++){
    if(!/^(chegada|saida|previs)/.test(normH(rows[i][0]))) continue;
    var L = {};
    rows[i].forEach(function(h,c){ var t = normH(h); Object.keys(HDR).forEach(function(k){ if(L[k]==null && HDR[k].test(t)) L[k] = c; }); });
    if(L.ton!=null && L.mov==null){ L.mov = L.ton; L.prev = L.ton; }   /* aba com uma só coluna "Tonelagem" */
    return L.navio!=null ? L : null;
  }
  return null;
}
function recente(s){ var d = parseDate(s.saida||s.chegada); return !d || +d >= Date.now()-(CONFIG.diasDesatracados||7)*864e5; }

function mapRows(rows, layout){
  var L = LAYOUTS[layout] || LAYOUTS.atracados;
  L = layoutPorCabecalho(rows) || L;
  var items = [], aviso = "", atualizado = "";
  rows.forEach(function(r, idx){
    var a = String(r[0]||"").trim();
    if(/^NOTA/i.test(a)){ var t = String(r[1]||"").trim(); if(t) aviso = t; return; }
    if(idx<4 && !atualizado){
      for(var k=0;k<r.length;k++){ if(/^\d\d\/\d\d\/\d{4} \d\d:\d\d/.test(String(r[k]||"").trim())){ atualizado = String(r[k]).trim(); break; } }
    }
    if(!DATE_RE.test(a)) return;
    var navio = clean(r[L.navio]);
    if(!navio) return;
    var s = {
      chegada: L.chegada!=null ? a : "",
      saida: clean(r[L.saida]),
      cais: clean(r[L.cais]),
      navio: navio,
      cbo: L.cbo!=null ? clean(r[L.cbo]) : "",
      imo: L.imo!=null ? clean(r[L.imo]) : "",
      comp: clean(r[L.comp]),
      calado: clean(r[L.calado]),
      agencia: clean(r[L.agencia]),
      operador: clean(r[L.operador]),
      carga: clean(r[L.carga]),
      mod: clean(r[L.mod]).toUpperCase(),
      origem: clean(r[L.origem]),
      anterior: clean(r[L.anterior]),
      proximo: clean(r[L.proximo]),
      prev: toNum(r[L.prev]),
      mov: L.mov!=null ? toNum(r[L.mov]) : 0,
      tipo: ""
    };
    s.row=idx+1; s.raw=r; s.modRaw=s.mod;
    if(s.mod!=="IMPORTAÇÃO" && s.mod!=="EXPORTAÇÃO" && !s.prev){
      var t2 = s.mod || s.carga;
      if(t2){ s.tipo = cap(t2); s.mod = ""; }
    }
    if(!/ m$/i.test(s.comp) && s.comp) s.comp += " m";
    items.push(s);
  });
  return {items:items, aviso:aviso, atualizado:atualizado};
}

function tabUrl(t){
  if(t.url) return t.url;
  return "https://docs.google.com/spreadsheets/d/"+encodeURIComponent(CONFIG.sheetId)+"/gviz/tq?tqx=out:csv&sheet="+encodeURIComponent(t.sheet);
}
function loadTab(id){
  var t = CONFIG.tabs[id];
  return fetch(tabUrl(t), {cache:"no-store"}).then(function(res){
    if(!res.ok) throw new Error("HTTP "+res.status);
    return res.text();
  }).then(function(text){
    if(/^\s*<(!doctype|html)/i.test(text)) throw new Error("login");
    var r = mapRows(parseCsv(text), t.layout);
    if(id==="desatracados") r.items = r.items.filter(recente);   /* só os últimos dias */
    return r;
  });
}

/* === INTERFACE === */
var MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
var HEADS = {
  atracados:["Cais","Navio","Carga","Agência / Operador","Datas","Carga movimentada"],
  previstos:["Cais","Navio","Carga","Agência / Operador","Datas","Tonelagem prevista"],
  fundeados:["Cais","Navio","Carga","Agência / Operador","Datas","Carga prevista"],
  desatracados:["Cais","Navio","Carga","Agência / Operador","Datas","Carga movimentada"]
};
var EMPTY = {
  atracados:"Nenhum navio atracado no momento.",
  previstos:"Nenhum navio previsto no momento.",
  fundeados:"Nenhum navio fundeado no momento.",
  desatracados:"Nenhum navio desatracado nesta lista."
};
var state = {tab:"atracados", mod:"", q:""};
var data = {};      /* id -> {items, aviso, atualizado} da última leitura boa */
var errors = {};    /* id -> true quando a última leitura falhou */
var lastOk = null;

function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function $(id){return document.getElementById(id)}
function p2(n){return ("0"+n).slice(-2)}
function parseDate(s){
  var m = /^(\d\d)\/(\d\d)\/(\d{4})(?: (\d\d):(\d\d))?/.exec(s||"");
  return m ? new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0)) : null;
}
function fmt(s){
  var d = parseDate(s); if(!d) return "";
  var t = d.getDate()+" "+MES[d.getMonth()];
  if(d.getFullYear()!==new Date().getFullYear()) t += " "+d.getFullYear();
  return t+" · "+p2(d.getHours())+":"+p2(d.getMinutes());
}
function rel(s,verb){
  var d = parseDate(s); if(!d) return "";
  var h = (d - new Date())/36e5;
  if(h<=0) return "";
  return verb+" "+(h<24 ? "em "+Math.max(1,Math.round(h))+" h" : "em "+Math.round(h/24)+" d");
}
function num(n){return Number(n||0).toLocaleString("pt-BR")}
function modPill(m){
  if(!m) return "";
  return '<span class="pill'+(m==="EXPORTAÇÃO"?" exp":"")+'">'+esc(cap(m))+'</span>';
}
function listOf(id){ return (data[id] && data[id].items) || []; }

function rowBase(s,lista){
  var prevList = lista==="previstos", special = !!s.tipo;
  var pct = s.prev>0 ? Math.min(100,Math.round((s.mov||0)/s.prev*100)) : 0;
  var meta = [];
  if(s.cbo) meta.push('<span class="mono">CBO '+esc(s.cbo)+'</span>');
  if(s.imo) meta.push('<span class="mono">IMO '+esc(s.imo)+'</span>');
  if(s.comp) meta.push(esc(s.comp));
  if(s.calado) meta.push('calado '+esc(s.calado));
  var cargo = special
    ? '<div class="cargo">'+esc(s.tipo)+'</div><span class="pill neutral">Sem carga</span>'
    : '<div class="cargo">'+esc(cap(s.carga)||"Não informada")+'</div>'+modPill(s.mod)+(s.origem?'<div class="meta">Origem/destino: '+esc(s.origem)+'</div>':'');
  var when, prog;
  if(prevList){
    var chega = rel(s.chegada,"chega");
    when = '<div>Chegada '+esc(fmt(s.chegada))+'</div>'+(chega?'<div class="rel">'+esc(chega)+'</div>':'')+(s.saida?'<div>Saída '+esc(fmt(s.saida))+'</div>':'');
    prog = '<div><b>'+num(s.prev)+'</b> t</div>'+(s.anterior?'<div class="meta">Vem de '+esc(s.anterior)+'</div>':'');
  } else {
    when = '<div>Chegada '+esc(fmt(s.chegada))+'</div>'+
      (s.saida?'<div>Saída '+esc(fmt(s.saida))+'</div>'+(lista==="atracados"?'<div class="rel">'+esc(rel(s.saida,"sai"))+'</div>':''):'<div class="meta">Saída não informada</div>');
    if(special || !s.prev){ prog = '<span class="meta">Sem movimentação de carga</span>'; }
    else if(lista==="fundeados"){ prog = '<div><b>'+num(s.prev)+'</b> t previstas</div>'; }
    else { prog = '<div class="bar"><i style="width:'+pct+'%"></i></div><div><b>'+num(s.mov)+'</b> de '+num(s.prev)+' t · '+pct+'%</div><div class="meta">Saldo '+num(s.prev-(s.mov||0))+' t</div>'; }
  }
  if(lista==="desatracados"){
    when = (s.chegada?'<div>Chegada '+esc(fmt(s.chegada))+'</div>':'')+(s.saida?'<div>Saída '+esc(fmt(s.saida))+'</div>':'<div class="meta">Saída não informada</div>');
    if(!special && (s.mov||s.prev)) prog = '<div><b>'+num(s.mov||s.prev)+'</b> t movimentadas</div>';
  }
  return '<div class="row">'+
    '<div class="c-berth berth-n'+(s.cais.length>3?' sm':'')+'"><small>CAIS</small>'+(s.cais?esc(s.cais):"—")+'</div>'+
    '<div class="c-ship"><div class="ship">'+esc(s.navio)+'</div><div class="meta">'+meta.join(" · ")+'</div></div>'+
    '<div class="c-rest">'+
      '<div class="c-cargo"><span class="lab">Carga</span>'+cargo+'</div>'+
      '<div class="c-who who"><span class="lab">Agência / Operador</span><b>'+esc(s.agencia||"Não informada")+'</b><span class="meta">'+(s.operador?esc(s.operador):"Sem operador")+'</span></div>'+
      '<div class="c-when when"><span class="lab">Datas</span>'+when+'</div>'+
      '<div class="c-prog prog"><span class="lab">'+esc(HEADS[lista][5])+'</span>'+prog+'</div>'+
    '</div></div>';
}
function matches(s){
  if(state.mod && s.mod!==state.mod) return false;
  if(state.q){
    var hay = [s.navio,s.carga,s.agencia,s.operador,s.origem,s.tipo].join(" ").toLowerCase();
    if(hay.indexOf(state.q)<0) return false;
  }
  return true;
}
function renderTabs(){
  $("tabs").innerHTML = TABS.map(function(t){
    var sel = t.id===state.tab;
    var n = data[t.id] ? data[t.id].items.length : "—";
    return '<button class="tab" role="tab" type="button" data-t="'+t.id+'" aria-selected="'+sel+'"><span class="n">'+n+'</span><span class="l">'+t.label+'</span></button>';
  }).join("");
}
function renderBerths(){
  var map = {};
  listOf("atracados").forEach(function(s){ if(s.cais){ (map[s.cais]=map[s.cais]||[]).push(s.navio); } });
  var html = "";
  for(var c=2;c<=9;c++){
    var sh = map[String(c)];
    html += '<div class="berth '+(sh?"busy":"free")+'"><div class="c">CAIS '+c+'</div><div class="s">'+(sh?sh.map(esc).join("<br>"):"Livre")+'</div></div>';
  }
  $("berths").innerHTML = html;
}
function renderPanel(){
  var id = state.tab, el = $("panel");
  $("btn-view").textContent = viewOf(id)==="tabela" ? "Ver como cartões" : "Ver tabela completa";
  if(!data[id]){
    el.innerHTML = '<div class="empty">'+(errors[id] ? "Não foi possível ler a aba "+esc(CONFIG.tabs[id].sheet)+". Veja a mensagem no topo da página." : "Carregando a planilha…")+'</div>';
    return;
  }
  var all = data[id].items, items = all.filter(matches);
  if(!items.length){
    el.innerHTML = '<div class="empty">'+(all.length ? "Nenhum navio encontrado com esses filtros." : EMPTY[id])+'</div>';
    return;
  }
  if(viewOf(id)==="tabela"){ el.innerHTML = tabelaHtml(id, items); return; }
  el.innerHTML = '<div class="row head">'+HEADS[id].map(function(h){return '<div>'+h+'</div>'}).join("")+'</div>' +
    items.map(function(s){return row(s,id)}).join("");
}
function renderHead(){
  var base = data.atracados || data.previstos || null;
  $("stamp").textContent = (base && base.atualizado) || "—";
  var avisoSrc = data.atracados && data.atracados.aviso ? data.atracados.aviso : "";
  $("notice").hidden = !avisoSrc;
  if(avisoSrc){
    var txt = avisoSrc;
    if(txt === txt.toUpperCase()){ txt = txt.toLowerCase(); txt = txt.charAt(0).toUpperCase()+txt.slice(1); }
    $("notice-t").textContent = txt;
  }
  var bad = TABS.filter(function(t){return errors[t.id]}).map(function(t){return CONFIG.tabs[t.id].sheet});
  var w = $("warn");
  if(bad.length){
    w.hidden = false;
    $("warn-t").textContent = "Não foi possível ler "+(bad.length>1?"as abas ":"a aba ")+bad.join(", ")+". Confira se a planilha está compartilhada como \"Qualquer pessoa com o link\" (leitor) e se o nome da aba está igual ao da planilha."+(lastOk?" Os dados abaixo são da última leitura, às "+lastOk+".":"");
  } else w.hidden = true;
  $("src").textContent = lastOk ? "Lido da planilha às "+lastOk+" · atualiza a cada "+CONFIG.refreshSeconds+" s" : "Lendo a planilha…";
}
function renderAll(){ renderHead(); renderTabs(); renderBerths(); renderPanel(); }

function refresh(){
  if(CONFIG.api) return refreshApi();
  var jobs = TABS.map(function(t){
    return loadTab(t.id).then(function(r){ data[t.id] = r; errors[t.id] = false; return true; },
                              function(){ errors[t.id] = true; return false; });
  });
  Promise.all(jobs).then(function(oks){
    if(oks.some(Boolean)){ var d = new Date(); lastOk = p2(d.getHours())+":"+p2(d.getMinutes()); }
    renderAll();
  });
}

$("tabs").addEventListener("click",function(e){
  var b = e.target.closest("[data-t]"); if(!b) return;
  state.tab = b.getAttribute("data-t"); renderTabs(); renderPanel();
});
$("chips").addEventListener("click",function(e){
  var b = e.target.closest("[data-m]"); if(!b) return;
  state.mod = b.getAttribute("data-m");
  Array.prototype.forEach.call(document.querySelectorAll("#chips .chip"),function(c){ c.setAttribute("aria-pressed", String(c===b)); });
  renderPanel();
});
$("q").addEventListener("input",function(e){ state.q = e.target.value.trim().toLowerCase(); renderPanel(); });
document.addEventListener("visibilitychange",function(){ if(!document.hidden) refresh(); });

$("f-tel").textContent = CONFIG.telefones;
$("f-mail").textContent = CONFIG.emails;
var h0 = (location.hash||"").replace("#","");
if(TABS.some(function(t){return t.id===h0})) state.tab = h0;
renderAll();
refresh();
setInterval(refresh, Math.max(15, CONFIG.refreshSeconds)*1000);
