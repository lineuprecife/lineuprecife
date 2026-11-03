/* Ficha "Manobras de Acostagem" para imprimir (meia folha A4), já preenchida com os dados da embarcação.
   O que ainda não foi registrado fica em branco para o coordenador preencher à mão.
   Carrega depois do edit.js e do filtros.js (usa dlg, sitKey, esc, parseDate, cargaAbrev, num, p2, agoraBR). */

function fchM(x){   /* metros: 189.98 -> "189,98"; 169 -> "169"; vazio -> "" */
  var n = Number(String(x == null ? "" : x).replace(",", "."));
  return n > 0 ? String(+n.toFixed(2)).replace(".", ",") : "";
}
function fchPes(x){ var n = Number(String(x == null ? "" : x).replace(",", ".")); return n > 0 ? Math.round(n * 3.28084) + "'" : ""; }
function fchData(v){ var d = parseDate(v); return d ? p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear() : ""; }

/* Croqui: embarcação em cima, cais embaixo, um círculo por cabeço de amarração (com o número, se já foi registrado) */
function fchCroqui(cabecos){
  var nums = String(cabecos || "").split(/[^\d]+/).filter(function(x){ return x; }).slice(0, 8);
  var n = Math.max(4, nums.length), xs = [], i;
  for(i = 0; i < n; i++) xs.push(24 + i * (252 / (n - 1)));
  var g = '<rect x="58" y="12" width="184" height="38" rx="4" fill="none" stroke="#1B3A6B" stroke-width="1.2"/>' +
          '<text x="150" y="35" text-anchor="middle" font-size="11" font-weight="700" fill="#1B3A6B" letter-spacing="1">EMBARCAÇÃO</text>' +
          '<line x1="6" y1="84" x2="294" y2="84" stroke="#1B3A6B" stroke-width="2"/>' +
          '<text x="150" y="108" text-anchor="middle" font-size="10" font-weight="700" fill="#1B3A6B" letter-spacing="2">CAIS</text>';
  for(i = 0; i < n; i++){
    var ax = i < n / 2 ? 70 + i * 24 : 230 - (n - 1 - i) * 24;   /* as pontas ficam nas extremidades do casco, as do meio mais perto do centro */
    g += '<line x1="' + ax.toFixed(1) + '" y1="50" x2="' + xs[i].toFixed(1) + '" y2="81" stroke="#1B3A6B" stroke-width="1"/>' +
         '<circle cx="' + xs[i].toFixed(1) + '" cy="84" r="3.6" fill="#fff" stroke="#1B3A6B" stroke-width="1.4"/>' +
         (nums[i] ? '<text x="' + xs[i].toFixed(1) + '" y="97" text-anchor="middle" font-size="9.5" font-weight="700" fill="#0b2a5b">' + esc(nums[i]) + '</text>' : '');
  }
  return '<svg viewBox="0 0 300 114" xmlns="http://www.w3.org/2000/svg" aria-label="Croqui da amarração">' + g + '</svg>';
}

function fchHtml(r, tipo, sit){
  var des = tipo === "desatracacao", p = des ? "d_" : "";
  var data = des ? fchData(r.saida) : fchData((sit === "atracados" || sit === "desatracados") ? (r.chegada || r.previsao_atracacao) : (r.previsao_atracacao || r.chegada));
  var carga = r.carga ? cargaAbrev(r.carga) : (r.operacao || "");
  if(r.ton_prevista) carga += (carga ? " · " : "") + num(r.ton_prevista) + " t";
  var cal = {proa: r[p + "calado_proa"], popa: r[p + "calado_popa"], max: r.calado};
  function f(rot, val, un, cls){ return '<div class="fch-f ' + (cls || "") + '"><span class="fch-l">' + rot + '</span><span class="fch-v">' + esc(val || "") + '</span>' + (un ? '<span class="fch-u">' + un + '</span>' : '') + '</div>'; }
  function cl(rot, v){ return '<div class="fch-c"><span class="fch-l">' + rot + '</span><span class="fch-v">' + esc(fchM(v)) + '</span><span class="fch-u">m</span><span class="fch-v fch-vs">' + esc(fchPes(v)) + '</span><span class="fch-u">pés</span></div>'; }
  var logo = '<div class="fch-logo"><img src="assets/logo/logo.png" alt=""><span>PORTO do RECIFE S.A.</span></div>';
  return '<section class="fch">' +
    '<div class="fch-h">' + logo + '<h1>MANOBRAS DE ACOSTAGEM</h1></div>' +
    '<div class="fch-r">' + f("Navio", r.navio, "", "fch-g") + f("Comp.", fchM(r.comprimento), "m", "fch-w2") + '</div>' +
    '<div class="fch-r">' + f("Berço", r.cais, "", "fch-w2") + f("Data", data, "", "fch-w2") + f("Carga / Ton.", carga, "", "fch-g") + '</div>' +
    '<div class="fch-r">' + f("Agência responsável", r.agencia, "", "fch-g") + '</div>' +
    '<div class="fch-r">' + f("Manobra", des ? "DESATRACAÇÃO" : "ATRACAÇÃO", "", "fch-g") + '</div>' +
    '<div class="fch-r">' + f("Prático", r[p + "hora_pratico"], "h", "fch-w2") + f(des ? "Largada" : "Amarração", r[p + "hora_amarracao"], "h", "fch-w2") + f(des ? "Bordo de desatracação" : "Bordo de atracação", r[p + "bordo"], "", "fch-g") + '</div>' +
    '<div class="fch-r">' + f("Início", r[p + "inicio_manobra"], "h", "fch-w2") + f("Término", r[p + "termino_manobra"], "h", "fch-w2") + f("Horário de entrada / saída", "", "h", "fch-g") + '</div>' +
    '<div class="fch-m"><div class="fch-box fch-cq">' + fchCroqui(r[p + "cabecos"]) + '</div>' +
      '<div class="fch-box fch-cal"><div class="fch-t">CALADOS</div>' + cl("Proa", cal.proa) + cl("Popa", cal.popa) + cl("Máx", cal.max) + '</div></div>' +
    '<div class="fch-r">' + f("Prático", r[p + "pratico"], "", "fch-g") + f("Rebocadores", r[p + "rebocadores"], "", "fch-g") + '</div>' +
    '<div class="fch-r">' + f("Obs.", r.observacoes, "", "fch-g fch-obs") + '</div>' +
    '<div class="fch-s"><div class="fch-sg"><i></i><span>ACOSTAGEM</span></div><div class="fch-sg"><i></i><span>COORDENADOR DE OPERAÇÕES</span></div>' +
      '<div class="fch-cb"><span class="fch-l">CBO (Carimbo)</span><span class="fch-v">' + esc(r.cbo || "") + '</span></div></div>' +
    '<div class="fch-ft">Impresso em ' + agoraBR() + ' · Line-up Recife</div>' +
  '</section>';
}

