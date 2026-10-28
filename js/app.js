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
  banco: {sheet:"BANCO", url:"https://docs.google.com/spreadsheets/d/e/2PACX-1vTh-SB8_7r_RVvPQ-1DcqZNXKntlghVag1el1uGWedOy_c0ZZPHgHLZ-izmPJCKl2ZpByBDKMtzHjSv/pub?gid=1623702709&single=true&output=csv"},

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
  api: "https://script.google.com/macros/s/AKfycbxYxDWdKmQxIh1KdYRAoq8BIq2mhsvMZIKRoJAo9udnt_X2E2cJO4335ARJ9jJcGWvQgw/exec",   /* cole aqui o endereço do Apps Script (termina em /exec). Com ele, entra o login por pessoa e a página passa a ler direto do Apps Script */
  diasDesatracados: 9999,   /* quantos dias os desatracados continuam aparecendo na lista */
  refreshSeconds: 60,

  /* Rodapé, na ordem: endereço, telefone, setor. O e-mail é opcional: deixe "" para não mostrar. */
  endereco: "Praça Comunidade Luso-Brasileira, 70, Bairro do Recife, Recife/PE — CEP: 50030-280",
  telefones: "(81) 3183-1919",
  setor: "COOPE — Coordenadoria de Operações do Porto do Recife",
  emails: "operacoes@portodorecife.pe.gov.br",

  /* Responsável pelo preenchimento (aparece junto da data de atualização). Pode ser coordenador, gerente etc.
     Para trocar sem mexer no código: na aba BANCO, coluna Situação = RESPONSÁVEL; ao lado o nome e, nas colunas
     seguintes (em qualquer ordem, ambos opcionais), o cargo e o e-mail. Exemplo: RESPONSÁVEL | Maria Souza | Gerente de Operações | maria@... */
  responsavel: {nome:"Pedro Guarines", cargo:"Coordenador de Operações", email:"pedro.guarines@portodorecife.pe.gov.br", telefone:""}
};

/* Posição de cada informação na linha da planilha (A = 0, B = 1, C = 2...). */
var LAYOUTS = {
  atracados: {chegada:0, saida:1, cais:2, navio:3, cbo:4, comp:5, calado:6, agencia:7, operador:8, carga:9, mod:10, origem:11, anterior:12, proximo:13, prev:14, mov:15},
  desatracados: {saida:0, cais:1, navio:2, cbo:3, comp:4, calado:5, agencia:6, operador:7, carga:8, mod:9, origem:10, anterior:11, proximo:12, prev:13, mov:13},
  previstos: {chegada:0, atracacao:1, saida:2, cais:3, navio:4, imo:5, comp:6, calado:7, agencia:8, operador:9, carga:10, mod:11, origem:12, anterior:13, proximo:14, prev:15}
};

/* ===== LEITURA DA PLANILHA ===== */
var TABS = [
  {id:"rascunhos",label:"Rascunhos"},   /* só aparece para quem é da previsão (acostagem) e entrou com login */
  {id:"previstos",label:"Previstos"},
  {id:"fundeados",label:"Fundeados"},
  {id:"atracados",label:"Atracados"},
  {id:"desatracados",label:"Desatracados"}
];
var TELA_INICIAL = "atracados";   /* aba que abre por padrão, independente da ordem dos botões */

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

/* ---- Carga com vários produtos: "BOBINAS DE AÇO / BARRILHA (GRANEL SÓLIDO + BIG BAGS)" ----
   Cada produto é separado por " / " e as embalagens ficam entre parênteses, ligadas por " + ".
   Para mudar a lista ou as abreviações, edite só EMBS: [nome completo, abreviação]. */
