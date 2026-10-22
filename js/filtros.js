/* Filtros: busca, painel de filtros recolhível, resumo dos filtros ativos e seletor Cartões/Tabela.
   Cada aba (Atracados, Previstos...) guarda os seus próprios filtros. Carrega ANTES do app.js.
   Para criar um novo filtro de lista (ex.: "Calado"), basta incluir uma linha em FMS abaixo. */

/* Filtros de múltipla escolha: k = campo da embarcação, label = nome na tela. */
var FMS = [
  {k:"cais",     label:"Berço"},
  {k:"agencia",  label:"Agência de navegação"},
  {k:"operador", label:"Operador portuário"},
  {k:"carga",    label:"Carga"},
  {k:"origem",   label:"Procedência / destino"},
  {k:"anterior", label:"Porto anterior"},
  {k:"proximo",  label:"Próximo porto"}
];
var FMODS  = [["","Todos"],["IMPORTAÇÃO","Importação"],["EXPORTAÇÃO","Exportação"],["_SEM","Sem carga"]];
var FDATE  = {rascunhos:"chegada", atracados:"chegada", previstos:"chegada", fundeados:"chegada", desatracados:"saida"};
var FDLAB  = {rascunhos:"Previsão de chegada (ETA)", atracados:"Atracação", previstos:"Previsão de chegada (ETA)", fundeados:"Chegada confirmada", desatracados:"Saída"};
/* atalhos de período: [rótulo, dias a partir de hoje (início), dias a partir de hoje (fim)] — "mes" = mês atual */
var FPRE = {
  desatracados:[["Últimos 7 dias",-7,0],["Últimos 30 dias",-30,0],["Últimos 90 dias",-90,0],["Este mês","mes"]],
  atracados:   [["Hoje",0,0],["Últimos 7 dias",-7,0],["Últimos 30 dias",-30,0]],
  previstos:   [["Hoje",0,0],["Próx. 48 horas",0,2],["Próx. 7 dias",0,7],["Próx. 30 dias",0,30]],
  fundeados:   [["Hoje",0,0],["Últimos 7 dias",-7,0]],
  rascunhos:   [["Hoje",0,0],["Próx. 48 horas",0,2],["Próx. 7 dias",0,7],["Próx. 30 dias",0,30]]
};
var FSORT = [["","Padrão"],["data-desc","Data: mais recente"],["data-asc","Data: mais antiga"],["navio","Embarcação (A–Z)"],["cais","Berço"],["ton","Maior tonelagem"]];

function fnew(){ var f = {mod:"", from:"", to:"", cmin:"", cmax:"", sort:""}; FMS.forEach(function(m){ f[m.k] = []; }); return f; }
function fget(id){ id = id || state.tab; state.f = state.f || {}; return state.f[id] || (state.f[id] = fnew()); }
function fkey(v){ return String(v).trim().toUpperCase(); }
function iso(d){ return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate()); }
function pdate(v, fim){ var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v); return m ? new Date(+m[1], +m[2]-1, +m[3], fim?23:0, fim?59:0, fim?59:0) : null; }
function brd(v){ var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v||""); return m ? m[3]+"/"+m[2]+"/"+m[1] : ""; }
function fpre(p){   /* [de, ate] em AAAA-MM-DD */
  var h = new Date();
  if(p[1] === "mes") return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(new Date(h.getFullYear(), h.getMonth()+1, 0))];
  return [iso(new Date(h.getFullYear(), h.getMonth(), h.getDate()+p[1])), iso(new Date(h.getFullYear(), h.getMonth(), h.getDate()+p[2]))];
}

/* valores de um campo numa embarcação (sempre uma lista; o cais "0 E 1" vale para os dois cais) */
function fvals(s, k){
  if(k === "cais"){ var ks = caisKeys(s.cais); return ks.length ? ks : (s.cais ? [s.cais] : []); }
  if(k === "carga"){
    if(s.tipo) return [cap(String(s.tipo))];
    var ps = cargaParse(s.carga).map(function(r){ return cap(r.p); });
    return ps.filter(function(p, i){ return ps.indexOf(p) === i; });
  }
  return s[k] ? [s[k]] : [];
}
function caisN(l){ return l === "00-TA" ? 0 : (parseInt(l, 10) || 99); }
function fopts(id, k){
  var m = {}, out = [];
  listOf(id).forEach(function(s){
    fvals(s, k).forEach(function(v){ var key = fkey(v); if(!m[key]){ m[key] = {key:key, label:v, n:0}; out.push(m[key]); } m[key].n++; });
  });
  out.sort(k === "cais" ? function(a, b){ return caisN(a.label) - caisN(b.label) || a.label.localeCompare(b.label); }
                        : function(a, b){ return a.label.localeCompare(b.label, "pt-BR"); });
  return out;
}

