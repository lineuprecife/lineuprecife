/* LINE-UP RECIFE — banco de dados + "porteiro" das edições.
   BANCO: aba NAVIOS = uma linha por navio, uma coluna por informação (cabeçalho na linha 1).
          A "situação" (Previsto, Fundeado, Atracado, Desatracado) é só uma coluna.
          Aba CONFIG guarda o aviso do topo; aba REGISTRO guarda quem mexeu em quê.
   SENHAS: Configurações do projeto > Propriedades do script > SENHAS (ex.: Pedro:1234,Maria:abcd).
   PRIMEIRO USO: executar a função criarBanco() uma vez. */
var COLS = ["id","situacao","navio","cbo","imo","chegada","saida","cais","comprimento","calado","agencia","operador","carga","operacao","origem_destino","porto_anterior","proximo_porto","ton_prevista","ton_movimentada","saldo","atualizado_em","atualizado_por"];
var DATAS = ["chegada","saida","atualizado_em"], NUMS = ["comprimento","calado","ton_prevista","ton_movimentada"];
var TEXTOS = ["navio","agencia","operador","carga","origem_destino","porto_anterior","proximo_porto"];
var SITU = ["Previsto","Fundeado","Atracado","Desatracado"], OPER = ["IMPORTAÇÃO","EXPORTAÇÃO","SEM CARGA"];
var FMT = "dd/MM/yyyy HH:mm", DATA = /^\d\d\/\d\d\/\d{4}/;