var EMBS = [["Granel sólido","GS"],["Granel líquido","GL"],["Sacos","SC"],["Big Bags","BB"],["Carga Geral","CG"]];
var EMB_CG = 4, EMB_GL = 1;   /* posição de Carga Geral e de Granel líquido na lista acima */
/* Produtos que são combustível: ao digitar, a embalagem Granel líquido já vem marcada. */
function ehCombustivel(p){ return /diesel|gasolina|combustiv|querosene|\bqav\b|bunker|nafta|\bmgo\b|\bvlsfo\b|\bifo\b/.test(embNorm(p).toLowerCase()); }
function embNorm(s){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim(); }
function embStem(s){ return embNorm(s).replace(/(ES|S)$/, ""); }
function embIdx(t){   /* "BIG BAGS" -> 0; "gr" -> 4; desconhecido -> -1 */
  var n = embNorm(t), st = embStem(t);
  for(var i = 0; i < EMBS.length; i++){ if(n === EMBS[i][1] || st === embStem(EMBS[i][0])) return i; }
  if(n === "GR" || n === "GRANEL") return 0;   /* nome antigo (Granel / GR) = Granel sólido: registros já salvos continuam lendo certo */
  return -1;
}
function qtdLimpa(v, dec){ v = String(v == null ? "" : v).replace(/\./g, "").replace(dec ? /[^\d,]/g : /\D/g, ""); if(dec){ var i = v.indexOf(","); if(i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/,/g, ""); } return v; }
function qtdFmt(v){ v = qtdLimpa(v, true); if(!v) return ""; var p = v.split(","); p[0] = (p[0].replace(/^0+(?=\d)/, "") || "0").replace(/\B(?=(\d{3})+(?!\d))/g, "."); return p.join(","); }
function qtdNum(v){ var n = parseFloat(qtdLimpa(v, true).replace(",", ".")); return isNaN(n) ? 0 : n; }
function cargaParse(txt){   /* texto -> [{p:produto, e:[índices das embalagens], u:unidades (só contêiner/bobina), pu:peso unitário em t, t:toneladas}]; o que não for reconhecido fica como produto, sem perder nada */
  return String(txt == null ? "" : txt).split(/\s+\/\s+/).map(function(part){
    part = part.trim(); if(!part) return null;
    var u = "", pu = "", t = "", whole = part, mq = /^(.*?)\s*\[([^\[\]]*)\]$/.exec(part);
    if(mq){
      var ok = mq[2].split(/\s*·\s*/).every(function(x){ var m = /^([\d.,]+)\s*(T\/UN|UN|T)$/i.exec(x.trim()); if(!m) return false; var kk = m[2].toUpperCase(); if(kk === "UN") u = qtdFmt(m[1]); else if(kk === "T/UN") pu = qtdFmt(m[1]); else t = qtdFmt(m[1]); return true; });
      if(ok && mq[1]) part = mq[1]; else { u = ""; pu = ""; t = ""; }
    }
    var m = /^(.*?)\s*\(([^()]*)\)$/.exec(part);
    if(m){
      var idx = m[2].split(/\s*\+\s*/).map(embIdx);
      if(m[1] && idx.length && idx.every(function(i){ return i >= 0; })) return {p:m[1].trim(), e:idx.filter(function(i, j){ return idx.indexOf(i) === j; }).sort(function(a, b){ return a - b; }), u:u, pu:pu, t:t};
    }
    return {p:part, e:[], u:u, pu:pu, t:t};
  }).filter(Boolean);
}
function cargaCompose(rows){
  return rows.filter(function(r){ return r.p.trim(); }).map(function(r){
    var q = []; if(qtdFmt(r.u)) q.push(qtdFmt(r.u) + " UN"); if(qtdFmt(r.u) && qtdFmt(r.pu)) q.push(qtdFmt(r.pu) + " T/UN"); if(qtdFmt(r.t)) q.push(qtdFmt(r.t) + " T");
    return r.p.trim().toUpperCase() + (r.e.length ? " (" + r.e.map(function(i){ return EMBS[i][0].toUpperCase(); }).join(" + ") + ")" : "") + (q.length ? " [" + q.join(" · ") + "]" : "");
  }).join(" / ");
}
/* Como a carga aparece para o público: PRODUTO-EMBALAGEM (ex.: BARRILHA-GS, BARRILHA-BB, DIVERSOS-CG).
   Produto com duas embalagens vira dois rótulos, ligados por " + ". Quantidades vão entre parênteses. */