function matches(s){
  var id = state.tab, f = fget(id);
  if(f.mod){ if(f.mod === "_SEM"){ if(!s.tipo) return false; } else if(s.mod !== f.mod) return false; }
  for(var i = 0; i < FMS.length; i++){
    var k = FMS[i].k;
    if(f[k].length && !fvals(s, k).some(function(v){ return f[k].indexOf(fkey(v)) >= 0; })) return false;
  }
  if(f.from || f.to){
    var d = parseDate(s[FDATE[id]]); if(!d) return false;
    if(f.from && d < pdate(f.from)) return false;
    if(f.to && d > pdate(f.to, true)) return false;
  }
  if(f.cmin !== "" || f.cmax !== ""){
    var c = toNum(s.comp); if(!c) return false;
    if(f.cmin !== "" && c < toNum(f.cmin)) return false;
    if(f.cmax !== "" && c > toNum(f.cmax)) return false;
  }
  if(state.q){
    var hay = [s.navio, s.carga, s.agencia, s.operador, s.origem, s.tipo, s.cais, s.cbo, s.imo, s.anterior, s.proximo].join(" ").toLowerCase();
    if(hay.indexOf(state.q) < 0) return false;
  }
  return true;
}
function fsort(items){
  var f = fget(), t = f.sort; if(!t) return items;
  var campo = FDATE[state.tab];
  function dd(s){ var d = parseDate(s[campo]); return d ? +d : null; }
  var cmp = {
    "navio": function(a, b){ return a.navio.localeCompare(b.navio, "pt-BR"); },
    "cais":  function(a, b){ return caisN(String(a.cais).toUpperCase()) - caisN(String(b.cais).toUpperCase()) || a.navio.localeCompare(b.navio, "pt-BR"); },
    "ton":   function(a, b){ return (b.mov || b.prev || 0) - (a.mov || a.prev || 0); },
    "data-asc":  function(a, b){ var x = dd(a), y = dd(b); return x === null ? 1 : y === null ? -1 : x - y; },
    "data-desc": function(a, b){ var x = dd(a), y = dd(b); return x === null ? 1 : y === null ? -1 : y - x; }
  }[t];
  return cmp ? items.slice().sort(cmp) : items;
}

