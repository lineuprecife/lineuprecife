/* Modo edição do Line-up: cada pessoa entra com o seu login e senha e só mexe nas etapas pelas quais é responsável.
   Etapas: previsão (agendamento), ao largo, atracação, movimentação e desatracação. O servidor (Apps Script) confere tudo de novo.
   Este arquivo carrega ANTES do app.js; tudo aqui só roda depois que a página abre. */
var EDIT = {on:false, token:"", usuario:"", nome:"", cargo:"", etapas:[], admin:false}, AVISO = "";
var SITS = [["previstos","Previsto","Previsto (ainda não chegou)"],["fundeados","Fundeado","Fundeado (esperando no mar)"],["atracados","Atracado","Atracado (no berço)"],["desatracados","Desatracado","Desatracado (já saiu)"]];
var SIT_ETAPA = {previstos:"previsao", fundeados:"fundeio", atracados:"atracacao", desatracados:"desatracacao"};
var ETAPA_NOME = {previsao:"Previsão", fundeio:"Ao largo", atracacao:"Atracação", movimentacao:"Movimentação", desatracacao:"Desatracação"};
/* Quais campos cada etapa pode alterar (igual ao que o servidor aplica) */
var G_IDENT = ["navio","nacionalidade","imo","cbo","comprimento","calado","agencia","operador","carga","operacao","origem_destino","porto_anterior","proximo_porto","ton_prevista","nr_livro","observacoes"];
var G_DATAS = ["chegada","previsao_atracacao","saida","cais"];
var G_MANOBRA = ["hora_pratico","hora_amarracao","inicio_manobra","termino_manobra","bordo","calado_proa","calado_popa","cabecos","pratico","rebocadores"];
var CAMPOS_ETAPA = {previsao:G_IDENT.concat(G_DATAS), fundeio:G_IDENT.concat(G_DATAS), atracacao:G_IDENT.concat(G_DATAS, G_MANOBRA, ["ton_movimentada"]), movimentacao:["ton_movimentada","observacoes"], desatracacao:["saida","ton_movimentada","observacoes"]};
/* Formulário em blocos, na ordem dos formulários de papel (previsão, livro de registro, manobra de acostagem) */
var SECOES = [
  ["Embarcação", [{k:"navio",l:"Nome da embarcação",w:1},{k:"nacionalidade",l:"Bandeira / porto de matrícula"},{k:"nr_livro",l:"Nº no livro de registro"},{k:"cbo",l:"CBO"},{k:"imo",l:"IMO"},{k:"comprimento",l:"Comprimento (m)",t:"dec"},{k:"calado",l:"Calado máximo (m)",t:"dec"}]],
  ["Carga e operação", [{k:"operacao",l:"Operação / modalidade",t:"op"},{k:"carga",l:"Carga (ou serviço)"},{k:"origem_destino",l:"Origem / destino da carga"},{k:"agencia",l:"Agência"},{k:"operador",l:"Operador"},{k:"porto_anterior",l:"Porto anterior"},{k:"proximo_porto",l:"Próximo porto"},{k:"ton_prevista",l:"Toneladas previstas",t:"num"}]],
  ["Datas e berço", [{k:"chegada",l:"Chegada",t:"dt"},{k:"previsao_atracacao",l:"Previsão de atracação (POB)",t:"dt"},{k:"saida",l:"Saída",t:"dt"},{k:"cais",l:"Berço",t:"cais"}]],
  ["Manobra de atracação (coordenadores de operação)", [{k:"hora_pratico",l:"Prático (hora)",t:"hm"},{k:"hora_amarracao",l:"Amarração (hora)",t:"hm"},{k:"inicio_manobra",l:"Início da manobra",t:"hm"},{k:"termino_manobra",l:"Término da manobra",t:"hm"},{k:"bordo",l:"Bordo de atracação",t:"bordo"},{k:"pratico",l:"Prático (nome)"},{k:"calado_proa",l:"Calado proa (m)",t:"dec"},{k:"calado_popa",l:"Calado popa (m)",t:"dec"},{k:"cabecos",l:"Cabeços de amarração (ex.: 47, 50, 53, 57)",w:1},{k:"rebocadores",l:"Rebocadores",w:1}]],
  ["Movimentação", [{k:"ton_movimentada",l:"Toneladas já movimentadas",t:"num"}]],
  ["Observações", [{k:"observacoes",l:"Observações",t:"ta",w:1}]]
];
var FIELDS = []; SECOES.forEach(function(s){ s[1].forEach(function(f){ FIELDS.push(f); }); });
/* Alguns campos mudam de nome conforme a situação escolhida */
function rotulo(k, sit, padrao){
  if(k === "chegada") return {previstos:"Previsão de chegada", fundeados:"Chegada confirmada (fundeio)", atracados:"Data e hora da atracação", desatracados:"Data e hora da atracação"}[sit] || padrao;
  if(k === "saida") return sit === "desatracados" ? "Data e hora da saída (desatracação)" : "Previsão de saída";
  if(k === "cais") return (sit === "previstos" || sit === "fundeados") ? "Berço previsto" : sit === "atracados" ? "Berço atracado" : "Berço";
  if(k === "ton_movimentada") return sit === "desatracados" ? "Tonelagem final (t)" : "Toneladas já movimentadas";
  return padrao;
}