function cargaRotulos(r){
  var P = String(r.p).trim().toUpperCase();
  return r.e.length ? r.e.map(function(i){ return P + "-" + EMBS[i][1]; }) : [P];
}
/* Sempre em toneladas. Unidades (só contêiner/bobina) aparecem como complemento: "500 t · 100 un". */
function cargaQtd(r){ var q = []; if(r.t) q.push(r.t + " t"); if(r.u) q.push(r.u + " un"); return q.join(" · "); }
function cargaAbrev(txt){   /* texto simples (tabela, impressão, busca): BARRILHA-GS + BARRILHA-BB (500 t) / DIVERSOS-CG */
  return cargaParse(txt).map(function(r){ var q = cargaQtd(r); return cargaRotulos(r).join(" + ") + (q ? " (" + q + ")" : ""); }).join(" / ");
}
function cargaHtml(txt){   /* cartão: um produto por linha */
  return cargaParse(txt).map(function(r){ var q = cargaQtd(r); return '<div class="cargo-l">' + esc(cargaRotulos(r).join(" + ")) + (q ? ' <span class="meta">(' + esc(q) + ')</span>' : '') + '</div>'; }).join("");
}
function legendaEmb(itens){   /* "BB = Big Bags · CG = Carga Geral": só as siglas que aparecem na lista mostrada */
  var usa = {};
  (itens || []).forEach(function(s){ if(s.tipo) return; cargaParse(s.carga).forEach(function(r){ r.e.forEach(function(i){ usa[i] = 1; }); }); });
  return EMBS.filter(function(m, i){ return usa[i]; }).map(function(m){ return '<b>' + m[1] + '</b> = ' + m[0]; });
}
function legendaHtml(itens){
  var l = legendaEmb(itens); if(!l.length) return "";
  return '<p class="leg-emb"><span>Legenda das embalagens:</span> ' + l.join(' · ') + '</p>';
}

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
   Tonelagem Prevista, Tonelagem Movimentada, Saldo, Tonelagem final. (Saldo é recalculado pela página.)
   DATA "Atualizado em" (topo da página): vem de uma linha da aba BANCO com Situação = ATUALIZADO e, ao lado, a data e hora
   (ex.: ATUALIZADO | 18/10/2026 14:30). Só muda quando o responsável alterar essa célula; sem essa linha a página mostra "—". */
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
  var by = {previstos:[], fundeados:[], atracados:[], desatracados:[]}, aviso = "", avisos = {geral:[], previstos:[], fundeados:[], atracados:[]}, resp = null, atualizado = "";
  rows.forEach(function(r, idx){
    if(idx <= L.hdr) return;
    var a = String(r[L.situacao]||"").trim();
    if(/^atualiza/.test(normH(a))){   /* linha "ATUALIZADO | 18/10/2026 14:30": a data só muda quando o responsável a altera na planilha */
      for(var k = L.situacao+1; k < r.length; k++){ var dv = dataBR(r[k]); if(dv){ atualizado = dv; break; } }
      return;
    }
    if(/^respons/.test(normH(a))){   /* linha "RESPONSÁVEL | nome | e-mail" */
      var rn = String(r[L.situacao+1]||"").trim();
      if(rn){
        resp = {nome:rn, cargo:"", email:""};
        [r[L.situacao+2], r[L.situacao+3]].forEach(function(v){ v = String(v||"").trim(); if(!v) return; if(v.indexOf("@")>=0) resp.email = v; else resp.cargo = v; });
      }
      return;
    }
    /* Avisos: coluna Situação = AVISO (geral, acima das abas) ou AVISO ATRACADOS / AVISO PREVISTOS / AVISO FUNDEADOS (só naquela aba); o texto vai na coluna ao lado. */
    var av = /^(nota|aviso)s?\s*[-:·]?\s*(previst|fundead|atracad)?/.exec(normH(a));
    if(av){
      var t = String(r[L.situacao+1]||"").trim();
      if(t){ var alvo = av[2] ? {previst:"previstos", fundead:"fundeados", atracad:"atracados"}[av[2]] : "geral"; avisos[alvo].push(t); if(alvo==="geral") aviso = t; }
      return;
    }
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
  return {by:by, aviso:aviso, avisos:avisos, resp:resp, atualizado:atualizado};
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
    AVISOS = r.avisos; RESP = r.resp;
    var d = new Date();
    TABS.forEach(function(t){
      var items = r.by[t.id]; if(t.id==="desatracados") items = items.filter(recente);   /* só os últimos dias; o histórico fica na planilha */
      data[t.id] = {items:items, aviso:r.aviso, atualizado:r.atualizado}; errors[t.id] = false;
    });
    lastOk = p2(d.getHours())+":"+p2(d.getMinutes()); lastErr = "";
  }).catch(function(e){ lastErr = String((e && e.message) || ""); TABS.forEach(function(t){ errors[t.id] = true; }); }).then(renderAll);
}
function nomeAba(id){ return (CONFIG.banco && !CONFIG.api) ? CONFIG.banco.sheet : ((CONFIG.tabs[id] || {}).sheet || "BANCO"); }

