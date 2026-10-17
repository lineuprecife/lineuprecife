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
function mapaPt(k, t){   /* ponto na linha central do berço: t = 0 (lado leste) a 1 (lado oeste) */
  var p = GEO[k].p, ax = (p[0][0]+p[2][0])/2, ay = (p[0][1]+p[2][1])/2, bx = (p[1][0]+p[3][0])/2, by = (p[1][1]+p[3][1])/2;
  return {x: ax + (bx-ax)*t - MAPA.OX, y: ay + (by-ay)*t - MAPA.OY};
}
function mapaPos(lista){
  var por = {}, multi = [], dots = [];
  lista.forEach(function(s){
    var ks = caisKeys(s.cais); if(!ks.length) return;
    if(ks.length > 1) multi.push({s:s, ks:ks}); else (por[ks[0]] = por[ks[0]] || []).push(s);
  });
  Object.keys(por).forEach(function(k){
    var Lb = GEO[k].L, ships = por[k].slice().sort(function(a, b){ var da = parseDate(a.chegada), db = parseDate(b.chegada); return (da?+da:0) - (db?+db:0); });
    var c = ships.map(function(s){ var n = parseFloat(String(s.comp||"").replace(",", ".")); return n > 0 ? n : 90; });
    var gap = 12, total = c.reduce(function(a, b){ return a + b; }, 0) + gap*(c.length-1), f = total > Lb ? Lb/total : 1, cur = (Lb - total*f)/2;
    ships.forEach(function(s, i){
      var w = c[i]*f, p = mapaPt(k, (cur + w/2)/Lb); cur += w + gap*f;
      if(ships.length >= 4) p.y += (i % 2 ? 7 : -7);    /* muitos navios: escalona para não encostar */
      dots.push({s:s, x:p.x, y:p.y});
    });
  });
  multi.forEach(function(m){                              /* navio ocupando 2 berços: ponto entre eles */
    var ps = m.ks.map(function(k){ return mapaPt(k, 0.5); });
    dots.push({s:m.s, x:ps.reduce(function(a, p){ return a + p.x; }, 0)/ps.length, y:ps.reduce(function(a, p){ return a + p.y; }, 0)/ps.length});
  });
  for(var it = 0; it < 60; it++){                         /* afasta pontos que ainda estiverem perto demais */
    var moved = false;
    for(var i = 0; i < dots.length; i++) for(var j = i+1; j < dots.length; j++){
      var dx = dots[j].x - dots[i].x, dy = dots[j].y - dots[i].y, d = Math.sqrt(dx*dx + dy*dy);
      if(d >= MAPA.MIN) continue;
      if(d < 0.01){ dx = 1; dy = 0; d = 1; }
      var push = (MAPA.MIN - d)/2 + 0.1, ux = dx/d, uy = dy/d;
      dots[i].x -= ux*push; dots[i].y -= uy*push; dots[j].x += ux*push; dots[j].y += uy*push; moved = true;
    }
    if(!moved) break;
  }
  return dots;
}
function renderMapa(){
  var box = document.getElementById("dots"); if(!box) return;
  box.innerHTML = mapaPos(listOf("atracados")).map(function(d){
    var s = d.s, cls = s.mod === "IMPORTAÇÃO" ? "imp" : s.mod === "EXPORTAÇÃO" ? "exp" : "out", fx = d.x / MAPA.W;
    return '<button type="button" class="dot ' + cls + (fx > 0.85 ? " r" : fx < 0.12 ? " l" : "") + '" style="left:' + (fx*100).toFixed(2) + '%;top:' + (d.y/MAPA.H*100).toFixed(2) +
      '%" aria-label="' + esc(s.navio + ", cais " + s.cais) + '"><span>' + esc(s.navio) + '<small>Cais ' + esc(s.cais) + '</small></span></button>';
  }).join("");
}
window.addEventListener("load", function(){
  var box = document.getElementById("dots"); if(!box) return;
  document.addEventListener("click", function(e){        /* toque no ponto abre o nome; toque fora fecha */
    var b = e.target.closest ? e.target.closest(".dot") : null;
    Array.prototype.forEach.call(box.querySelectorAll(".dot.on"), function(x){ if(x !== b) x.classList.remove("on"); });
    if(b) b.classList.toggle("on");
  });
});
