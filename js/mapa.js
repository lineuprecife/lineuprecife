/* Mapa dos cais: marca com um ponto cada navio atracado, na posição do seu berço, sem um ponto cobrir o outro.
   Carrega ANTES do app.js; renderMapa() é chamada pelo renderBerths() do app.js. */
var MAPA = {W:1050, H:390, OX:360, OY:150, MIN:24};   /* tamanho e recorte da imagem; MIN = distância mínima entre pontos (px da imagem) */
/* Cada berço: L = comprimento real (m, tabela de 2023); p = [cais-leste, cais-oeste, água-leste, água-oeste] em pixels da imagem original. */
var GEO = {
  "00-TA":{L:180,    p:[[1346,272],[1256,270],[1346,315],[1255,314]]},
  "1":    {L:160,    p:[[1256,270],[1172,268],[1255,314],[1171,311]]},
  "2":    {L:228.51, p:[[1172,268],[1059,264],[1171,311],[1059,306]]},
  "3":    {L:162.9,  p:[[1059,264],[969,312],[1059,306],[986,349]]},
  "4":    {L:200.29, p:[[969,312],[887,356],[986,349],[903,392]]},
  "5":    {L:211.42, p:[[887,356],[806,398],[903,392],[812,437]]},
  "6":    {L:196.59, p:[[806,398],[704,404],[812,437],[706,444]]},
  "7":    {L:137,    p:[[704,404],[612,409],[706,444],[614,450]]},
  "8":    {L:120,    p:[[612,409],[523,414],[614,450],[524,454]]},
  "9":    {L:239.9,  p:[[523,414],[414,421],[524,454],[415,459]]}
};
function mapaPt(k, t, s){   /* ponto no berço: t = 0 (lado leste) a 1 (lado oeste); s = 0 (borda do cais) a 1 (lado da água). Navios ficam encostados no cais (s = 0,36). */
  if(s == null) s = 0.36;
  var p = GEO[k].p, ax = p[0][0] + (p[2][0]-p[0][0])*s, ay = p[0][1] + (p[2][1]-p[0][1])*s, bx = p[1][0] + (p[3][0]-p[1][0])*s, by = p[1][1] + (p[3][1]-p[1][1])*s;
  return {x: ax + (bx-ax)*t - MAPA.OX, y: ay + (by-ay)*t - MAPA.OY};
}
var MAPA_IMG_LIMPA = true;   /* mude para true quando a imagem do mapa NÃO tiver as divisões dos berços desenhadas: a página passa a desenhá-las */
function mapaEixo(k){ var p = GEO[k].p, a = mapaPt(k, 0), b = mapaPt(k, 1); return Math.sqrt(Math.pow(b.x-a.x, 2) + Math.pow(b.y-a.y, 2)); }
function compM(s){ var n = parseFloat(String(s.comp||"").replace(",", ".")); return n > 0 ? n : 90; }
function mapaTipo(m){ return m < 60 ? "boat" : m <= 150 ? "mid" : "big"; }
var ASPECTO = {boat:0.38, mid:0.22, big:0.22};
var GIRO = {"3":-25, "4":-25, "5":-25};   /* graus por berço (negativo = para a esquerda, anti-horário); cada embarcação gira pelo seu próprio centro */   /* altura / largura do desenho */
function mapaPos(lista){
  var por = {}, multi = [], itens = [];
  lista.forEach(function(s){
    var ks = caisKeys(s.cais); if(!ks.length) return;
    if(ks.length > 1) multi.push({s:s, ks:ks}); else (por[ks[0]] = por[ks[0]] || []).push(s);
  });
  Object.keys(por).forEach(function(k){
    var Lb = GEO[k].L, eixo = mapaEixo(k), sc = eixo/Lb;                       /* sc = pixels da imagem por metro neste berço */
    var ships = por[k].slice().sort(function(a, b){ var da = parseDate(a.chegada), db = parseDate(b.chegada); return (da?+da:0) - (db?+db:0); });
    var c = ships.map(compM), gap = 10, total = c.reduce(function(a, b){ return a + b; }, 0) + gap*(c.length-1), f = total > Lb ? Lb/total : 1, cur = (Lb - total*f)/2;
    ships.forEach(function(s, i){
      var m = c[i], w = Math.min(Math.max(m*sc*f, 30), eixo), p = mapaPt(k, (cur + m*f/2)/Lb); cur += (m + gap)*f;
      if(ships.length >= 4) p.y += (i % 2 ? 8 : -8);
      itens.push({s:s, x:p.x, y:p.y, w:w, kind:mapaTipo(m), rot:GIRO[k] || 0});
    });
  });
  multi.forEach(function(g){                                                    /* navio em dois berços: ocupa os dois */
    var ps = g.ks.map(function(k){ return mapaPt(k, 0.5); }), w = g.ks.reduce(function(a, k){ return a + mapaEixo(k); }, 0);
    itens.push({s:g.s, x:ps.reduce(function(a, p){ return a + p.x; }, 0)/ps.length, y:ps.reduce(function(a, p){ return a + p.y; }, 0)/ps.length, w:Math.min(w, compM(g.s)*0.5), kind:mapaTipo(compM(g.s)), rot:g.ks.every(function(k){ return GIRO[k]; }) ? GIRO[g.ks[0]] : 0});
  });
  itens.forEach(function(d){
    d.h = d.w*ASPECTO[d.kind];
    var a = Math.abs(d.rot)*Math.PI/180;                                        /* caixa que o desenho girado ocupa, para a separação */
    d.ew = d.w*Math.cos(a) + d.h*Math.sin(a); d.eh = d.w*Math.sin(a) + d.h*Math.cos(a);
  });
  for(var it = 0; it < 80; it++){                                               /* separa desenhos que ainda se sobreponham */
    var moved = false;
    for(var i = 0; i < itens.length; i++) for(var j = i+1; j < itens.length; j++){
      var A = itens[i], B = itens[j], dx = B.x - A.x, dy = B.y - A.y;
      var ox = (A.ew + B.ew)/2 + 3 - Math.abs(dx), oy = (A.eh + B.eh)/2 + 3 - Math.abs(dy);
      if(ox <= 0 || oy <= 0) continue;
      if(ox < oy){ var s1 = (dx < 0 ? -1 : 1), q = ox/2 + 0.1; A.x -= s1*q; B.x += s1*q; }
      else { var s2 = (dy < 0 ? -1 : 1), r = oy/2 + 0.1; A.y -= s2*r; B.y += s2*r; }
      moved = true;
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
function mapaBercos(){                                                          /* divisões e números dos berços, desenhados pela página */
  var sv = document.getElementById("bercos"); if(!sv || sv.getAttribute("data-ok")) return;
  sv.setAttribute("data-ok", "1");
  sv.innerHTML = Object.keys(GEO).map(function(k){
    var p = GEO[k].p.map(function(q){ return [q[0]-MAPA.OX, q[1]-MAPA.OY]; }), c = mapaPt(k, 0.5, 0.82), cx = c.x, cy = c.y;   /* número no lado da água, longe dos navios */
    return '<polygon points="' + [p[0], p[1], p[3], p[2]].map(function(q){ return q[0] + "," + q[1]; }).join(" ") + '"/><text x="' + cx + '" y="' + cy + '">' + (k.length < 2 ? "0" + k : k) + '</text>';
  }).join("");
}
function renderMapa(){
  var box = document.getElementById("dots"); if(!box) return;
  if(MAPA_IMG_LIMPA) mapaBercos();
  box.innerHTML = mapaPos(listOf("atracados")).map(function(d){
    var s = d.s, cls = s.mod === "IMPORTAÇÃO" ? "imp" : s.mod === "EXPORTAÇÃO" ? "exp" : "out", fx = d.x / MAPA.W;
    return '<button type="button" class="navmap ' + cls + (fx > 0.85 ? " r" : fx < 0.12 ? " l" : "") + '" style="left:' + (fx*100).toFixed(2) + '%;top:' + (d.y/MAPA.H*100).toFixed(2) + '%;width:' + (d.w/MAPA.W*100).toFixed(2) +
      '%' + (d.rot ? ';--giro:' + d.rot + 'deg' : '') + '" aria-label="' + esc(s.navio + ", cais " + s.cais) + '">' + mapaSvg(d.kind) + '<span>' + esc(s.navio) + '<small>Cais ' + esc(s.cais) + '</small></span></button>';
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