/* === INTERFACE === */
var MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
var HEADS = {
  rascunhos:["Berço","Embarcação","Carga","Agência / Operador","Datas","Tonelagem prevista"],
  atracados:["Berço","Embarcação","Carga","Agência / Operador","Datas","Carga movimentada"],
  previstos:["Berço","Embarcação","Carga","Agência / Operador","Datas","Tonelagem prevista"],
  fundeados:["Berço","Embarcação","Carga","Agência / Operador","Datas","Carga prevista"],
  desatracados:["Berço","Embarcação","Carga","Agência / Operador","Datas","Carga movimentada"]
};
var EMPTY = {
  rascunhos:"Nenhum rascunho. Use \"+ Nova embarcação\" para começar uma previsão; ela só vai para o público quando você publicar no MEP.",
  atracados:"Nenhuma embarcação atracada no momento.",
  previstos:"Nenhuma embarcação prevista no momento.",
  fundeados:"Nenhuma embarcação fundeada no momento.",
  desatracados:"Nenhuma embarcação desatracada nesta lista."
};
var state = {tab:"atracados", q:"", f:{}, fopen:false};
var data = {};      /* id -> {items, aviso, atualizado} da última leitura boa */
var errors = {};    /* id -> true quando a última leitura falhou */
var lastOk = null, lastErr = "";
var RESP = null;     /* coordenador responsável lido da planilha; se não houver, vale CONFIG.responsavel */
var AVISOS = null;   /* avisos lidos da planilha: {geral:[], previstos:[], fundeados:[], atracados:[]} */

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
  var n = h<24 ? Math.max(1,Math.round(h)) : Math.round(h/24), un = h<24 ? "hora" : "dia";
  return verb+" em "+n+" "+un+(n===1 ? "" : "s");   /* 1 dia / 2 dias, 1 hora / 2 horas */
}
function num(n){return Number(n||0).toLocaleString("pt-BR")}
function modPill(m){
  if(!m) return "";
  return '<span class="pill'+(m==="EXPORTAÇÃO"?" exp":"")+'">'+esc(cap(m))+'</span>';
}
function listOf(id){ return (data[id] && data[id].items) || []; }

