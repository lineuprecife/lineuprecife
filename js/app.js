/* =====================================================================
   CONFIGURAÇÃO — é só aqui que se mexe.
   ===================================================================== */
var CONFIG = {
  /* Código da planilha: o trecho entre /d/ e /edit no endereço dela. (bd_lineup_recife) */
  sheetId: "15Vhne-dxn4Pw_LuqMwNluvJAE5FuZZYYPtgZaJ7R_kI",

  /* BANCO ÚNICO: uma aba só (BANCO), uma linha por navio; a coluna "Situação" (Previsto, Fundeado,
     Atracado, Desatracado) decide em qual lista o navio aparece. Para voltar a ler 4 abas separadas,
     apague o bloco "banco" abaixo.
     "url": opcional. Se a aba BANCO foi publicada na web em CSV, cole o link aqui (é o caminho mais
     garantido; sem ele a página lê direto da planilha compartilhada). */
  banco: {sheet:"BANCO", url:""},

  /* (Só vale se o bloco "banco" acima for apagado.) Nome de cada aba, exatamente como aparece embaixo na planilha.
     "layout" diz em que colunas estão os dados (veja LAYOUTS abaixo).
     "url": opcional. Se a aba foi publicada na web em CSV, cole o link aqui. */
  tabs: {
    atracados:    {sheet:"ATRACADOS",    layout:"atracados", url:""},
    previstos:    {sheet:"PREVISTOS",    layout:"previstos", url:""},
    fundeados:    {sheet:"FUNDEADOS",    layout:"previstos", url:""},
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
  previstos: {chegada:0, atracacao:1, saida:2, cais:3, navio:4, imo:5, comp:6, calado:7, agencia:8, operador:9, carga:10, mod:11, origem:12, anterior:13, proximo:14, prev:15}
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
function toNum(v){
  var s = String(v==null?"":v).trim().replace(/[^\d.,-]/g,""); if(!s) return 0;
  if(s.indexOf(",")>=0) s = s.replace(/\./g,"").replace(",",".");          /* 1.234,5 -> 1234.5 */
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,"");      /* 10.000 -> 10000 */
  var n = parseFloat(s); return isNaN(n)?0:n;
}
function cap(s){ return s ? s.charAt(0)+s.slice(1).toLowerCase() : s; }
var DATE_RE = /^\d\d\/\d\d\/\d{4}/;

/* Lê as colunas pelo NOME do cabeçalho (cada aba pode ter colunas em posições diferentes). */
var HDR = {chegada:/chegada/, saida:/saida|desatrac/, cais:/^cais/, navio:/^navio|embarcac/, cbo:/^cbo/, imo:/^imo/, comp:/compr/, calado:/calado/, agencia:/agencia/, operador:/operador/, carga:/^carga/, mod:/modalidade/, origem:/proced|destino/, anterior:/anterior/, proximo:/proximo/, prev:/tonelagem.*prev|^prev.*ton/, mov:/movimentad/, ton:/^tonelagem$/, atracacao:/atracacao/};
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
      atracacao: L.atracacao!=null ? clean(r[L.atracacao]) : "",
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

/* ===== BANCO ÚNICO (aba BANCO) =====
   Lê as colunas pelo NOME do cabeçalho, então a ordem das colunas na planilha pode mudar à vontade.
   Colunas esperadas: Situação, Previsão de Chegada, Previsão de Atracação, Atracação, Previsão Desatracação,
   Desatracação, Previsão de Cais, Cais Atracado, Navio, IMO, CBO, Compr., Calado, Agência de Navegação,
   Operador Portuário, Carga, Modalidade, Procedência / Destino da Carga, Porto Anterior, Próximo Porto,
   Tonelagem Prevista, Tonelagem Movimentada, Saldo, Tonelagem final. (Saldo é recalculado pela página.) */
var BCOL = {
  situacao:[/^situacao$/], navio:[/^navio/,/embarcac/], imo:[/^imo$/], cbo:[/^cbo$/],
  prevChegada:[/^previsao de chegada/], chegadaConf:[/^chegada confirmada/],
  prevAtrac:[/^previsao de atracacao/], atrac:[/^atracacao$/,/^chegada$/],
  prevSaida:[/^previsao (de )?(desatracacao|saida)/], saida:[/^desatracacao$/,/^saida$/],
  prevCais:[/^previsao de cais/], cais:[/^cais atracado/,/^cais$/],
  comp:[/^compr/], calado:[/^calado/], agencia:[/^agencia/], operador:[/^operador/], carga:[/^carga$/], mod:[/^modalidade/],
  origem:[/^proced|destino/], anterior:[/^porto anterior/], proximo:[/^proximo porto/],
  prev:[/^tonelagem prevista/], mov:[/^tonelagem movimentada/], final:[/^tonelagem final/]
};
function bancoCols(rows){
  for(var i=0;i<Math.min(rows.length,6);i++){
    var h = rows[i].map(normH);
    if(h.indexOf("situacao")<0 || !h.some(function(t){ return /^navio/.test(t); })) continue;
    var L = {hdr:i};
    Object.keys(BCOL).forEach(function(k){
      BCOL[k].forEach(function(re){ if(L[k]==null) h.forEach(function(t,c){ if(L[k]==null && re.test(t)) L[k] = c; }); });
    });
    return L;
  }
  return null;
}
function dataBR(v){   /* aceita 22/10/2026 07:00(:00) e 2026-10-22 07:00; devolve dd/mm/aaaa hh:mm */
  v = String(v==null?"":v).trim();
  var m = /^(\d\d\/\d\d\/\d{4})(?:[ T](\d\d:\d\d))?/.exec(v);
  if(m) return m[1]+(m[2]?" "+m[2]:"");
  m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d:\d\d))?/.exec(v);
  return m ? m[3]+"/"+m[2]+"/"+m[1]+(m[4]?" "+m[4]:"") : "";
}
function sitDe(v){
  var t = normH(v);
  if(/^previst|^programad/.test(t)) return "previstos";
  if(/^fundead|^aguard|^ao largo/.test(t)) return "fundeados";
  if(/^desatrac/.test(t)) return "desatracados";
  if(/^atrac/.test(t)) return "atracados";
  return "";
}
function mapBanco(rows){
  var L = bancoCols(rows); if(!L) throw new Error("cabecalho");
  var by = {previstos:[], fundeados:[], atracados:[], desatracados:[]}, aviso = "";
  rows.forEach(function(r, idx){
    if(idx <= L.hdr) return;
    var a = String(r[L.situacao]||"").trim();
    if(/^(nota|aviso)/i.test(a)){ var t = String(r[L.situacao+1]||"").trim(); if(t) aviso = t; return; }   /* linha "AVISO | texto" vira a faixa amarela do topo */
    var sit = sitDe(a);
    var g = function(k){ return L[k]==null ? "" : clean(r[L[k]]); };
    var d = function(k){ return L[k]==null ? "" : dataBR(r[L[k]]); };
    var navio = g("navio"); if(!sit || !navio) return;
    var prevL = sit==="previstos" || sit==="fundeados", desat = sit==="desatracados";
    var s = {
      chegada: prevL ? (d("chegadaConf") || d("prevChegada") || d("atrac")) : (d("atrac") || d("chegadaConf") || d("prevChegada")),
      atracacao: d("prevAtrac"),
      saida: desat ? (d("saida") || d("prevSaida")) : d("prevSaida"),
      cais: prevL ? (g("prevCais") || g("cais")) : (g("cais") || g("prevCais")),
      navio: navio, cbo: g("cbo"), imo: g("imo"),
      comp: g("comp"), calado: g("calado"), agencia: g("agencia"), operador: g("operador"), carga: g("carga"),
      mod: g("mod").toUpperCase(), origem: g("origem"), anterior: g("anterior"), proximo: g("proximo"),
      prev: toNum(g("prev")), mov: toNum(desat ? g("final") : g("mov")), tipo: ""
    };
    s.id = sit+"-"+(idx+1); s.row = idx+1; s.raw = r; s.modRaw = s.mod;
    if(s.mod!=="IMPORTAÇÃO" && s.mod!=="EXPORTAÇÃO" && !s.prev){
      var t2 = s.mod || s.carga;
      if(t2){ s.tipo = cap(t2); s.mod = ""; }
    }
    if(!/ m$/i.test(s.comp) && s.comp) s.comp += " m";
    by[sit].push(s);
  });
  if(typeof ord === "function") Object.keys(by).forEach(function(k){ by[k].sort(function(x, y){ return ord(k, x, y); }); });
  return {by:by, aviso:aviso};
}
function loadBanco(){
  var b = CONFIG.banco;
  var url = b.url || "https://docs.google.com/spreadsheets/d/"+encodeURIComponent(CONFIG.sheetId)+"/gviz/tq?tqx=out:csv&sheet="+encodeURIComponent(b.sheet);
  return fetch(url, {cache:"no-store"}).then(function(res){
    if(!res.ok) throw new Error("HTTP "+res.status);
    return res.text();
  }).then(function(text){
    if(/^\s*<(!doctype|html)/i.test(text)) throw new Error("login");
    return mapBanco(parseCsv(text));
  });
}
function refreshBanco(){
  return loadBanco().then(function(r){
    var d = new Date(), agora = p2(d.getDate())+"/"+p2(d.getMonth()+1)+"/"+d.getFullYear()+" "+p2(d.getHours())+":"+p2(d.getMinutes());
    TABS.forEach(function(t){
      var items = r.by[t.id]; if(t.id==="desatracados") items = items.filter(recente);   /* só os últimos dias; o histórico fica na planilha */
      data[t.id] = {items:items, aviso:r.aviso, atualizado:agora}; errors[t.id] = false;
    });
    lastOk = p2(d.getHours())+":"+p2(d.getMinutes()); lastErr = "";
  }).catch(function(e){ lastErr = String((e && e.message) || ""); TABS.forEach(function(t){ errors[t.id] = true; }); }).then(renderAll);
}
function nomeAba(id){ return (CONFIG.banco && !CONFIG.api) ? CONFIG.banco.sheet : CONFIG.tabs[id].sheet; }

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
var lastOk = null, lastErr = "";

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
  var prevList = lista==="previstos" || lista==="fundeados", special = !!s.tipo;
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
    when = '<div>Chegada '+esc(fmt(s.chegada))+'</div>'+(chega?'<div class="rel">'+esc(chega)+'</div>':'')+(s.atracacao?'<div>Atracação (POB) '+esc(fmt(s.atracacao))+'</div>':'')+(s.saida?'<div>Saída '+esc(fmt(s.saida))+'</div>':'');
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
var BERCOS = ["00-TA","1","2","3","4","5","6","7","8","9"];
function caisKeys(c){   /* "2" -> ["2"]; "0 E 1" -> ["00-TA","1"]; "7 / CB" -> ["7"]; "MARINA" -> [] */
  var out = [];
  (String(c == null ? "" : c).toUpperCase().match(/00-TA|TA|\d+/g) || []).forEach(function(t){
    var k = (t === "00-TA" || t === "TA" || /^0+$/.test(t)) ? "00-TA" : String(parseInt(t, 10));
    if(BERCOS.indexOf(k) >= 0 && out.indexOf(k) < 0) out.push(k);
  });
  return out;
}
function renderBerths(){
  var map = {};
  listOf("atracados").forEach(function(s){ caisKeys(s.cais).forEach(function(k){ (map[k] = map[k] || []).push(s.navio); }); });
  $("berths").innerHTML = BERCOS.map(function(k){
    var sh = map[k], vis = sh ? (sh.length > 3 ? sh.slice(0, 2) : sh) : [];
    var lines = vis.map(function(n){ return "<span>" + esc(n) + "</span>"; }).join("") + (sh && sh.length > 3 ? '<span class="mais">+' + (sh.length - 2) + " navios</span>" : "");
    return '<div class="berth ' + (sh ? "busy" : "free") + '"' + (sh ? ' title="' + esc(sh.join(", ")) + '"' : "") + '><div class="c">CAIS ' + k + '</div><div class="s">' + (sh ? lines : "Livre") + "</div></div>";
  }).join("");
  if(typeof renderMapa === "function") renderMapa();
}
function renderPanel(){
  var id = state.tab, el = $("panel");
  var ms = document.getElementById("mapa-sec"); if(ms) ms.hidden = id !== "atracados";   /* mapa só faz sentido para quem está atracado */
  $("btn-view").textContent = viewOf(id)==="tabela" ? "Ver como cartões" : "Ver tabela completa";
  if(!data[id]){
    el.innerHTML = '<div class="empty">'+(errors[id] ? "Não foi possível ler a aba "+esc(nomeAba(id))+". Veja a mensagem no topo da página." : "Carregando a planilha…")+'</div>';
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
  var bad = TABS.filter(function(t){return errors[t.id]}).map(function(t){return nomeAba(t.id)}).filter(function(n,i,a){return a.indexOf(n)===i});
  var w = $("warn");
  if(bad.length){
    w.hidden = false;
    $("warn-t").textContent = "Não foi possível ler "+(bad.length>1?"as abas ":"a aba ")+bad.join(", ")+". Confira se a planilha está compartilhada como \"Qualquer pessoa com o link\" (leitor) e se o nome da aba está igual ao da planilha."+(lastErr==="cabecalho"?" A primeira linha da aba precisa ter as colunas Situação e Navio.":"")+(lastOk?" Os dados abaixo são da última leitura, às "+lastOk+".":"");
  } else w.hidden = true;
  $("src").textContent = lastOk ? "Lido da planilha às "+lastOk+" · atualiza a cada "+CONFIG.refreshSeconds+" s" : "Lendo a planilha…";
}
function renderAll(){ renderHead(); renderTabs(); renderBerths(); renderPanel(); }

function refresh(){
  if(CONFIG.api) return refreshApi();
  if(CONFIG.banco) return refreshBanco();
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