function E(id){ return document.getElementById(id); }
function toast(t, bad){
  var el = E("toast");
  if(!el){ el = document.createElement("div"); el.id = "toast"; el.setAttribute("role","status"); document.body.appendChild(el); }
  el.textContent = t; el.className = bad ? "bad" : ""; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(function(){ el.hidden = true; }, 4000);
}
function say(id, t, bad){ var m = E(id); if(!m) return; m.textContent = t; m.className = "msg" + (bad ? " bad" : ""); }
function post(b){
  b.token = EDIT.token;
  return fetch(CONFIG.api, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(b)})
    .then(function(r){ return r.json(); }, function(){ throw new Error("Sem conexão. Tente de novo."); })
    .then(function(j){
      if(!j.ok){
        if(j.codigo === "sessao" && EDIT.on){ sair(true); toast("Sua sessão expirou. Entre de novo.", true); }
        throw new Error(j.erro || "Não deu certo.");
      }
      return j;
    });
}
function dtIn(s){ var m = /^(\d\d)\/(\d\d)\/(\d{4})(?: (\d\d):(\d\d))?/.exec(s||""); return m ? m[3]+"-"+m[2]+"-"+m[1]+"T"+(m[4]||"00")+":"+(m[5]||"00") : ""; }
function dtOut(v){ var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v||""); return m ? m[3]+"/"+m[2]+"/"+m[1]+" "+m[4]+":"+m[5] : ""; }
function dlg(html, larga){
  var d = document.createElement("dialog");
  if(larga) d.className = "wide";
  d.innerHTML = html; document.body.appendChild(d);
  d.addEventListener("close", function(){ d.remove(); });
  d.addEventListener("click", function(e){ if(e.target.hasAttribute("data-x")) d.close(); });
  d.showModal(); return d;
}

/* ---- Quem pode o quê (a tela só espelha; quem decide é o servidor) ---- */
function tem(e){ return EDIT.etapas.indexOf(e) >= 0; }
function sitKey(s){ var x = SITS.filter(function(y){ return y[1] === s.rec.situacao; })[0]; return x ? x[0] : ""; }
function permCampos(atual, nova){   /* null = não pode */
  if(EDIT.admin) return {todos:true};
  var set = {}, add = function(e){ CAMPOS_ETAPA[e].forEach(function(k){ set[k] = 1; }); }, eN = SIT_ETAPA[nova];
  if(!atual || atual !== nova){
    if(!tem(eN)) return null;
    add(eN); if(atual && tem(SIT_ETAPA[atual])) add(SIT_ETAPA[atual]);
  } else {
    if(tem(eN)) add(eN);
    if(nova === "atracados" && tem("movimentacao")) add("movimentacao");
    if(!Object.keys(set).length) return null;
  }
  return {set:set};
}
function podeEditar(s){ return !!permCampos(sitKey(s), sitKey(s)); }
function podeExcluir(){ return EDIT.admin; }
function sitsCriar(){ return SITS.filter(function(x){ return EDIT.admin || tem(SIT_ETAPA[x[0]]); }); }
function podeAviso(){ return EDIT.admin || tem("previsao") || tem("atracacao"); }