function ss(){ return SpreadsheetApp.getActive(); }
function tz(){ return ss().getSpreadsheetTimeZone(); }
function col(n){ return COLS.indexOf(n); }
function letra(n){ return String.fromCharCode(65 + col(n)); }
function resp(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function banco(){ var sh = ss().getSheetByName("NAVIOS"); if(!sh) throw new Error("Aba NAVIOS não existe. Execute criarBanco() no Apps Script."); return sh; }
function fmt(d){ return Utilities.formatDate(d, tz(), FMT); }

/* ---------- leitura pública ---------- */
function doGet(){
  var out = {atualizado: PropertiesService.getScriptProperties().getProperty("ULTIMA") || "", aviso: aviso(), navios: []};
  var sh = ss().getSheetByName("NAVIOS");
  if(sh && sh.getLastRow() > 1){
    out.navios = sh.getRange(2, 1, sh.getLastRow() - 1, COLS.length).getValues().filter(function(r){ return r[0]; }).map(function(r){
      var o = {}; COLS.forEach(function(c, i){ o[c] = r[i] instanceof Date ? fmt(r[i]) : r[i]; }); return o;
    });
  }
  return resp(out);
}

/* ---------- gravação (só com senha) ---------- */
function doPost(e){
  var lock = LockService.getScriptLock();
  try {
    var b = JSON.parse(e.postData.contents), quem = quemE(b.senha);
    if(!quem){ Utilities.sleep(1500); return resp({ok:false, erro:"Senha incorreta."}); }
    if(b.acao === "check") return resp({ok:true, nome:quem});
    lock.waitLock(20000);
    var sh, ln;
    if(b.acao === "salvar"){
      sh = banco(); var v = norm(b.registro), r = b.registro;
      if(r.id){ ln = achar(sh, r.id); conferir(sh, ln, r.versao); v.id = r.id; }
      else { ln = Math.max(sh.getLastRow(), 1) + 1; v.id = Utilities.getUuid().slice(0, 8); }
      v.atualizado_em = new Date(); v.atualizado_por = quem;
      gravar(sh, ln, v);
      registrar(quem, r.id ? "editou" : "adicionou", v.navio, v.situacao);
    } else if(b.acao === "excluir"){
      sh = banco(); ln = achar(sh, b.id); conferir(sh, ln, b.versao); sh.deleteRow(ln);
      registrar(quem, "excluiu", b.navio, "");
    } else if(b.acao === "aviso"){
      defAviso(String(b.texto || "").trim()); registrar(quem, "mudou o aviso", "", "");
    } else throw new Error("Ação desconhecida.");
    return resp({ok:true});
  } catch(err){
    return resp({ok:false, erro:String(err.message || err)});
  } finally { try { lock.releaseLock(); } catch(x){} }
}

function quemE(senha){
  senha = String(senha || ""); if(!senha) return "";
  var lista = String(PropertiesService.getScriptProperties().getProperty("SENHAS") || "").split(/[\n,;]+/);
  for(var i = 0; i < lista.length; i++){
    var p = lista[i].trim(); if(!p) continue;
    var k = p.indexOf(":"), nome = k > 0 ? p.slice(0, k).trim() : "Coordenador", pw = k > 0 ? p.slice(k + 1).trim() : p;
    if(pw === senha) return nome;
  }
  return "";
}
/* Limpa e confere o que veio do formulário. */
function norm(r){
  var o = {}, t = function(x){ return String(x == null ? "" : x).trim(); };
  TEXTOS.forEach(function(c){ o[c] = t(r[c]).toUpperCase(); });
  o.cbo = t(r.cbo); o.imo = t(r.imo);
  if(!o.navio) throw new Error("Falta o nome do navio.");
  o.situacao = t(r.situacao); if(SITU.indexOf(o.situacao) < 0) throw new Error("Situação inválida.");
  o.operacao = t(r.operacao).toUpperCase(); if(o.operacao && OPER.indexOf(o.operacao) < 0) throw new Error("Operação inválida.");
  var c = t(r.cais); o.cais = /^\d+$/.test(c) ? Number(c) : c;
  NUMS.forEach(function(k){
    var x = t(r[k]).replace(",", "."); o[k] = x === "" ? "" : Number(x);
    if(x !== "" && isNaN(o[k])) throw new Error("Número inválido em " + k + ".");
  });
  ["chegada","saida"].forEach(function(k){ var x = t(r[k]); o[k] = x ? Utilities.parseDate(x, tz(), FMT) : ""; });
  if(!o.chegada) throw new Error("Falta a data de chegada.");
  return o;
}
function linha(v, ln){
  var p = letra("ton_prevista") + ln, m = letra("ton_movimentada") + ln;
  v.saldo = '=IF(' + p + '="","",' + p + '-N(' + m + '))';
  return COLS.map(function(c){ return v[c] === undefined ? "" : v[c]; });
}
function gravar(sh, ln, v){
  sh.getRange(ln, 1, 1, COLS.length).setValues([linha(v, ln)]);
  DATAS.forEach(function(c){ sh.getRange(ln, col(c) + 1).setNumberFormat("dd/mm/yyyy hh:mm"); });
}
function achar(sh, id){
  var n = sh.getLastRow(), ids = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues() : [];
  for(var i = 0; i < ids.length; i++) if(String(ids[i][0]) === String(id)) return i + 2;
  throw new Error("Esse navio não está mais na lista (alguém pode ter excluído). Atualize a página.");
}
function conferir(sh, ln, versao){
  if(versao === undefined) return;
  var x = sh.getRange(ln, col("atualizado_em") + 1).getValue();
  if((x instanceof Date ? fmt(x) : String(x)) !== String(versao)) throw new Error("Outra pessoa alterou este navio. Atualize a página e tente de novo.");
}
function registrar(quem, acao, navio, det){
  var sh = ss().getSheetByName("REGISTRO") || ss().insertSheet("REGISTRO");
  if(!sh.getLastRow()) sh.appendRow(["Data", "Quem", "Ação", "Navio", "Detalhe"]);
  var agora = fmt(new Date());
  sh.appendRow([agora, quem, acao, navio || "", det || ""]);
  PropertiesService.getScriptProperties().setProperty("ULTIMA", agora);
}
function aviso(){
  var sh = ss().getSheetByName("CONFIG"); if(!sh) return "";
  var v = sh.getDataRange().getValues();
  for(var i = 0; i < v.length; i++) if(v[i][0] === "aviso") return String(v[i][1] || "");
  return "";
}
function defAviso(txt){
  var sh = ss().getSheetByName("CONFIG") || ss().insertSheet("CONFIG"), v = sh.getDataRange().getValues();
  for(var i = 0; i < v.length; i++) if(v[i][0] === "aviso"){ sh.getRange(i + 1, 2).setValue(txt); return; }
  sh.appendRow(["aviso", txt]);
}

/* Lê as colunas das abas antigas pelo NOME do cabeçalho (cada aba tem colunas em posições diferentes). */
var HDR = {chegada:/chegada/, saida:/saida|desatrac/, cais:/^cais/, navio:/^navio|embarcac/, cbo:/^cbo/, imo:/^imo/, comp:/compr/, calado:/calado/, agencia:/agencia/, operador:/operador/, carga:/^carga/, mod:/modalidade/, origem:/proced|destino/, anterior:/anterior/, proximo:/proximo/, prev:/tonelagem.*prev|^prev.*ton/, mov:/movimentad/};
function normH(t){ return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function layoutPorCabecalho(rows){
  for(var i = 0; i < Math.min(rows.length, 8); i++){
    if(!/^chegada/.test(normH(rows[i][0]))) continue;
    var L = {};
    rows[i].forEach(function(h, c){ var t = normH(h); Object.keys(HDR).forEach(function(k){ if(L[k] == null && HDR[k].test(t)) L[k] = c; }); });
    return L.navio != null ? L : null;
  }
  return null;
}

/* ---------- PRIMEIRO USO: cria o banco e traz os dados das abas antigas ---------- */
function criarBanco(){
  var s = ss(); s.setSpreadsheetTimeZone("America/Recife");
  var sh = s.getSheetByName("NAVIOS") || s.insertSheet("NAVIOS", 0);
  if(!sh.getLastRow()){
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight("bold").setBackground("#0A3159").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
    var lista = function(a){ return SpreadsheetApp.newDataValidation().requireValueInList(a, true).setAllowInvalid(false).build(); };
    sh.getRange(2, col("situacao") + 1, 2000).setDataValidation(lista(SITU));
    sh.getRange(2, col("operacao") + 1, 2000).setDataValidation(lista(OPER));
    DATAS.forEach(function(c){ sh.getRange(2, col(c) + 1, 2000).setNumberFormat("dd/mm/yyyy hh:mm"); });
  }
  if(!s.getSheetByName("CONFIG")) defAviso("");
  if(!s.getSheetByName("REGISTRO")) registrar("sistema", "criou o banco", "", "");
  var n = sh.getLastRow() > 1 ? 0 : importarAntigo(sh);
  PropertiesService.getScriptProperties().setProperty("ULTIMA", fmt(new Date()));
  var msg = "Banco pronto. Navios importados das abas antigas: " + n + ".";
  Logger.log(msg); try { SpreadsheetApp.getUi().alert(msg); } catch(x){}
}
function importarAntigo(sh){
  var A = {chegada:0, saida:1, cais:2, navio:3, cbo:4, comp:5, calado:6, agencia:7, operador:8, carga:9, mod:10, origem:11, anterior:12, proximo:13, prev:14, mov:15};
  var P = {chegada:0, saida:2, cais:3, navio:4, imo:5, comp:6, calado:7, agencia:8, operador:9, carga:10, mod:11, origem:12, anterior:13, prev:15};
  var abas = [["ATRACADOS","Atracado",A],["PREVISTOS","Previsto",P],["FUNDEADOS","Fundeado",A],["DESATRACADOS","Desatracado",A]];
  var linhas = [], ln = 2, agora = new Date();
  var dt = function(x){ x = String(x || "").trim(); if(!DATA.test(x)) return ""; x = x.slice(0, 16); return x.length === 10 ? x + " 00:00" : x; };
  abas.forEach(function(a){
    var tab = ss().getSheetByName(a[0]); if(!tab || !tab.getLastRow()) return;
    var vals = tab.getDataRange().getDisplayValues(), L = layoutPorCabecalho(vals) || a[2];
    vals.forEach(function(r){
      var g = function(k){ if(L[k] == null) return ""; var x = String(r[L[k]] || "").trim(); return /^(N\/I|N\/A|-)$/i.test(x) ? "" : x; };
      if(/^NOTA/i.test(String(r[0]).trim())){ if(String(r[1]).trim()) defAviso(String(r[1]).trim()); return; }
      if(!DATA.test(String(r[0]).trim()) || !g("navio")) return;
      var mod = g("mod").toUpperCase(), prev = g("prev").replace(/\D/g, ""), carga = g("carga");
      var op = (mod === "IMPORTAÇÃO" || mod === "EXPORTAÇÃO") ? mod : (!Number(prev) && (mod || carga) ? "SEM CARGA" : "");
      if(op === "SEM CARGA") carga = mod || carga;
      var v = norm({situacao:a[1], navio:g("navio"), cbo:g("cbo"), imo:g("imo"), chegada:dt(r[0]), saida:dt(r[L.saida]),
        cais:g("cais"), comprimento:g("comp").replace(/[^\d,.]/g, ""), calado:g("calado").replace(/[^\d,.]/g, ""),
        agencia:g("agencia"), operador:g("operador"), carga:carga, operacao:op, origem_destino:g("origem"),
        porto_anterior:g("anterior"), proximo_porto:g("proximo"), ton_prevista:prev, ton_movimentada:g("mov").replace(/\D/g, "")});
      v.id = Utilities.getUuid().slice(0, 8); v.atualizado_em = agora; v.atualizado_por = "migração";
      linhas.push(linha(v, ln++));
    });
  });
  if(linhas.length) sh.getRange(2, 1, linhas.length, COLS.length).setValues(linhas);
  return linhas.length;
}
