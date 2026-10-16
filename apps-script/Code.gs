/* LINE-UP RECIFE — "porteiro" das edições.
   Fica dentro da planilha (Extensões > Apps Script). A página pública lê os dados daqui;
   para gravar, a senha é conferida AQUI, nunca no site. As senhas ficam em
   Configurações do projeto > Propriedades do script > SENHAS  (ex.: Pedro:1234,Maria:abcd). */
var ABAS = ["ATRACADOS", "PREVISTOS", "FUNDEADOS", "DESATRACADOS"];
var DATA = /^\d\d\/\d\d\/\d{4}/;

function ss(){ return SpreadsheetApp.getActive(); }
function resp(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(){
  var out = {atualizado: PropertiesService.getScriptProperties().getProperty("ULTIMA") || "", tabs: {}};
  ABAS.forEach(function(n){
    var sh = ss().getSheetByName(n);
    out.tabs[n] = sh && sh.getLastRow() ? sh.getDataRange().getDisplayValues() : [];
  });
  return resp(out);
}

function doPost(e){
  var lock = LockService.getScriptLock();
  try {
    var b = JSON.parse(e.postData.contents);
    var quem = quemE(b.senha);
    if(!quem){ Utilities.sleep(1500); return resp({ok:false, erro:"Senha incorreta."}); }
    if(b.acao === "check") return resp({ok:true, nome:quem});
    lock.waitLock(20000);
    var sh = aba(b.aba), ln = Number(b.linha);
    if(b.acao === "add") inserir(sh, b.celulas);
    else if(b.acao === "update"){ conferir(sh, ln, b.expect); escrever(sh, ln, b.celulas); }
    else if(b.acao === "delete"){ conferir(sh, ln, b.expect); sh.deleteRow(ln); }
    else if(b.acao === "move"){ conferir(sh, ln, b.expect); inserir(aba(b.destino), b.celulas); sh.deleteRow(ln); }
    else throw new Error("Ação desconhecida.");
    registrar(quem, b);
    return resp({ok:true});
  } catch(err){
    return resp({ok:false, erro:String(err.message || err)});
  } finally {
    try { lock.releaseLock(); } catch(x){}
  }
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
function aba(n){
  if(ABAS.indexOf(n) < 0) throw new Error("Lista inválida.");
  var sh = ss().getSheetByName(n);
  if(!sh) throw new Error("Não encontrei a aba " + n + " na planilha.");
  return sh;
}
/* Garante que a linha ainda é a mesma que a pessoa viu (ninguém mexeu antes). */
function conferir(sh, ln, exp){
  if(!(ln >= 1)) throw new Error("Linha inválida.");
  if(!exp) return;
  var v = String(sh.getRange(ln, exp.col + 1).getDisplayValue()).trim();
  if(v !== String(exp.val).trim()) throw new Error("A lista foi alterada por outra pessoa. Atualize a página e tente de novo.");
}
/* Grava só as células enviadas (não pisa em fórmulas das outras colunas). */
function escrever(sh, ln, cel){
  for(var k in cel){
    var c = sh.getRange(ln, Number(k) + 1), v = String(cel[k]);
    if(DATA.test(v) && !/^pt/i.test(ss().getSpreadsheetLocale())) c.setNumberFormat("@");   /* planilha em português: o Google entende a data; senão grava como texto */
    c.setValue(v);
  }
}
/* Novo navio entra logo depois da última linha que tem data (antes de notas no rodapé). */
function inserir(sh, cel){
  var n = sh.getLastRow(), last = 3, col = n ? sh.getRange(1, 1, n, 1).getDisplayValues() : [];
  for(var i = 0; i < col.length; i++) if(DATA.test(String(col[i][0]).trim())) last = i + 1;
  var f = sh.getRange(last, 1, 1, sh.getLastColumn()).getFormulasR1C1()[0];
  sh.insertRowAfter(last);
  f.forEach(function(x, i){ if(x) sh.getRange(last + 1, i + 1).setFormulaR1C1(x); });   /* mantém as fórmulas, como o Saldo */
  escrever(sh, last + 1, cel);
}
function registrar(quem, b){
  var sh = ss().getSheetByName("REGISTRO") || ss().insertSheet("REGISTRO");
  if(!sh.getLastRow()) sh.appendRow(["Data", "Quem", "Ação", "Navio", "Lista"]);
  var agora = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm");
  var acao = {add:"adicionou", update:"editou", "delete":"excluiu", move:"moveu"}[b.acao];
  sh.appendRow([agora, quem, acao, b.navio || "", b.aba + (b.destino ? " → " + b.destino : "")]);
  PropertiesService.getScriptProperties().setProperty("ULTIMA", agora);
}