/* ---- Leitura: uma requisição traz todos os navios; a situação decide em qual lista cada um aparece ---- */
function toItem(r){
  var n = function(x){ return x === "" || x == null ? 0 : Number(x) || 0; };
  var m = function(x){ return x === "" || x == null ? "" : Number(x).toFixed(2).replace(".", ",") + " m"; };
  var s = {id:r.id, rec:r, chegada:r.chegada||"", saida:r.saida||"", atracacao:r.previsao_atracacao||"", cais:(r.cais === "" || r.cais == null) ? "" : String(r.cais), navio:String(r.navio||""),
    cbo:r.cbo||"", imo:r.imo||"", comp:m(r.comprimento), calado:m(r.calado), agencia:r.agencia||"", operador:r.operador||"",
    carga:r.carga||"", mod:String(r.operacao||"").toUpperCase(), origem:r.origem_destino||"", anterior:r.porto_anterior||"", proximo:r.proximo_porto||"",
    prev:n(r.ton_prevista), mov:n(r.ton_movimentada), tipo:""};
  s.modRaw = s.mod;
  if(s.mod !== "IMPORTAÇÃO" && s.mod !== "EXPORTAÇÃO" && !s.prev){ var t2 = s.mod || s.carga; if(t2){ s.tipo = cap(t2); s.mod = ""; } }
  return s;
}
function ord(id, a, b){
  var da = parseDate(a.chegada), db = parseDate(b.chegada); da = da ? +da : 0; db = db ? +db : 0;
  if(id === "atracados") return (parseInt(a.cais,10)||99) - (parseInt(b.cais,10)||99) || da - db;
  if(id === "desatracados"){ var sa = parseDate(a.saida), sb = parseDate(b.saida); return (sb ? +sb : 0) - (sa ? +sa : 0); }
  return da - db;
}
function lerPublico(){
  return fetch(CONFIG.api, {cache:"no-store"}).then(function(r){ return r.json(); }).then(function(j){ if(j.ok === false) throw new Error(j.erro); return j; });
}
function refreshApi(){
  /* quem está logado recebe também os campos internos (observações, prático, rebocadores...); o público recebe só o essencial */
  var ler = EDIT.on ? post({acao:"lista"}).catch(function(e){ if(!EDIT.on) return lerPublico(); throw e; }) : lerPublico();
  return ler.then(function(j){
    AVISO = j.aviso || ""; RESP = j.responsavel && j.responsavel.nome ? j.responsavel : null;
    var by = {previstos:[], fundeados:[], atracados:[], desatracados:[]}, lim = Date.now() - (CONFIG.diasDesatracados || 7) * 864e5;
    (j.navios || []).forEach(function(r){
      var sit = SITS.filter(function(x){ return x[1] === r.situacao; })[0]; if(!sit) return;
      var s = toItem(r), d = parseDate(s.saida || s.chegada);
      if(sit[0] === "desatracados" && d && +d < lim) return;   /* histórico antigo fica no banco, mas some da página */
      by[sit[0]].push(s);
    });
    TABS.forEach(function(t){
      by[t.id].sort(function(a, b){ return ord(t.id, a, b); });
      data[t.id] = {items:by[t.id], aviso:AVISO, atualizado:j.atualizado || ""}; errors[t.id] = false;
    });
    var d = new Date(); lastOk = p2(d.getHours())+":"+p2(d.getMinutes());
  }).catch(function(){ TABS.forEach(function(t){ errors[t.id] = true; }); }).then(renderAll);
}
function findItem(id){
  for(var i = 0; i < TABS.length; i++){ var s = listOf(TABS[i].id).filter(function(x){ return x.id === id; })[0]; if(s) return s; }
}

