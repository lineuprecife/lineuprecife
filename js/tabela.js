/* Visão "Tabela completa": mostra TODAS as colunas de cada lista, na mesma ordem da planilha original.
   Carrega ANTES do app.js; só roda depois que a página abre. */
var _D = ["Saída","Berço","Embarcação","CBO","Compr.","Calado","Agência de navegação","Operador portuário","Carga","Modalidade","Procedência / destino da carga","Porto anterior","Próximo porto"];
var COLS_TAB = {
  desatracados: [["saida","Saída (data/hora)","d"],["cais",_D[1]],["navio",_D[2]],["cbo",_D[3]],["comp",_D[4]],["calado",_D[5]],["agencia",_D[6]],["operador",_D[7]],["carga",_D[8]],["modRaw",_D[9]],["origem",_D[10]],["anterior",_D[11]],["proximo",_D[12]],["mov","Tonelagem final","n"]],
  atracados: [["chegada","Atracação (data/hora)","d"],["saida","Previsão de saída (ETD)","d"],["cais",_D[1]],["navio",_D[2]],["cbo",_D[3]],["comp",_D[4]],["calado",_D[5]],["agencia",_D[6]],["operador",_D[7]],["carga",_D[8]],["modRaw",_D[9]],["origem",_D[10]],["anterior",_D[11]],["proximo",_D[12]],["prev","Tonelagem prevista","n"],["mov","Tonelagem movimentada","n"],["saldo","Saldo","n"]],
  previstos: [["chegada","Previsão de chegada (ETA)","d"],["atracacao","Previsão de atracação (POB)","d"],["saida","Previsão de saída (ETD)","d"],["cais","Berço previsto (ETB)"],["navio",_D[2]],["imo","IMO"],["comp",_D[4]],["calado",_D[5]],["agencia",_D[6]],["operador",_D[7]],["carga",_D[8]],["modRaw",_D[9]],["origem",_D[10]],["anterior",_D[11]],["proximo",_D[12]],["prev","Tonelagem prevista","n"]]
};
COLS_TAB.fundeados = COLS_TAB.previstos.map(function(c, i){ return i === 0 ? ["chegada","Chegada confirmada","d"] : c; });

function viewOf(id){ return (state.views && state.views[id]) || (id === "desatracados" ? "tabela" : "cartoes"); }

function tabelaHtml(id, items){
  var cols = COLS_TAB[id], ed = typeof EDIT !== "undefined" && EDIT.on;
  var h = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + cols.map(function(c){ return '<th' + (c[0] === 'navio' ? ' class="nv"' : '') + '>' + c[1] + '</th>'; }).join("") + (ed ? '<th>Ações</th>' : '') + '</tr></thead><tbody>';
  items.forEach(function(s){
    h += '<tr>' + cols.map(function(c){
      var v = c[0] === "saldo" ? (s.prev || 0) - (s.mov || 0) : s[c[0]];
      if(c[2] === "d") v = String(v || "").slice(0, 16);
      else if(c[2] === "n") v = (v || v === 0) ? num(v) : "";
      var vazio = v === "" || v == null, k = [];
      if(c[0] === "navio") k.push("nv"); else if(c[2] === "n") k.push("r");
      if(/^(cbo|imo|comp|calado|cais)$/.test(c[0])) k.push("nw");
      if(vazio) k.push("vz");
      return '<td' + (k.length ? ' class="' + k.join(" ") + '"' : '') + ' data-label="' + esc(c[1]) + '">' + (vazio ? '<span class="meta">—</span>' : esc(v)) + '</td>';
    }).join("") + (ed ? '<td class="ac">' + botoes(s) + '</td>' : '') + '</tr>';
  });
  return h + '</tbody></table></div>';
}

window.addEventListener("load", function(){
  state.views = state.views || {};
  renderPanel();
});