function dt(v){ return '<span class="dt">'+esc(fmt(v))+'</span>'; }   /* data inteira numa linha só: quem quebra é o rótulo, não a data */
function rowBase(s,lista){
  var prevList = lista==="rascunhos" || lista==="previstos" || lista==="fundeados", special = !!s.tipo;
  var pct = s.prev>0 ? Math.min(100,Math.round((s.mov||0)/s.prev*100)) : 0;
  var meta = [];   /* dados do navio, um embaixo do outro: nunca quebram no meio */
  function sp(r, v, mono){ return '<div><span>'+r+'</span> <b'+(mono?' class="mono"':'')+'>'+esc(v)+'</b></div>'; }
  if(s.cbo) meta.push(sp("CBO", s.cbo, 1));
  if(s.imo) meta.push(sp("IMO", s.imo, 1));
  if(s.comp) meta.push(sp("Compr.", s.comp));
  if(s.calado) meta.push(sp("Calado", s.calado));
  if(ehCB(s.cais) && typeof cbHost === "function"){ var hcb = cbHost(s); if(hcb) meta.push(sp("C/B de", hcb)); }
  var nv = navegacaoItem(s);
  if(nv) meta.push('<div><span>Navegação</span> <b title="'+nv.nome+'">'+nv.nome+'</b></div>');
  var cargo = special
    ? '<div class="cargo">'+esc(s.tipo)+'</div><span class="pill neutral">Sem carga</span>'
    : '<div class="cargo" title="'+esc(cap(s.carga)||"")+'">'+(cargaHtml(s.carga)||"Não informada")+'</div>'+modPill(s.mod)+(s.origem?'<div class="meta">'+(s.mod==="IMPORTAÇÃO"?"Origem":s.mod==="EXPORTAÇÃO"?"Destino":"Origem/destino")+': '+esc(s.origem)+'</div>':'');
  var when, prog;
  if(prevList){
    var chega = rel(s.chegada,"chega");
    when = '<div>'+(lista==="fundeados"?'Chegada confirmada ':'Previsão de chegada (ETA) ')+dt(s.chegada)+'</div>'+(chega?'<div class="rel">'+esc(chega)+'</div>':'')+(s.atracacao?'<div>Previsão de atracação (POB) '+dt(s.atracacao)+'</div>':'')+(s.saida?'<div>Previsão de saída (ETD) '+dt(s.saida)+'</div>':'');
    prog = '<div><b>'+num(s.prev)+'</b> t</div>'+(s.anterior?'<div class="meta">Vem de '+esc(s.anterior)+'</div>':'');
  } else {
    when = '<div>Atracação '+dt(s.chegada)+'</div>'+
      (s.saida?'<div>Previsão de saída (ETD) '+dt(s.saida)+'</div>'+(lista==="atracados"?'<div class="rel">'+esc(rel(s.saida,"sai"))+'</div>':''):'<div class="meta">Previsão de saída não informada</div>');
    if(special || !s.prev){ prog = '<span class="meta">Sem movimentação de carga</span>'; }
    else if(lista==="fundeados"){ prog = '<div><b>'+num(s.prev)+'</b> t previstas</div>'; }
    else { prog = '<div class="bar"><i style="width:'+pct+'%"></i></div><div><b>'+num(s.mov)+'</b> de '+num(s.prev)+' t · '+pct+'%</div><div class="meta">Saldo '+num(s.prev-(s.mov||0))+' t</div>'; }
  }
  if(lista==="desatracados"){
    when = (s.chegada?'<div>Atracação '+dt(s.chegada)+'</div>':'')+(s.saida?'<div>Saída '+dt(s.saida)+'</div>':'<div class="meta">Saída não informada</div>');
    if(!special && (s.mov||s.prev)) prog = '<div><b>'+num(s.mov||s.prev)+'</b> t movimentadas</div>';
  }
  return '<div class="row">'+
    '<div class="c-berth berth-n'+(s.cais.length>3?' sm':'')+'"><small>BERÇO</small>'+(s.cais?esc(s.cais):"—")+'</div>'+
    '<div class="c-ship"><div class="ship">'+bandeiraHtml(s.nacionalidade)+esc(s.navio)+'</div><div class="specs">'+meta.join("")+'</div></div>'+
    '<div class="c-rest">'+
      '<div class="c-cargo"><span class="lab">Carga</span>'+cargo+'</div>'+
      '<div class="c-who who"><span class="lab">Agência / Operador</span><b>'+esc(s.agencia||"Não informada")+'</b><span class="meta">'+(s.operador?esc(s.operador):"Sem operador")+'</span></div>'+
      '<div class="c-when when"><span class="lab">Datas</span>'+when+'</div>'+
      '<div class="c-prog prog"><span class="lab">'+esc(HEADS[lista][5])+'</span>'+prog+'</div>'+
    '</div></div>';
}
/* matches() e fsort() ficam em js/filtros.js */
function tabVisivel(t){ return t.id !== "rascunhos" || (typeof verRascunhos === "function" && verRascunhos()); }
function renderTabs(){
  var vis = TABS.filter(tabVisivel); $("tabs").className = "tabs" + (vis.length > 4 ? " t5" : "");
  $("tabs").innerHTML = vis.map(function(t){
    var sel = t.id===state.tab;
    var n = data[t.id] ? data[t.id].items.length : "—";
    return '<button class="tab" role="tab" type="button" data-t="'+t.id+'" aria-selected="'+sel+'"><span class="n">'+n+'</span><span class="l">'+t.label+'</span></button>';
  }).join("");
}
var BERCOS = ["00-TA","1","2","3","4","5","6","7","8","9"];
function ehCB(c){ return /\/\s*CB\s*$/i.test(String(c == null ? "" : c)); }                 /* "7 / CB": a contra bordo de outro navio, no berço 7 */
function caisBase(c){ return String(c == null ? "" : c).replace(/\s*\/\s*CB\s*$/i, "").trim(); }
function caisKeys(c){   /* "2" -> ["2"]; "0 E 1" -> ["00-TA","1"]; "7 / CB" -> ["7"]; "MARINA" -> [] */
  var out = [];
  (String(c == null ? "" : c).toUpperCase().match(/00-TA|TA|\d+/g) || []).forEach(function(t){
    var k = (t === "00-TA" || t === "TA" || /^0+$/.test(t)) ? "00-TA" : String(parseInt(t, 10));
    if(BERCOS.indexOf(k) >= 0 && out.indexOf(k) < 0) out.push(k);
  });
  return out;
}
function renderBerths(){ if(typeof renderMapa === "function") renderMapa(); }   /* a antiga grade "Ocupação dos berços" saiu; o mapa é a ocupação */
function renderPanel(){
  var id = state.tab, el = $("panel");
  el.classList.remove("wide");   /* só a tabela completa usa a largura quase total da tela */
  var ms = document.getElementById("mapa-sec"); if(ms) ms.hidden = id !== "atracados";
   /* mapa só faz sentido para quem está atracado */
  if(typeof syncView === "function") syncView();
  if(!data[id]){
    state.n = null; renderFsum();
    el.innerHTML = errors[id]
      ? '<div class="empty">Não foi possível ler a aba '+esc(nomeAba(id))+'. Veja a mensagem no topo da página.</div>'
      : '<div class="loading" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span class="loading-t">Carregando dados</span></div>';
    return;
  }
  var all = data[id].items, items = fsort(all.filter(matches));
  state.n = [items.length, all.length]; renderFsum();
  if(!items.length){
    el.innerHTML = '<div class="empty">'+(all.length ? 'Nenhuma embarcação encontrada com esses filtros.<br><button class="fclear" type="button" data-clearall>Limpar filtros</button>' : EMPTY[id])+'</div>';
    return;
  }
  if(viewOf(id)==="tabela"){ el.innerHTML = tabelaHtml(id, items) + legendaHtml(items); el.classList.add("wide"); return; }
  el.innerHTML = '<div class="row head">'+HEADS[id].map(function(h){return '<div>'+h+'</div>'}).join("")+'</div>' +
    items.map(function(s){return row(s,id)}).join("") + legendaHtml(items);
}
function avisoHtml(rot, txt){
  if(txt === txt.toUpperCase()){ txt = txt.toLowerCase(); txt = txt.charAt(0).toUpperCase()+txt.slice(1); }
  return '<div class="aviso"><strong>'+esc(rot)+'</strong><span>'+esc(txt)+'</span></div>';
}
function renderAvisos(){
  var ger = AVISOS ? AVISOS.geral : (data.atracados && data.atracados.aviso ? [data.atracados.aviso] : []);
  var g = $("notice"); g.hidden = !ger.length;
  g.innerHTML = ger.map(function(t){ return avisoHtml("Comunicado Geral", t); }).join("");
  var lista = AVISOS && AVISOS[state.tab] ? AVISOS[state.tab] : [];
  var nome = TABS.filter(function(t){ return t.id===state.tab; })[0];
  var ta = $("tabnotice"); ta.hidden = !lista.length;
  ta.innerHTML = lista.map(function(t){ return avisoHtml("Aviso · "+(nome?nome.label:""), t); }).join("");
}
var ICO_MAIL = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>';
var ICO_TEL = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>';
function telHref(t){ var d = String(t||"").replace(/\D/g,""); return "tel:"+(d.length>=10 && d.slice(0,2)!=="55" ? "+55" : "+")+d; }
function renderHead(){
  var base = data.atracados || data.previstos || null;
  $("stamp").textContent = (base && base.atualizado) || "—";
  renderAvisos();
  var rp = RESP || CONFIG.responsavel, rb = $("resp"); rb.hidden = !(rp && rp.nome);
  if(!rb.hidden){
    $("resp-n").textContent = rp.nome;
    $("resp-c").textContent = rp.cargo ? " · "+rp.cargo : "";
    var ct = [];
    if(rp.email) ct.push('<a class="ct" href="mailto:'+esc(rp.email)+'">'+ICO_MAIL+esc(rp.email)+'</a>');
    if(rp.telefone) ct.push('<a class="ct" href="'+telHref(rp.telefone)+'">'+ICO_TEL+esc(rp.telefone)+'</a>');
    $("resp-ct").innerHTML = ct.join(""); $("resp-ct").hidden = !ct.length;
  }
  var bad = TABS.filter(function(t){return errors[t.id] && tabVisivel(t)}).map(function(t){return nomeAba(t.id)}).filter(function(n,i,a){return a.indexOf(n)===i});
  var w = $("warn");
  if(bad.length){
    w.hidden = false;
    $("warn-t").textContent = "Não foi possível ler "+(bad.length>1?"as abas ":"a aba ")+bad.join(", ")+". Confira se a planilha está compartilhada como \"Qualquer pessoa com o link\" (leitor) e se o nome da aba está igual ao da planilha."+(lastErr==="cabecalho"?" A primeira linha da aba precisa ter as colunas Situação e Navio.":"")+(lastOk?" Os dados abaixo são da última leitura, às "+lastOk+".":"");
  } else w.hidden = true;
}
function renderAll(){ renderHead(); renderTabs(); renderBerths(); renderFilters(); renderPanel(); }

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
  state.tab = b.getAttribute("data-t"); renderTabs(); renderAvisos(); renderFilters(); renderPanel();
});
$("q").addEventListener("input",function(e){ state.q = e.target.value.trim().toLowerCase(); renderPanel(); });
document.addEventListener("visibilitychange",function(){ if(!document.hidden) refresh(); });

$("f-end").textContent = CONFIG.endereco || "";
$("f-tel").innerHTML = '<a href="'+telHref(CONFIG.telefones)+'">'+esc(CONFIG.telefones)+'</a>';
$("f-setor").textContent = CONFIG.setor || "";
if(CONFIG.emails){ $("f-mail").innerHTML = '<a href="mailto:'+esc(CONFIG.emails)+'">'+esc(CONFIG.emails)+'</a>'; $("f-mail-box").hidden = false; }
state.tab = TELA_INICIAL;
var h0 = (location.hash||"").replace("#","");
if(h0 !== "rascunhos" && TABS.some(function(t){return t.id===h0})) state.tab = h0;
renderAll();
refresh();
setInterval(refresh, Math.max(15, CONFIG.refreshSeconds)*1000);

/* Girar o aparelho ou redimensionar a janela cruzando os 700px troca o layout (cartões do celular x tabela do computador) */
if(window.matchMedia){ var _mq = window.matchMedia("(max-width:700px)"); (_mq.addEventListener ? _mq.addEventListener("change", function(){ renderAll(); }) : _mq.addListener(function(){ renderAll(); })); }
