/* Mapa dos cais: marca cada navio atracado, encostado no cais e alinhado com ele, na posição do seu berço.
   Carrega ANTES do app.js; renderMapa() é chamada pelo renderBerths() do app.js.
   Medidas feitas no próprio desenho (mapa-cais-desenho.png, 2057×764 px). Se trocar a imagem, refaça CAIS. */
var MAPA = {W:1050, H:390, K:1050/2057};   /* tela do mapa (1050×390) e fator px do desenho -> tela */
/* Linha da borda do cais, do leste (berço 00-TA) para o oeste (berço 9), em px do desenho:
   trecho reto leste-oeste (00-TA, 1, 2) -> trecho inclinado (3, 4, 5) -> trecho reto até o oeste (6, 7, 8, 9). */
var CAIS = [[1868,242],[1313,225],[1092,341],[966,395],[835,458],[0,504]];
var BL = {"00-TA":180, "1":160, "2":228.51, "3":162.9, "4":200.29, "5":211.42, "6":196.59, "7":137, "8":120, "9":239.9};   /* comprimento real de cada berço (m) */
var GRUPOS = [{ks:["00-TA","1","2"], fim:1}, {ks:["3","4","5"], fim:4}, {ks:["6","7","8","9"], pxm:0.96}];   /* fim = vértice do CAIS onde o trecho termina; pxm = px do desenho por metro */
var ARC = [0], GEO = {};
(function(){
  for(var i = 1; i < CAIS.length; i++) ARC[i] = ARC[i-1] + Math.sqrt(Math.pow(CAIS[i][0]-CAIS[i-1][0], 2) + Math.pow(CAIS[i][1]-CAIS[i-1][1], 2));
  var ini = 0;
  GRUPOS.forEach(function(g){   /* cada berço ocupa, ao longo do cais, um pedaço proporcional ao seu comprimento real */
    var tot = g.ks.reduce(function(a, k){ return a + BL[k]; }, 0), a = ARC[ini], fim = g.fim != null ? ARC[g.fim] : a + tot*g.pxm, sc = (fim - a)/tot, cur = a;
    g.ks.forEach(function(k){ GEO[k] = {L:BL[k], a:cur, b:cur + BL[k]*sc, sc:sc}; cur += BL[k]*sc; });
    if(g.fim != null) ini = g.fim;
  });
})();
function mapaArc(s){   /* ponto da borda do cais a s px do desenho a partir do leste, já em coordenadas da tela */
  var i = 1; while(i < ARC.length-1 && s > ARC[i]) i++;
  var f = Math.max(0, Math.min(1, (s - ARC[i-1])/(ARC[i] - ARC[i-1]))), a = CAIS[i-1], b = CAIS[i];
  return {x:(a[0] + (b[0]-a[0])*f)*MAPA.K, y:(a[1] + (b[1]-a[1])*f)*MAPA.K};
}
function mapaPt(k, t){ var g = GEO[k]; return mapaArc(g.a + (g.b - g.a)*t); }   /* t = 0 (lado leste) a 1 (lado oeste) */
function mapaFrame(p0, p1){   /* direção do cais entre dois pontos: ang = giro do desenho; (nx,ny) aponta para a água */
  var dx = p1.x - p0.x, dy = p1.y - p0.y, n = Math.sqrt(dx*dx + dy*dy) || 1, ux = dx/n, uy = dy/n;
  return {ux:ux, uy:uy, nx:uy, ny:-ux, ang:Math.atan2(-uy, -ux)*180/Math.PI, len:n};
}
function compM(s){ var n = parseFloat(String(s.comp||"").replace(",", ".")); return n > 0 ? n : 90; }
function mapaTipo(m){ return m < 60 ? "boat" : m <= 150 ? "mid" : "big"; }
var ASPECTO = {boat:0.38, mid:0.22, big:0.22};   /* altura / largura do desenho */
function mapaItem(s, p0, p1, w, kind, faixa){   /* navio encostado no cais, girado pela direção do cais; faixa 1 = segunda fileira, mais para dentro da água */
  var f = mapaFrame(p0, p1), h = w*ASPECTO[kind], d = h/2 + 2.5 + (faixa ? h + 3 : 0);
  return {s:s, x:(p0.x + p1.x)/2 + f.nx*d, y:(p0.y + p1.y)/2 + f.ny*d, w:w, h:h, kind:kind, rot:Math.round(f.ang*10)/10, ux:f.ux, uy:f.uy, nx:f.nx, ny:f.ny};
}
function mapaPos(lista){
  var por = {}, multi = [], itens = [];
  lista.forEach(function(s){
    var ks = caisKeys(s.cais); if(!ks.length) return;
    if(ks.length > 1) multi.push({s:s, ks:ks}); else (por[ks[0]] = por[ks[0]] || []).push(s);
  });
  Object.keys(por).forEach(function(k){
    var G = GEO[k], Lb = G.L, sc = G.sc*MAPA.K, eixo = (G.b - G.a)*MAPA.K;   /* sc = px da tela por metro neste berço */
    [false, true].forEach(function(cb){                                       /* primeiro os encostados no cais; depois os a contra bordo (/CB), na fileira de fora */
      var ships = por[k].filter(function(s){ return ehCB(s.cais) === cb; }).sort(function(a, b){ var da = parseDate(a.chegada), db = parseDate(b.chegada); return (da?+da:0) - (db?+db:0); });
      if(!ships.length) return;
      var c = ships.map(compM), gap = 10, total = c.reduce(function(a, b){ return a + b; }, 0) + gap*(c.length-1), f = total > Lb ? Lb/total : 1, cur = (Lb - total*f)/2;
      ships.forEach(function(s, i){
        var m = c[i], w = Math.min(Math.max(m*sc*f, 30), eixo), p0 = mapaPt(k, cur/Lb), p1 = mapaPt(k, (cur + m*f)/Lb);
        cur += (m + gap)*f;
        itens.push(mapaItem(s, p0, p1, w, mapaTipo(m), cb || (ships.length >= 4 && i % 2)));
      });
    });
  });
  multi.forEach(function(g){                                                    /* navio em dois ou mais berços: ocupa os dois */
    var ks = g.ks.slice().sort(function(a, b){ return GEO[a].a - GEO[b].a; }), p0 = mapaPt(ks[0], 0), p1 = mapaPt(ks[ks.length-1], 1), len = mapaFrame(p0, p1).len;
    itens.push(mapaItem(g.s, p0, p1, Math.max(30, Math.min(len, compM(g.s)*GEO[ks[0]].sc*MAPA.K)), mapaTipo(compM(g.s)), ehCB(g.s.cais) ? 1 : 0));
  });
  for(var it = 0; it < 40; it++){                                               /* se dois desenhos ainda se tocarem, afasta um do outro ao longo do cais */
    var moved = false;
    for(var i = 0; i < itens.length; i++) for(var j = i+1; j < itens.length; j++){
      var A = itens[i], B = itens[j], dx = B.x - A.x, dy = B.y - A.y, along = dx*A.ux + dy*A.uy, across = dx*A.nx + dy*A.ny;
      var ox = (A.w + B.w)/2 + 2 - Math.abs(along), oy = (A.h + B.h)/2 + 1 - Math.abs(across);
      if(ox <= 0 || oy <= 0) continue;
      var sg = along < 0 ? -1 : 1, q = ox/2 + 0.1;
      A.x -= sg*q*A.ux; A.y -= sg*q*A.uy; B.x += sg*q*A.ux; B.y += sg*q*A.uy; moved = true;
    }
    if(!moved) break;
  }
  return itens;
}
function mapaSvg(kind){
  if(kind === "boat") return '<svg viewBox="0 0 100 38" aria-hidden="true"><path class="h" d="M1 19C12 4 30 2 48 2H92Q99 2 99 9V29Q99 36 92 36H48C30 36 12 34 1 19Z"/><rect class="c" x="58" y="9" width="26" height="20" rx="4"/><rect class="c" x="38" y="14" width="12" height="10" rx="3"/></svg>';
  var n = kind === "big" ? 4 : 2, x0 = kind === "big" ? 27 : 36, w = kind === "big" ? 11.5 : 19, step = kind === "big" ? 13.5 : 22, hat = "";
  for(var i = 0; i < n; i++) hat += '<rect class="t" x="' + (x0 + i*step) + '" y="5" width="' + w + '" height="12" rx="1"/>';
  return '<svg viewBox="0 0 100 22" aria-hidden="true"><path class="h" d="M1 11C9 3 18 1.5 28 1.5H95Q99 1.5 99 5V17Q99 20.5 95 20.5H28C18 20.5 9 19 1 11Z"/>' + hat + '<rect class="c" x="83" y="4.5" width="11" height="13" rx="1.5"/></svg>';
}
function mapaBercos(){                                                          /* número de cada berço, na calçada do cais, bem ao lado do trecho que ele ocupa */
  var sv = document.getElementById("bercos"); if(!sv || sv.getAttribute("data-ok")) return;
  sv.setAttribute("data-ok", "1");
  sv.innerHTML = Object.keys(GEO).map(function(k){
    var f = mapaFrame(mapaPt(k, 0), mapaPt(k, 1)), m = mapaPt(k, 0.5), t = k.length < 2 ? "0" + k : k, w = t.length*8 + 16, cx = m.x - f.nx*15, cy = m.y - f.ny*15;   /* do lado da terra, para não ficar embaixo dos navios */
    return '<g><rect x="' + (cx - w/2).toFixed(1) + '" y="' + (cy - 10).toFixed(1) + '" width="' + w + '" height="20" rx="10"/><text x="' + cx.toFixed(1) + '" y="' + (cy + 0.5).toFixed(1) + '">' + t + '</text></g>';
  }).join("");
}
function renderMapa(){
  var box = document.getElementById("dots"); if(!box) return;
  mapaBercos();
  box.innerHTML = mapaPos(listOf("atracados")).map(function(d){
    var s = d.s, cls = s.mod === "IMPORTAÇÃO" ? "imp" : s.mod === "EXPORTAÇÃO" ? "exp" : "out", fx = d.x / MAPA.W;
    return '<button type="button" class="navmap ' + cls + (fx > 0.85 ? " r" : fx < 0.12 ? " l" : "") + '" style="left:' + (fx*100).toFixed(2) + '%;top:' + (d.y/MAPA.H*100).toFixed(2) + '%;width:' + (d.w/MAPA.W*100).toFixed(2) +
      '%' + (d.rot ? ';--giro:' + d.rot + 'deg' : '') + '" aria-label="' + esc(s.navio + ", berço " + s.cais) + '">' + mapaSvg(d.kind) + '<span>' + esc(s.navio) + '<small>Berço ' + esc(s.cais) + '</small></span></button>';
  }).join("");
}
window.addEventListener("load", function(){
  var box = document.getElementById("dots"); if(!box) return;
  document.addEventListener("click", function(e){        /* toque no navio abre o nome; toque fora fecha */
    var b = e.target.closest ? e.target.closest(".navmap") : null;
    Array.prototype.forEach.call(box.querySelectorAll(".navmap.on"), function(x){ if(x !== b) x.classList.remove("on"); });
    if(b) b.classList.toggle("on");
  });
});