/* ---------- painel ---------- */
function renderFilters(force){
  var P = document.getElementById("fpanel"), id = state.tab;
  var busy = P.contains(document.activeElement) || P.querySelector(".ms-p:not([hidden])");
  if(!force && busy && P.getAttribute("data-tab") === id){ renderFsum(); return; }
  var f = fget(id), h = "";

  h += '<div class="ff w2"><span class="fl">Operação</span><div class="seg" role="group" aria-label="Operação">' +
    FMODS.map(function(m){ return '<button type="button" data-mod="'+esc(m[0])+'" aria-pressed="'+(f.mod===m[0])+'">'+m[1]+'</button>'; }).join("") + '</div></div>';

  h += '<div class="ff w2"><span class="fl">Período · '+FDLAB[id]+'</span>' +
    '<div class="dr"><input type="date" data-d="from" value="'+esc(f.from)+'" aria-label="De"><span>até</span><input type="date" data-d="to" value="'+esc(f.to)+'" aria-label="Até"></div>' +
    '<div class="pre">' + (FPRE[id]||[]).map(function(p){ var r = fpre(p); return '<button type="button" data-pre data-from="'+r[0]+'" data-to="'+r[1]+'" aria-pressed="'+(f.from===r[0]&&f.to===r[1])+'">'+p[0]+'</button>'; }).join("") + '</div></div>';

  FMS.forEach(function(m){
    var opts = fopts(id, m.k); if(!opts.length) return;
    h += '<div class="ff" data-ms="'+m.k+'"><span class="fl">'+m.label+'</span><div class="ms">' +
      '<button type="button" class="ms-b" aria-haspopup="true" aria-expanded="false"><span class="ms-t"></span>' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '<div class="ms-p" hidden>' + (opts.length > 7 ? '<input class="ms-s" type="search" placeholder="Buscar…" aria-label="Buscar em '+m.label+'">' : '') +
        '<div class="ms-l">' + opts.map(function(o){
          return '<label class="ms-o"><input type="checkbox" value="'+esc(o.key)+'"'+(f[m.k].indexOf(o.key)>=0?' checked':'')+'><span>'+(m.k==="cais"?"Berço ":"")+esc(o.label)+'</span><em>'+o.n+'</em></label>';
        }).join("") + '</div>' +
        '<div class="ms-f"><button type="button" data-clear>Limpar seleção</button></div></div></div></div>';
  });

  h += '<div class="ff"><span class="fl">Comprimento (em metros)</span><div class="dr"><input type="number" inputmode="numeric" min="0" placeholder="mín." data-c="cmin" value="'+esc(f.cmin)+'" aria-label="Comprimento mínimo"><span>a</span><input type="number" inputmode="numeric" min="0" placeholder="máx." data-c="cmax" value="'+esc(f.cmax)+'" aria-label="Comprimento máximo"></div></div>';

  h += '<div class="ff"><span class="fl">Ordenar por</span><select data-sort aria-label="Ordenar por">' +
    FSORT.map(function(o){ return '<option value="'+o[0]+'"'+(f.sort===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join("") + '</select></div>';

  h += '<div class="ff wall fprint"><button type="button" class="btn-print" data-print>' + ICO_PRINT + '<span class="bp-t">Imprimir relação filtrada <span id="fp-n"></span></span></button>' +
    '<small>Imprime apenas as embarcações que estão na tela agora, na aba <b>' + esc(rotuloAba(id)) + '</b>, com os filtros e a busca aplicados.</small></div>';

  if(P._h !== h || force){ P.innerHTML = h; P._h = h; }
  P.setAttribute("data-tab", id);
  P.hidden = !state.fopen;
  var bf = document.getElementById("btn-filtros"); bf.setAttribute("aria-expanded", String(!!state.fopen)); bf.classList.toggle("on", !!state.fopen);
  syncLabels(); renderFsum();
}
function syncLabels(){
  var f = fget();
  FMS.forEach(function(m){
    var box = document.querySelector('#fpanel [data-ms="'+m.k+'"]'); if(!box) return;
    var sel = f[m.k], t = box.querySelector(".ms-t"), b = box.querySelector(".ms-b");
    var lab = "Todos";
    if(sel.length === 1){ var o = fopts(state.tab, m.k).filter(function(x){ return x.key === sel[0]; })[0]; lab = (m.k==="cais"?"Berço ":"") + (o ? o.label : sel[0]); }
    else if(sel.length > 1) lab = sel.length + " selecionados";
    t.textContent = lab; b.classList.toggle("has", sel.length > 0);
  });
  Array.prototype.forEach.call(document.querySelectorAll("#fpanel [data-pre]"), function(b){
    b.setAttribute("aria-pressed", String(b.getAttribute("data-from") === f.from && b.getAttribute("data-to") === f.to));
  });
}
function fchips(){
  var id = state.tab, f = fget(id), out = [];
  if(f.mod) out.push(["mod", FMODS.filter(function(m){ return m[0] === f.mod; })[0][1]]);
  FMS.forEach(function(m){
    var opts = fopts(id, m.k);
    f[m.k].forEach(function(key){ var o = opts.filter(function(x){ return x.key === key; })[0]; out.push([m.k+"|"+key, m.label.split(" ")[0]+": "+(o ? o.label : key)]); });
  });
  if(f.from || f.to) out.push(["date", FDLAB[id]+": "+(f.from ? brd(f.from) : "…")+" – "+(f.to ? brd(f.to) : "…")]);
  if(f.cmin !== "" || f.cmax !== "") out.push(["comp", "Compr.: "+(f.cmin !== "" ? f.cmin : "…")+" – "+(f.cmax !== "" ? f.cmax : "…")+" m"]);
  return out;
}
function renderFsum(){
  var box = document.getElementById("fsum"), chips = fchips(), n = state.n;
  var badge = document.getElementById("f-badge");
  var nb = chips.filter(function(c, i){ return i === chips.findIndex(function(x){ return x[0].split("|")[0] === c[0].split("|")[0]; }); }).length;
  badge.hidden = !nb; badge.textContent = nb;
  var pn = document.getElementById("fp-n"); if(pn) pn.textContent = n ? "(" + n[0] + ")" : "";
  var h = "";
  if(n) h += '<span class="fcount"><b>'+n[0]+'</b>'+(n[0] !== n[1] ? ' de '+n[1] : '')+' embarcaç'+(n[0] === 1 && n[0] === n[1] ? 'ão' : 'ões')+'</span>';
  chips.forEach(function(c){ h += '<span class="fchip">'+esc(c[1])+'<button type="button" data-rm="'+esc(c[0])+'" aria-label="Remover filtro '+esc(c[1])+'">×</button></span>'; });
  if(chips.length || state.q) h += '<button class="fclear" type="button" data-clearall>Limpar tudo</button>';
  box.innerHTML = h;
}
function syncView(){
  Array.prototype.forEach.call(document.querySelectorAll("#viewsw [data-v]"), function(b){ b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === viewOf(state.tab))); });
}
function fApply(){ renderPanel(); syncLabels(); }
function closeMs(){
  Array.prototype.forEach.call(document.querySelectorAll("#fpanel .ms-p"), function(p){ p.hidden = true; });
  Array.prototype.forEach.call(document.querySelectorAll("#fpanel .ms-b"), function(b){ b.setAttribute("aria-expanded", "false"); });
}

/* ---------- impressão da relação filtrada ---------- */
var ICO_PRINT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z" fill="#fff"/></svg>';
function rotuloAba(id){ var t = TABS.filter(function(x){ return x.id === id; })[0]; return t ? t.label : id; }
function agoraBR(){ var d = new Date(); return p2(d.getDate())+"/"+p2(d.getMonth()+1)+"/"+d.getFullYear()+" "+p2(d.getHours())+":"+p2(d.getMinutes()); }
function tabelaImpressao(id, items){
  var cols = COLS_TAB[id];
  var h = '<table class="pt"><thead><tr><th class="pn">Nº</th>' + cols.map(function(c){ return '<th>' + esc(c[1]) + '</th>'; }).join("") + '</tr></thead><tbody>';
  items.forEach(function(s, i){
    h += '<tr><td class="pn">' + (i + 1) + '</td>' + cols.map(function(c){
      var v = c[0] === "saldo" ? (s.prev || 0) - (s.mov || 0) : s[c[0]];
      if(c[2] === "d") v = String(v || "").slice(0, 16);
      else if(c[2] === "n") v = (v || v === 0) ? num(v) : "";
      var k = [];
      if(c[0] === "navio") k.push("nv"); else if(c[2] === "n") k.push("r");
      if(/^(cbo|imo|comp|calado|cais)$/.test(c[0]) || c[2] === "d") k.push("nw");
      return '<td' + (k.length ? ' class="' + k.join(" ") + '"' : '') + '>' + (v === "" || v == null ? "—" : esc(v)) + '</td>';
    }).join("") + '</tr>';
  });
  return h + '</tbody></table>';
}
function imprimirRelacao(){
  var id = state.tab, all = listOf(id), items = fsort(all.filter(matches)), f = fget(id);
  if(!items.length){ var m = "Não há embarcações para imprimir com esses filtros."; if(typeof toast === "function") toast(m, true); else alert(m); return; }
  var chips = fchips().map(function(c){ return c[1]; });
  if(state.q) chips.push("Busca: “" + state.q + "”");
  var ord = FSORT.filter(function(o){ return o[0] && o[0] === f.sort; })[0];
  var filtros = chips.length ? chips.map(function(c){ return '<span class="pf">' + esc(c) + '</span>'; }).join("") : '<span class="pf-0">nenhum — lista completa</span>';
  var atual = (document.getElementById("stamp") || {}).textContent;
  var h = '<div class="ph"><div class="phl"><img src="assets/logo/logo.png" alt="Porto do Recife"><span>PORTO do RECIFE S.A.</span></div><div class="pht"><h1>Line-up de embarcações — ' + esc(rotuloAba(id)) + '</h1>' +
    '<p>MEP — Movimentação de embarcações no Porto do Recife</p></div>' +
    '<div class="phd">Impresso em <b>' + agoraBR() + '</b>' + (atual && atual !== "—" ? '<br>Dados atualizados em <b>' + esc(atual) + '</b>' : '') + '</div></div>' +
    '<div class="pm"><div><b>Relação impressa:</b> ' + items.length + (items.length !== all.length ? ' de ' + all.length : '') + ' embarcaç' + (items.length === 1 ? 'ão' : 'ões') + ' · aba ' + esc(rotuloAba(id)) + (ord ? ' · ordenação: ' + esc(ord[1]) : '') + '</div>' +
    '<div><b>Filtros aplicados:</b> ' + filtros + '</div>' +
    (id === "rascunhos" ? '<div class="pw">Documento interno: rascunhos ainda não publicados no MEP.</div>' : '') + '</div>' +
    tabelaImpressao(id, items) +
    '<div class="pfoot">' + esc(CONFIG.endereco || "") + ' · Telefone: ' + esc(CONFIG.telefones || "") + ' · ' + esc(CONFIG.setor || "") + '</div>';
  var pa = document.getElementById("print-area"); pa.innerHTML = h;
  var st = document.createElement("style"); st.id = "print-page"; st.textContent = "@page{size:A4 landscape;margin:9mm 8mm}"; document.head.appendChild(st);
  document.body.classList.add("printing");
  function fim(){ window.removeEventListener("afterprint", fim); document.body.classList.remove("printing"); pa.innerHTML = ""; if(st.parentNode) st.parentNode.removeChild(st); }
  window.addEventListener("afterprint", fim);
  setTimeout(function(){ window.print(); }, 60);
}

/* ---------- eventos ---------- */
(function(){
  var P = document.getElementById("fpanel");

  document.getElementById("btn-filtros").addEventListener("click", function(){
    state.fopen = !state.fopen; closeMs(); renderFilters(true);
    if(state.fopen) P.scrollIntoView({block:"nearest", behavior:"smooth"});
  });
  document.getElementById("viewsw").addEventListener("click", function(e){
    var b = e.target.closest("[data-v]"); if(!b) return;
    state.views = state.views || {}; state.views[state.tab] = b.getAttribute("data-v"); renderPanel();
  });

  P.addEventListener("click", function(e){
    var t = e.target, f = fget(), x;
    if((x = t.closest("[data-mod]"))){
      f.mod = x.getAttribute("data-mod");
      Array.prototype.forEach.call(x.parentNode.children, function(b){ b.setAttribute("aria-pressed", String(b === x)); });
      fApply(); return;
    }
    if((x = t.closest("[data-pre]"))){
      var on = x.getAttribute("aria-pressed") === "true";
      f.from = on ? "" : x.getAttribute("data-from"); f.to = on ? "" : x.getAttribute("data-to");
      P.querySelector('[data-d="from"]').value = f.from; P.querySelector('[data-d="to"]').value = f.to;
      fApply(); return;
    }
    if((x = t.closest(".ms-b"))){
      var pop = x.parentNode.querySelector(".ms-p"), abrir = pop.hidden;
      closeMs();
      if(abrir){ pop.hidden = false; x.setAttribute("aria-expanded", "true"); var si = pop.querySelector(".ms-s"); if(si) si.focus(); }
      return;
    }
    if(t.closest("[data-print]")){ imprimirRelacao(); return; }
    if((x = t.closest("[data-clear]"))){
      var box = x.closest("[data-ms]"); f[box.getAttribute("data-ms")] = [];
      Array.prototype.forEach.call(box.querySelectorAll("input[type=checkbox]"), function(c){ c.checked = false; });
      fApply();
    }
  });
  P.addEventListener("change", function(e){
    var t = e.target, f = fget();
    if(t.matches(".ms-o input")){
      var k = t.closest("[data-ms]").getAttribute("data-ms"), i = f[k].indexOf(t.value);
      if(t.checked && i < 0) f[k].push(t.value);
      if(!t.checked && i >= 0) f[k].splice(i, 1);
      fApply();
    } else if(t.matches("[data-d]")){ f[t.getAttribute("data-d")] = t.value; fApply(); }
    else if(t.matches("[data-sort]")){ f.sort = t.value; fApply(); }
  });
  P.addEventListener("input", function(e){
    var t = e.target, f = fget();
    if(t.matches("[data-c]")){ f[t.getAttribute("data-c")] = t.value; fApply(); }
    else if(t.matches(".ms-s")){
      var q = t.value.trim().toLowerCase();
      Array.prototype.forEach.call(t.parentNode.querySelectorAll(".ms-o"), function(o){ o.hidden = q && o.textContent.toLowerCase().indexOf(q) < 0; });
    }
  });

  document.addEventListener("click", function(e){
    if(!e.target.closest(".ms")) closeMs();
    var rm = e.target.closest("[data-rm]");
    if(rm){
      var f = fget(), v = rm.getAttribute("data-rm"), p = v.split("|");
      if(v === "mod") f.mod = "";
      else if(v === "date"){ f.from = ""; f.to = ""; }
      else if(v === "comp"){ f.cmin = ""; f.cmax = ""; }
      else { var i = f[p[0]].indexOf(p.slice(1).join("|")); if(i >= 0) f[p[0]].splice(i, 1); }
      renderFilters(true); renderPanel(); return;
    }
    if(e.target.closest("[data-clearall]")){
      var id = state.tab, keep = fget(id).sort; state.f[id] = fnew(); state.f[id].sort = keep;
      state.q = ""; document.getElementById("q").value = "";
      renderFilters(true); renderPanel();
    }
  });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") closeMs(); });
})();
