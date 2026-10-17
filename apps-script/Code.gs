/* LINE-UP RECIFE — banco de dados + "porteiro" das edições.
   BANCO: aba NAVIOS = uma linha por navio, uma coluna por informação (cabeçalho na linha 1).
          A "situação" (Previsto, Fundeado, Atracado, Desatracado) é só uma coluna.
          Aba CONFIG guarda o aviso do topo; aba REGISTRO guarda quem mexeu em quê.
   SENHAS: Configurações do projeto > Propriedades do script > SENHAS (ex.: Pedro:1234,Maria:abcd).
   PRIMEIRO USO: executar a função prepararBanco() uma vez. */
var COLS = ["id","situacao","navio","cbo","imo","chegada","previsao_atracacao","saida","cais","comprimento","calado","agencia","operador","carga","operacao","origem_destino","porto_anterior","proximo_porto","ton_prevista","ton_movimentada","saldo","atualizado_em","atualizado_por"];
var DATAS = ["chegada","previsao_atracacao","saida","atualizado_em"], NUMS = ["comprimento","calado","ton_prevista","ton_movimentada"];
var TEXTOS = ["navio","agencia","operador","carga","origem_destino","porto_anterior","proximo_porto"];
var SITU = ["Previsto","Fundeado","Atracado","Desatracado"];
var FMT = "dd/MM/yyyy HH:mm", DATA = /^\d\d\/\d\d\/\d{4}/;

function ss(){ return SpreadsheetApp.getActive(); }
function tz(){ return ss().getSpreadsheetTimeZone(); }
function col(n){ return COLS.indexOf(n); }
function letra(n){ return String.fromCharCode(65 + col(n)); }
function resp(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function banco(){ var sh = ss().getSheetByName("NAVIOS"); if(!sh) throw new Error("Aba NAVIOS não existe. Abra o arquivo lineup_banco e execute prepararBanco()."); return sh; }
function fmt(d){ return Utilities.formatDate(d, tz(), FMT); }

/* ---------- leitura pública ---------- */
var DIAS_DESATRACADOS = 30;   /* a página recebe os desatracados dos últimos N dias; o histórico completo fica na aba NAVIOS */
function doGet(){
  var cache = CacheService.getScriptCache(), hit = cache.get("dados");
  if(hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var out = {atualizado: PropertiesService.getScriptProperties().getProperty("ULTIMA") || "", aviso: aviso(), navios: []};
  var sh = ss().getSheetByName("NAVIOS"), lim = Date.now() - DIAS_DESATRACADOS * 864e5;
  if(sh && sh.getLastRow() > 1){
    sh.getRange(2, 1, sh.getLastRow() - 1, COLS.length).getValues().forEach(function(r){
      if(!r[0]) return;
      var d = r[col("saida")] || r[col("chegada")];
      if(r[col("situacao")] === "Desatracado" && d instanceof Date && d.getTime() < lim) return;
      var o = {}; COLS.forEach(function(c, i){ o[c] = r[i] instanceof Date ? fmt(r[i]) : r[i]; });
      out.navios.push(o);
    });
  }
  var json = JSON.stringify(out);
  try { cache.put("dados", json, 20); } catch(x){}
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
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
    CacheService.getScriptCache().remove("dados");
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
  o.operacao = t(r.operacao).toUpperCase();
  var c = t(r.cais); o.cais = /^\d+$/.test(c) ? Number(c) : c;
  NUMS.forEach(function(k){
    var x = t(r[k]).replace(",", "."); o[k] = x === "" ? "" : Number(x);
    if(x !== "" && isNaN(o[k])) throw new Error("Número inválido em " + k + ".");
  });
  ["chegada","previsao_atracacao","saida"].forEach(function(k){ var x = t(r[k]); o[k] = x ? Utilities.parseDate(x, tz(), FMT) : ""; });
  if(!o.chegada && !(o.situacao === "Desatracado" && o.saida)) throw new Error("Falta a data de chegada.");
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

/* ---------- PRIMEIRO USO: depois de abrir o arquivo lineup_banco no Google Planilhas, execute prepararBanco() uma vez ---------- */
function prepararBanco(){
  var s = ss(); s.setSpreadsheetTimeZone("America/Recife");
  try { s.setSpreadsheetLocale("pt_BR"); } catch(x){}
  var sh = s.getSheetByName("NAVIOS");
  if(!sh) throw new Error("Não encontrei a aba NAVIOS. Abra o arquivo lineup_banco enviado.");
  var cab = sh.getRange(1, 1, 1, COLS.length).getValues()[0];
  for(var i = 0; i < COLS.length; i++)
    if(cab[i] !== COLS[i]) throw new Error("A coluna " + (i + 1) + " deveria se chamar '" + COLS[i] + "', mas está '" + cab[i] + "'. Não mexa nos cabeçalhos.");
  ["NAVIOS","CONFIG","REGISTRO","LISTAS","CORRECOES","REVISAR"].forEach(proteger);
  PropertiesService.getScriptProperties().setProperty("ULTIMA", fmt(new Date()));
  CacheService.getScriptCache().remove("dados");
  var msg = "Banco pronto: " + (sh.getLastRow() - 1) + " navios. Abas protegidas: só você (dono) e o sistema gravam.";
  Logger.log(msg); try { SpreadsheetApp.getUi().alert(msg); } catch(x){}
}
function proteger(nome){
  var sh = ss().getSheetByName(nome); if(!sh) return;
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function(p){ p.remove(); });
  var p = sh.protect().setDescription("Só o sistema grava aqui. Não edite à mão."), eu = Session.getEffectiveUser();
  p.addEditor(eu);
  p.removeEditors(p.getEditors().filter(function(u){ return u.getEmail() !== eu.getEmail(); }));
  if(p.canDomainEdit()) p.setDomainEdit(false);
}