function fichaImprimir(s, tipo, duas){
  var h = fchHtml(s.rec, tipo, sitKey(s));
  var pa = document.getElementById("print-area");
  pa.innerHTML = '<div class="fch-sheet">' + h + (duas ? h : '') + '<div class="fch-cut"><span>✂ cortar aqui</span></div></div>';
  var st = document.createElement("style"); st.id = "print-page"; st.textContent = "@page{size:A4 portrait;margin:0}"; document.head.appendChild(st);
  document.body.classList.add("printing", "printing-ficha");
  function fim(){ window.removeEventListener("afterprint", fim); document.body.classList.remove("printing", "printing-ficha"); pa.innerHTML = ""; if(st.parentNode) st.parentNode.removeChild(st); }
  window.addEventListener("afterprint", fim);
  var img = pa.querySelector("img"), go = function(){ setTimeout(function(){ window.print(); }, 60); };
  if(img && !img.complete){ var t = setTimeout(go, 1200); img.onload = img.onerror = function(){ clearTimeout(t); go(); }; } else go();
}

/* Janela de escolha: qual manobra e se são 1 ou 2 fichas por folha */
function abrirFicha(s){
  var sit = sitKey(s), r = s.rec, jaAtracou = sit === "atracados" || sit === "desatracados";
  var padrao = (jaAtracou && (r.hora_pratico || r.hora_amarracao)) ? "desatracacao" : "atracacao";
  var duas = false; try{ duas = localStorage.getItem("lu_fch2") === "1"; }catch(e){}
  var opts = '<label class="fch-op"><input type="radio" name="fch-t" value="atracacao"' + (padrao === "atracacao" ? " checked" : "") + '><span>Atracação</span></label>' +
    (jaAtracou ? '<label class="fch-op"><input type="radio" name="fch-t" value="desatracacao"' + (padrao === "desatracacao" ? " checked" : "") + '><span>Desatracação</span></label>' : '');
  var d = dlg('<h2>Ficha de manobra de acostagem</h2>' +
    '<p class="fch-sub"><b>' + esc(s.navio) + '</b>' + (s.cais ? ' · berço ' + esc(s.cais) : '') + '</p>' +
    '<div class="fch-ops">' + opts + '</div>' +
    '<label class="fch-chk"><input type="checkbox" id="fch-2"' + (duas ? " checked" : "") + '> <span>Imprimir <b>duas fichas</b> na mesma folha A4 (depois é só cortar ao meio)</span></label>' +
    '<p class="fch-dica">A ficha sai em <b>meia folha A4</b>, já com os dados desta embarcação. O que ainda não foi registrado fica em branco, para preencher à mão.</p>' +
    '<div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="fch-go" type="button">Imprimir</button></div>');
  d.querySelector("#fch-go").onclick = function(){
    var t = (d.querySelector('input[name="fch-t"]:checked') || {}).value || "atracacao", dois = d.querySelector("#fch-2").checked;
    try{ localStorage.setItem("lu_fch2", dois ? "1" : "0"); }catch(e){}
    d.close(); fichaImprimir(s, t, dois);
  };
}