/* ---- Botões nas linhas quando o modo edição está ligado (só aparecem os que a pessoa pode usar) ---- */
function botoes(s){
  var h = "";
  if(podeEditar(s)) h += '<button class="btn" type="button" data-ed="'+esc(s.id)+'">✏️ Editar</button>';
  if(podeExcluir()) h += '<button class="btn dng" type="button" data-del="'+esc(s.id)+'">Excluir</button>';
  return h;
}
function row(s, lista){
  var h = rowBase(s, lista);
  if(!EDIT.on) return h;
  var b = botoes(s); if(!b) return h;
  return h.replace(/<\/div>$/, '<div class="acts">'+b+'</div></div>');
}
function setMode(){
  E("editbar").hidden = !EDIT.on; E("btn-login").hidden = EDIT.on;
  var et = EDIT.admin ? "Administrador" : EDIT.etapas.map(function(e){ return ETAPA_NOME[e]; }).join(", ");
  E("who").textContent = EDIT.on ? EDIT.nome + (EDIT.cargo ? " · " + EDIT.cargo : "") + " — " + (et || "sem etapa") : "";
  E("btn-new").hidden = !sitsCriar().length; E("btn-aviso").hidden = !podeAviso();
  renderPanel();
}
function entrou(j){
  EDIT.on = true; EDIT.token = j.token || EDIT.token; EDIT.usuario = j.usuario; EDIT.nome = j.nome; EDIT.cargo = j.cargo || ""; EDIT.etapas = j.etapas || []; EDIT.admin = !!j.admin;
  try{ sessionStorage.setItem("lu_t", EDIT.token); }catch(x){}
  setMode(); refresh();
}
function sair(silencioso){
  if(EDIT.token && !silencioso) post({acao:"sair"}).catch(function(){});
  EDIT = {on:false, token:"", usuario:"", nome:"", cargo:"", etapas:[], admin:false};
  try{ sessionStorage.removeItem("lu_t"); }catch(x){}
  setMode(); refresh();
}

function openLogin(){
  var d = dlg('<h2>Entrar para editar</h2><p>Use o seu login e a sua senha.</p><div class="fg one"><label class="w"><span>Usuário</span><input id="lu" autocomplete="username" autocapitalize="none" spellcheck="false"></label><label class="w"><span>Senha</span><input type="password" id="pw" autocomplete="current-password"></label></div><div class="msg" id="lmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="lgo" type="button">Entrar</button></div>');
  function go(){
    var u = E("lu").value.trim(), pw = E("pw").value; if(!u || !pw){ say("lmsg", "Escreva o usuário e a senha.", true); return; }
    E("lgo").disabled = true; say("lmsg", "Verificando…"); EDIT.token = "";
    post({acao:"login", usuario:u, senha:pw}).then(function(j){ d.close(); entrou(j); toast("Olá, " + j.nome + "!"); },
      function(e){ E("lgo").disabled = false; say("lmsg", e.message, true); });
  }
  E("lgo").onclick = go;
  E("pw").onkeydown = E("lu").onkeydown = function(e){ if(e.key === "Enter") go(); };
  E("lu").focus();
}
function openSenha(){
  var d = dlg('<h2>Minha senha</h2><div class="fg one"><label class="w"><span>Senha atual</span><input type="password" id="s0" autocomplete="current-password"></label><label class="w"><span>Nova senha (mínimo 6 caracteres)</span><input type="password" id="s1" autocomplete="new-password"></label><label class="w"><span>Repita a nova senha</span><input type="password" id="s2" autocomplete="new-password"></label></div><div class="msg" id="smsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="sgo" type="button">Trocar senha</button></div>');
  E("sgo").onclick = function(){
    if(E("s1").value !== E("s2").value){ say("smsg", "As duas senhas novas não são iguais.", true); return; }
    E("sgo").disabled = true; say("smsg", "Salvando…");
    post({acao:"senha", atual:E("s0").value, nova:E("s1").value}).then(function(){ d.close(); toast("Senha alterada."); },
      function(e){ E("sgo").disabled = false; say("smsg", e.message, true); });
  };
}

function campoHtml(f, v, rec){
  var c;
  if(f.t === "dec") v = v.replace(".", ",");
  if(f.t === "dt") c = '<input type="datetime-local" id="f_'+f.k+'" value="'+dtIn(v)+'">';
  else if(f.t === "hm") c = '<input type="time" id="f_'+f.k+'" value="'+esc(v)+'">';
  else if(f.t === "ta") c = '<textarea id="f_'+f.k+'" rows="3">'+esc(v)+'</textarea>';
  else if(f.t === "bordo"){
    var ob = ["", "Boreste", "Bombordo"]; if(v && ob.indexOf(v) < 0) ob.push(v);
    c = '<select id="f_bordo">'+ob.map(function(x){ return '<option value="'+esc(x)+'"'+(x===v?" selected":"")+'>'+(x ? esc(x) : "—")+'</option>'; }).join("")+'</select>';
  } else if(f.t === "cais"){
    var o = ["", "00-TA"]; for(var i=1;i<=9;i++) o.push(String(i)); o.push("MARINA"); if(v && o.indexOf(v)<0) o.push(v);
    c = '<select id="f_cais">'+o.map(function(x){ return '<option value="'+esc(x)+'"'+(x===v?" selected":"")+'>'+(x ? ((isNaN(x) && x !== "00-TA") ? esc(x) : "Berço "+esc(x)) : "Sem berço")+'</option>'; }).join("")+'</select>';
  } else if(f.t === "op"){
    c = '<input id="f_operacao" list="dl_op" placeholder="escolha ou escreva" value="'+esc(v)+'"><datalist id="dl_op">'+["IMPORTAÇÃO","EXPORTAÇÃO","DRAGAGEM","ABASTECIMENTO","OP. MILITAR","PESQUISA","REPARO"].map(function(x){ return '<option value="'+x+'">'; }).join("")+'</datalist>';
  } else c = '<input id="f_'+f.k+'"'+(f.t==="num"?' inputmode="numeric"':f.t==="dec"?' inputmode="decimal"':"")+' value="'+esc(v)+'">';
  return '<label'+(f.w?' class="w"':"")+'><span id="l_'+f.k+'">'+f.l+'</span>'+c+'</label>';
}
function openForm(s){
  var rec = s ? s.rec : {}, atual = s ? sitKey(s) : "", opcoes = sitsCriar();
  if(s && !opcoes.some(function(x){ return x[0] === atual; })) opcoes = SITS.filter(function(x){ return x[0] === atual; }).concat(opcoes);
  var ini = s ? atual : (opcoes.some(function(x){ return x[0] === state.tab; }) ? state.tab : opcoes[0][0]);
  var html = '<h2>'+(s ? "Editar embarcação" : "Nova embarcação")+'</h2><div class="fg"><label class="w"><span>Situação (para mover a embarcação de lista, mude aqui)</span><select id="f_sit"'+(opcoes.length < 2 ? " disabled" : "")+'>'+
    opcoes.map(function(x){ return '<option value="'+x[0]+'"'+(x[0]===ini?" selected":"")+'>'+x[2]+'</option>'; }).join("")+'</select></label></div><p class="nota" id="nota"></p>';
  SECOES.forEach(function(sec){
    html += '<fieldset class="sec"><legend>'+sec[0]+'</legend><div class="fg">'+sec[1].map(function(f){ return campoHtml(f, rec[f.k] == null ? "" : String(rec[f.k]), rec); }).join("")+'</div></fieldset>';
  });
  html += '<div class="msg" id="fmsg"></div><div class="btns">'+(s ? '<button class="btn ghost" id="fhist" type="button">Histórico</button><span class="sp"></span>' : "")+'<button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="fgo" type="button">Salvar</button></div>';
  var d = dlg(html, true);
  function aplicar(){   /* nomes dos campos e quais ficam liberados para esta pessoa, conforme a situação escolhida */
    var nova = E("f_sit").value, perm = permCampos(atual, nova), bloq = 0;
    FIELDS.forEach(function(f){
      E("l_"+f.k).textContent = rotulo(f.k, nova, f.l);
      var off = !perm || (!perm.todos && !perm.set[f.k]); E("f_"+f.k).disabled = off; if(off) bloq++;
    });
    E("nota").textContent = bloq ? "Campos em cinza pertencem a outra etapa e não podem ser alterados por você." : "";
    E("fgo").disabled = !perm;
  }
  E("f_sit").onchange = aplicar; aplicar();
  if(s) E("fhist").onclick = function(){ openHist(s); };
  E("fgo").onclick = function(){
    var sit = SITS.filter(function(x){ return x[0] === E("f_sit").value; })[0], reg = {id:s ? s.id : "", situacao:sit[1], versao:s ? rec.atualizado_em : undefined}, bad = "";
    FIELDS.forEach(function(f){
      var el = E("f_"+f.k); if(el.disabled) return;   /* só envia o que a pessoa pode alterar */
      var x = el.value.trim();
      reg[f.k] = f.t === "dt" ? dtOut(x) : f.t === "num" ? x.replace(/\D/g, "") : x;
    });
    var val = function(k){ return Object.prototype.hasOwnProperty.call(reg, k) ? reg[k] : (rec[k] == null ? "" : String(rec[k])); };
    if(!s || sit[0] !== atual){
      if(!val("navio")) bad = "Escreva o nome da embarcação.";
      else if(!val("chegada") && !(sit[0] === "desatracados" && val("saida"))) bad = "Informe a data e a hora (previsão de chegada, chegada ou atracação).";
      else if(sit[0] === "atracados" && !val("cais")) bad = "Escolha o berço onde a embarcação está atracada.";
    } else if(E("f_navio") && !E("f_navio").disabled && !reg.navio) bad = "Escreva o nome da embarcação.";
    if(bad){ say("fmsg", bad, true); return; }
    E("fgo").disabled = true; say("fmsg", "Salvando…");
    post({acao:"salvar", registro:reg}).then(function(){ d.close(); state.tab = sit[0]; toast("Salvo."); refresh(); },
      function(e){ E("fgo").disabled = false; say("fmsg", e.message, true); });
  };
}
function openHist(s){
  var d = dlg('<h2>Histórico</h2><p><b>'+esc(s.navio)+'</b></p><div id="hl" class="hist">Carregando…</div><div class="btns"><button class="btn" data-x type="button">Fechar</button></div>');
  post({acao:"historico", id:s.id}).then(function(j){
    E("hl").innerHTML = j.itens.length ? j.itens.map(function(i){ return '<div class="hi"><b>'+esc(i.em)+'</b> · '+esc(i.usuario)+' · '+esc(i.acao)+(i.resumo ? '<br><span>'+esc(i.resumo)+'</span>' : "")+'</div>'; }).join("") : "Nenhum registro ainda.";
  }, function(e){ E("hl").textContent = e.message; });
}

function askDel(s){
  var d = dlg('<h2>Excluir embarcação?</h2><p><b>'+esc(s.navio)+'</b> será removida do banco. Não dá para desfazer. (Para só tirar da lista, mude a situação para "Desatracado".)</p><div class="msg" id="dmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn dng" id="dgo" type="button">Excluir</button></div>');
  E("dgo").onclick = function(){
    E("dgo").disabled = true; say("dmsg", "Excluindo…");
    post({acao:"excluir", id:s.id, versao:s.rec.atualizado_em, navio:s.navio})
      .then(function(){ d.close(); toast("Embarcação excluída."); refresh(); }, function(e){ E("dgo").disabled = false; say("dmsg", e.message, true); });
  };
}

function openAviso(){
  var d = dlg('<h2>Aviso no topo da página</h2><p>Aparece em faixa amarela para quem abrir a página. Deixe vazio para tirar.</p><textarea id="atx" aria-label="Aviso">'+esc(AVISO)+'</textarea><div class="msg" id="amsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="ago" type="button">Salvar aviso</button></div>');
  E("ago").onclick = function(){
    E("ago").disabled = true; say("amsg", "Salvando…");
    post({acao:"aviso", texto:E("atx").value}).then(function(){ d.close(); toast("Aviso atualizado."); refresh(); },
      function(e){ E("ago").disabled = false; say("amsg", e.message, true); });
  };
}

window.addEventListener("load", function(){
  if(!CONFIG.api) return;
  E("btn-login").hidden = false;
  E("btn-login").onclick = openLogin;
  E("btn-new").onclick = function(){ openForm(); };
  E("btn-aviso").onclick = openAviso;
  E("btn-pw").onclick = openSenha;
  E("btn-out").onclick = function(){ sair(); };
  E("panel").addEventListener("click", function(e){
    var b = e.target.closest("[data-ed],[data-del]"); if(!b) return;
    var s = findItem(b.getAttribute("data-ed") || b.getAttribute("data-del")); if(!s) return;
    if(b.hasAttribute("data-ed")) openForm(s); else askDel(s);
  });
  var tk; try{ tk = sessionStorage.getItem("lu_t"); }catch(x){}
  if(tk){ EDIT.token = tk; post({acao:"sessao"}).then(function(j){ entrou(j); }, function(){ EDIT.token = ""; try{ sessionStorage.removeItem("lu_t"); }catch(x){} }); }
});
