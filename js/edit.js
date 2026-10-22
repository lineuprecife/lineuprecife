/* Modo edição do Line-up. Cada pessoa entra com o seu login e senha e só mexe nas etapas pelas quais é responsável.
   CICLO DA EMBARCAÇÃO:  Rascunho (só a acostagem vê)  >  Previsto (publicado no MEP)  >  Fundeado  >  Atracado  >  Desatracado
   Cada etapa tem a sua janelinha, só com o que aquela etapa precisa. O botão azul do cartão é sempre "o próximo passo".
   O servidor (Apps Script) confere tudo de novo. Este arquivo carrega ANTES do app.js; tudo aqui só roda depois que a página abre. */
var EDIT = {on:false, token:"", usuario:"", nome:"", cargo:"", etapas:[], admin:false}, AVISO = "";
var SITS = [["rascunhos","Rascunho","Rascunho (ainda não publicado)"],["previstos","Previsto","Previsto (publicado no MEP)"],["fundeados","Fundeado","Fundeado (esperando no mar)"],["atracados","Atracado","Atracado (no berço)"],["desatracados","Desatracado","Desatracado (já saiu)"]];
var SIT_ETAPA = {rascunhos:"previsao", previstos:"previsao", fundeados:"fundeio", atracados:"atracacao", desatracados:"desatracacao"};
var ORDEM = {rascunhos:0, previstos:1, fundeados:2, atracados:3, desatracados:4};
var PASSOS = [["rascunhos","Rascunho"],["previstos","Previsto"],["fundeados","Fundeado"],["atracados","Atracado"],["desatracados","Desatrac."]];
var ETAPA_NOME = {previsao:"Previsão", fundeio:"Ao largo", atracacao:"Atracação", movimentacao:"Movimentação", desatracacao:"Desatracação"};
/* Quais campos cada etapa pode alterar (igual ao que o servidor aplica) */
var G_IDENT = ["navio","nacionalidade","imo","comprimento","calado","agencia","operador","carga","operacao","origem_destino","porto_anterior","proximo_porto","ton_prevista","observacoes"];
var G_REGISTRO = ["cbo","nr_livro"];
var G_DATAS = ["chegada","previsao_atracacao","saida","cais"];
var G_MANOBRA = ["hora_pratico","hora_amarracao","inicio_manobra","termino_manobra","bordo","calado_proa","calado_popa","cabecos","pratico","rebocadores"];
var G_DMANOBRA = ["d_hora_pratico","d_hora_amarracao","d_inicio_manobra","d_termino_manobra","d_bordo","d_calado_proa","d_calado_popa","d_cabecos","d_pratico","d_rebocadores"];
var CAMPOS_ETAPA = {previsao:G_IDENT.concat(G_DATAS), fundeio:G_IDENT.concat(G_DATAS), atracacao:G_IDENT.concat(G_REGISTRO, G_DATAS, G_MANOBRA, G_DMANOBRA, ["ton_movimentada"]), movimentacao:["ton_movimentada","observacoes"], desatracacao:["saida","ton_movimentada","observacoes"].concat(G_DMANOBRA)};
var OPS_SERV = ["DRAGAGEM","ABASTECIMENTO","OP. MILITAR","PESQUISA","REPARO"];
var SUG_CAMPOS = ["navio","nacionalidade","agencia","operador","carga","origem_destino","porto_anterior","proximo_porto","pratico","rebocadores"], SUG_CACHE = null;

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
function agoraDt(){ var d = new Date(); return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate())+"T"+p2(d.getHours())+":"+p2(d.getMinutes()); }
function agoraHm(){ var d = new Date(); return p2(d.getHours())+":"+p2(d.getMinutes()); }
function hmMin(v){ var m = /^(\d\d):(\d\d)$/.exec(v||""); return m ? (+m[1])*60 + (+m[2]) : null; }
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
    if(atual && ORDEM[nova] < ORDEM[atual] && !(atual === "previstos" && nova === "rascunhos")) return null;   /* voltar de etapa: só administrador (ou despublicar um previsto) */
    add(eN); if(atual && tem(SIT_ETAPA[atual])) add(SIT_ETAPA[atual]);
  } else {
    if(tem(eN)) add(eN);
    if(nova === "atracados" && tem("movimentacao")) add("movimentacao");
    if(nova === "desatracados" && tem("atracacao")) add("atracacao");
    if(!Object.keys(set).length) return null;
  }
  return {set:set};
}
function pode(atual, nova, campo){ var p = permCampos(atual, nova); return !!p && (p.todos || !!p.set[campo]); }
function podeEditar(s){ return !!permCampos(sitKey(s), sitKey(s)); }
function podeExcluir(s){ return EDIT.admin || (sitKey(s) === "rascunhos" && tem("previsao")); }
function podeCriar(sit){ return EDIT.admin || tem(SIT_ETAPA[sit]); }
function podeAviso(){ return EDIT.admin || tem("previsao") || tem("atracacao"); }
function verRascunhos(){ return EDIT.on && (EDIT.admin || tem("previsao")); }

/* ---- Regras de negócio usadas para ajudar e evitar erro ---- */
function comCarga(op){ var t = normH(op); return t === "importacao" || t === "exportacao"; }
function ehServico(op){ return !!String(op||"").trim() && !comCarga(op); }
function faltaPublicar(r){
  var f = [];
  if(!r.navio) f.push("nome"); if(!r.agencia) f.push("agência"); if(!r.operacao) f.push("operação");
  if(!r.chegada) f.push("chegada (ETA)"); if(!r.cais) f.push("berço");
  if(comCarga(r.operacao)){ if(!r.carga) f.push("carga"); if(!(+r.ton_prevista)) f.push("toneladas"); }
  return f;
}
function faltaManobra(r, p){
  var f = [];
  if(!r[p+"bordo"]) f.push("bordo"); if(!r[p+"hora_pratico"]) f.push("hora do prático"); if(!r[p+"hora_amarracao"]) f.push(p ? "largada do último cabo" : "amarração");
  return f;
}
function todosRegistros(){
  if(SUG_CACHE) return SUG_CACHE;
  var o = []; TABS.forEach(function(t){ listOf(t.id).forEach(function(s){ o.push(s.rec); }); }); return o;
}
function proximoCbo(){
  var yy = new Date().getFullYear() % 100, max = 0;
  todosRegistros().forEach(function(r){ var m = /^(\d{4})\/(\d{2})$/.exec(String(r.cbo||"").trim()); if(m && +m[2] === yy && +m[1] > max) max = +m[1]; });
  return ("000" + (max + 1)).slice(-4) + "/" + p2(yy);
}
function achaNavio(nome, imo){   /* a escala mais recente desse navio no banco (para preencher os dados fixos dele) */
  var n = normH(nome), best = null, bd = -1;
  todosRegistros().forEach(function(r){
    if(!((n && normH(r.navio) === n) || (imo && String(r.imo||"") === imo))) return;
    var d = parseDate(r.saida || r.chegada), t = d ? +d : 0;
    if(!best || t >= bd){ best = r; bd = t; }
  });
  return best;
}
function emAndamento(nome, imo, idSelf){   /* mesma embarcação já ativa em outro registro */
  var n = normH(nome), hit = null;
  TABS.forEach(function(t){ if(t.id === "desatracados") return; listOf(t.id).forEach(function(s){
    if(s.id === idSelf || hit) return;
    if((n && normH(s.navio) === n) || (imo && String(s.imo||"") === imo)) hit = s;
  }); });
  return hit;
}
function ocupacao(idSelf){
  var m = {}; listOf("atracados").forEach(function(s){ if(s.id === idSelf || ehCB(s.cais)) return; caisKeys(s.cais).forEach(function(k){ (m[k] = m[k] || []).push(s.navio); }); });
  return m;
}
function imoOk(v){ if(!/^\d{7}$/.test(v)) return true; var s = 0; for(var i = 0; i < 6; i++) s += (+v[i]) * (7 - i); return s % 10 === +v[6]; }
function ordemHoras(vals){   /* cada passo da manobra deve vir pouco depois do anterior (a manobra pode virar a meia-noite) */
  var prev = null, ok = true;
  vals.forEach(function(v){ var m = hmMin(v); if(m == null) return; if(prev != null && (m - prev + 1440) % 1440 > 360) ok = false; prev = m; });
  return ok;
}

/* ---- Sugestões: todo campo de texto sugere o que já existe no banco (aparece ao digitar) ---- */
function montarSug(regs){
  var m = {};
  SUG_CAMPOS.forEach(function(k){ m[k] = {}; });
  regs.forEach(function(r){ SUG_CAMPOS.forEach(function(k){
    var v = String(r[k] == null ? "" : r[k]).trim(); if(!v) return;
    (k === "carga" ? cargaParse(v).map(function(x){ return x.p; }) : [v]).forEach(function(v1){
      var c = v1.toLowerCase(), o = m[k][c] || (m[k][c] = {v:v1, n:0}); o.n++;
    });
  }); });
  return m;
}
function pintarSug(m){
  SUG_CAMPOS.forEach(function(k){
    var dl = E("dl_"+k); if(!dl) return;
    var arr = Object.keys(m[k]).map(function(c){ return m[k][c]; });
    arr.sort(function(a, b){ return b.n - a.n || a.v.localeCompare(b.v, "pt-BR"); });
    dl.innerHTML = arr.slice(0, 400).map(function(o){ return '<option value="'+esc(o.v)+'">'; }).join("");
  });
  var ds = E("dl_servico");
  if(ds){
    var ex = {}; OPS_SERV.forEach(function(x){ ex[x] = 1; });
    todosRegistros().forEach(function(r){ var o = String(r.operacao||"").trim().toUpperCase(); if(o && !comCarga(o)) ex[o] = 1; });
    ds.innerHTML = Object.keys(ex).sort().map(function(x){ return '<option value="'+esc(x)+'">'; }).join("");
  }
}
function carregarSug(){
  pintarSug(montarSug(todosRegistros()));          /* já mostra o que a página tem na tela */
  if(SUG_CACHE) return;
  post({acao:"lista", dias:3650}).then(function(j){     /* depois completa com o banco inteiro, inclusive o histórico antigo */
    SUG_CACHE = j.navios || []; pintarSug(montarSug(SUG_CACHE));
    setTimeout(function(){ SUG_CACHE = null; }, 120000);
  }, function(){});
}

/* ---- Leitura: uma requisição traz todos os navios; a situação decide em qual lista cada um aparece ---- */
function toItem(r){
  var n = function(x){ return x === "" || x == null ? 0 : Number(x) || 0; };
  var m = function(x){ return x === "" || x == null ? "" : Number(x).toFixed(2).replace(".", ",") + " m"; };
  var s = {id:r.id, rec:r, chegada:r.chegada||"", saida:r.saida||"", atracacao:r.previsao_atracacao||"", cais:(r.cais === "" || r.cais == null) ? "" : String(r.cais), navio:String(r.navio||""), nacionalidade:String(r.nacionalidade||""), navegacao:(navegacaoDe(r.nacionalidade)||{}).sigla||"",
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
  return fetch(CONFIG.api + (CONFIG.api.indexOf("?") < 0 ? "?" : "&") + "dias=" + (CONFIG.diasDesatracados || 7), {cache:"no-store"}).then(function(r){ return r.json(); }).then(function(j){ if(j.ok === false) throw new Error(j.erro); return j; });
}
function refreshApi(){
  /* quem está logado recebe também os campos internos (observações, prático, rebocadores...) e os rascunhos; o público recebe só o essencial */
  var ler = EDIT.on ? post({acao:"lista", dias:CONFIG.diasDesatracados || 7}).catch(function(e){ if(!EDIT.on) return lerPublico(); throw e; }) : lerPublico();
  return ler.then(function(j){
    AVISO = j.aviso || ""; RESP = j.responsavel && j.responsavel.nome ? j.responsavel : null;
    var by = {rascunhos:[], previstos:[], fundeados:[], atracados:[], desatracados:[]}, lim = Date.now() - (CONFIG.diasDesatracados || 7) * 864e5;
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

/* ---- Botões nos cartões: o azul é sempre o PRÓXIMO PASSO daquela embarcação (só aparece o que a pessoa pode fazer) ---- */
function botoes(s){
  var k = sitKey(s), h = "";
  function b(act, rot, cls){ return '<button class="btn'+(cls ? " "+cls : "")+'" type="button" data-act="'+act+'" data-id="'+esc(s.id)+'">'+rot+'</button>'; }
  var mover = function(dest){ return !!permCampos(k, dest); };
  if(k === "rascunhos" && mover("previstos")) h += b("editar", "Revisar e publicar", "pri");
  if(k === "previstos"){ if(mover("fundeados")) h += b("fundear", "Confirmar chegada", "pri"); if(mover("atracados")) h += b("atracar", "Já atracou"); }
  if(k === "fundeados" && mover("atracados")) h += b("atracar", "Registrar atracação", "pri");
  if(k === "atracados"){ if(pode(k, k, "ton_movimentada")) h += b("operacao", "Atualizar operação"); if(mover("desatracados")) h += b("desatracar", "Registrar desatracação", "pri"); }
  if(k !== "rascunhos" && podeEditar(s)) h += b("editar", "✏️ Editar");
  if(podeExcluir(s)) h += b("excluir", k === "rascunhos" ? "Descartar" : "Excluir", "dng");
  return h;
}
function chipsDe(s){   /* avisos curtos para quem edita: o que ainda falta */
  var k = sitKey(s), r = s.rec, h = "";
  if(k === "rascunhos"){
    var f = faltaPublicar(r);
    h = f.length ? '<span class="chip warn">Rascunho · falta: '+esc(f.join(", "))+'</span>' : '<span class="chip ok">Rascunho · pronto para publicar</span>';
  } else if(k === "atracados" && permCampos(k, k)){
    var m = faltaManobra(r, ""); if(m.length) h = '<span class="chip warn">Manobra de atracação incompleta: '+esc(m.join(", "))+'</span>';
  } else if(k === "desatracados" && permCampos(k, k)){
    var d = parseDate(r.saida); if(d && Date.now() - +d < 48 * 36e5){ var m2 = faltaManobra(r, "d_"); if(m2.length) h = '<span class="chip warn">Manobra de desatracação incompleta: '+esc(m2.join(", "))+'</span>'; }
  }
  return h;
}
function row(s, lista){
  var h = rowBase(s, lista);
  if(!EDIT.on) return h;
  var b = botoes(s), c = chipsDe(s); if(!b && !c) return h;
  return h.replace(/<\/div>$/, '<div class="acts">'+c+b+'</div></div>');
}
function setMode(){
  E("editbar").hidden = !EDIT.on; E("btn-login").hidden = EDIT.on;
  var et = EDIT.admin ? "Administrador" : EDIT.etapas.map(function(e){ return ETAPA_NOME[e]; }).join(", ");
  E("who").textContent = EDIT.on ? EDIT.nome + (EDIT.cargo ? " · " + EDIT.cargo : "") + " — " + (et || "sem etapa") : "";
  E("btn-new").hidden = !opcoesNovo().length; E("btn-aviso").hidden = !podeAviso(); E("btn-usu").hidden = !(EDIT.on && EDIT.admin);
  if(!verRascunhos() && state.tab === "rascunhos") state.tab = TELA_INICIAL;
  renderAll();
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

/* =====================================================================================
   USUÁRIOS (só o administrador): cadastrar, editar, trocar a senha e ativar/desativar, direto no site.
   O servidor (Apps Script) confere de novo: quem não é administrador não consegue nem listar.
   ===================================================================================== */
var ETAPAS_USU = [["previsao","Previsão","cria e publica as previsões de chegada"],["fundeio","Ao largo","registra navios fundeados"],["atracacao","Atracação","registra a atracação e a manobra"],["movimentacao","Movimentação","atualiza as toneladas movimentadas"],["desatracacao","Desatracação","registra a saída do navio"]];
function senhaAleatoria(){
  var al = "abcdefghjkmnpqrstuvwxyz23456789", out = "", a = new Uint32Array(8);
  (window.crypto || window.msCrypto).getRandomValues(a);
  for(var i = 0; i < 8; i++) out += al.charAt(a[i] % al.length);
  return out;
}
function etapasUsuTxt(u){
  if(u.admin) return "todas (administrador)";
  var t = (u.etapas || []).map(function(e){ return ETAPA_NOME[e]; }).filter(Boolean);
  return t.length === 5 ? "todas" : (t.join(", ") || "nenhuma");
}
function openUsuarios(){
  var d = dlg('<h2>Usuários do sistema</h2><p>Quem pode entrar para editar o line-up e o que cada pessoa pode fazer.</p><div class="btns utop"><button class="btn pri" id="un" type="button">+ Novo usuário</button></div><div id="ul" class="ulist">Carregando…</div><div class="msg" id="umsg"></div><div class="btns"><button class="btn" data-x type="button">Fechar</button></div>', true);
  var lista = [];
  function pintar(){
    E("ul").innerHTML = lista.length ? lista.map(function(u){
      var eu = u.login === EDIT.usuario;
      return '<div class="u'+(u.ativo ? "" : " off")+'"><div class="ui"><b>'+esc(u.nome)+'</b>'+(eu ? ' <span class="ub">você</span>' : '')+(u.admin ? ' <span class="ub adm">Administrador</span>' : '')+(u.ativo ? '' : ' <span class="ub inat">Desativado</span>')+
        '<div class="us">'+esc(u.cargo || "Sem cargo")+' · login: <span class="mono">'+esc(u.login)+'</span></div>'+
        '<div class="us">'+(u.email ? esc(u.email) : "sem e-mail")+' · '+(u.telefone ? esc(u.telefone) : "sem telefone")+'</div>'+
        '<div class="us">Etapas: '+esc(etapasUsuTxt(u))+'</div></div>'+
        '<div class="ua"><button class="btn" type="button" data-ua="edit" data-l="'+esc(u.login)+'">Editar</button><button class="btn" type="button" data-ua="pw" data-l="'+esc(u.login)+'">Nova senha</button>'+
        (eu ? '' : '<button class="btn'+(u.ativo ? ' dng' : '')+'" type="button" data-ua="at" data-l="'+esc(u.login)+'">'+(u.ativo ? "Desativar" : "Ativar")+'</button>')+'</div></div>';
    }).join("") : '<p>Nenhum usuário cadastrado.</p>';
  }
  function carregar(){
    post({acao:"usuarios"}).then(function(j){ lista = j.usuarios || []; pintar(); say("umsg", ""); },
      function(e){ E("ul").innerHTML = ""; say("umsg", e.message + (/desconhecida/i.test(e.message) ? " (O Apps Script ainda não foi atualizado: publique uma nova versão da implantação.)" : ""), true); });
  }
  function achar(l){ return lista.filter(function(u){ return u.login === l; })[0]; }
  E("un").onclick = function(){ formUsuario(null, function(j){ lista = j.usuarios; pintar(); }); };
  E("ul").addEventListener("click", function(e){
    var b = e.target.closest("[data-ua]"); if(!b) return;
    var u = achar(b.getAttribute("data-l")), a = b.getAttribute("data-ua"); if(!u) return;
    if(a === "edit") formUsuario(u, function(j){ lista = j.usuarios; pintar(); });
    else if(a === "pw") senhaUsuario(u);
    else if(a === "at"){
      var ativar = !u.ativo;
      if(!ativar && !confirm("Desativar " + u.nome + "? A pessoa não conseguirá mais entrar. Você pode ativar de novo depois.")) return;
      b.disabled = true; say("umsg", "Salvando…");
      post({acao:"usuario_ativo", login:u.login, ativo:ativar}).then(function(j){ lista = j.usuarios; pintar(); say("umsg", ""); toast(u.nome + (ativar ? " foi ativado(a)." : " foi desativado(a).")); },
        function(er){ b.disabled = false; say("umsg", er.message, true); });
    }
  });
  carregar();
}
function formUsuario(u, depois){
  var novo = !u, u0 = u || {login:"", nome:"", cargo:"", email:"", telefone:"", etapas:[], admin:false};
  var chk = ETAPAS_USU.map(function(x){
    return '<label class="chk"><input type="checkbox" name="et" value="'+x[0]+'"'+(u0.etapas.indexOf(x[0]) >= 0 ? " checked" : "")+'><span><b>'+x[1]+'</b> — '+x[2]+'</span></label>';
  }).join("");
  var d = dlg('<h2>'+(novo ? "Novo usuário" : "Editar usuário")+'</h2><div class="fg">'+
    '<label class="w"><span>Nome completo *</span><input id="u-nome" autocomplete="off" maxlength="80" value="'+esc(u0.nome)+'"></label>'+
    '<label><span>Cargo</span><input id="u-cargo" autocomplete="off" maxlength="80" value="'+esc(u0.cargo)+'" placeholder="Ex.: Coordenador de Operações"></label>'+
    '<label><span>Telefone</span><input id="u-tel" type="tel" inputmode="tel" autocomplete="off" maxlength="30" value="'+esc(u0.telefone)+'" placeholder="(81) 99999-9999"></label>'+
    '<label class="w"><span>E-mail</span><input id="u-mail" type="email" autocomplete="off" maxlength="120" value="'+esc(u0.email)+'" placeholder="nome@portodorecife.pe.gov.br"></label>'+
    '<label class="w"><span>Login (para entrar no sistema) *</span><input id="u-login" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30" value="'+esc(u0.login)+'"'+(novo ? ' placeholder="Ex.: maria.souza"' : ' disabled')+'></label>'+
    (novo ? '<label class="w"><span>Senha provisória * (mínimo 6 caracteres)</span><div class="inl"><input id="u-pw" autocomplete="off" autocapitalize="none" spellcheck="false"><button class="btn" id="u-gera" type="button">Gerar</button></div></label>' : '')+
    '</div><div class="fl2">Etapas pelas quais a pessoa é responsável</div><div class="chks" id="u-et">'+chk+'</div>'+
    '<label class="chk adm"><input type="checkbox" id="u-adm"'+(u0.admin ? " checked" : "")+'><span><b>Administrador</b> — pode tudo, inclusive excluir embarcações e gerenciar usuários</span></label>'+
    '<div class="msg" id="fumsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="u-ok" type="button">'+(novo ? "Cadastrar usuário" : "Salvar alterações")+'</button></div>', true);
  function travar(){ var a = E("u-adm").checked; Array.prototype.forEach.call(d.querySelectorAll('input[name="et"]'), function(c){ c.disabled = a; }); }
  E("u-adm").onchange = travar; travar();
  if(novo) E("u-gera").onclick = function(){ E("u-pw").value = senhaAleatoria(); };
  E("u-ok").onclick = function(){
    var et = Array.prototype.map.call(d.querySelectorAll('input[name="et"]:checked'), function(c){ return c.value; });
    var b = {acao:"usuario_salvar", novo:novo, login:E("u-login").value.trim(), nome:E("u-nome").value.trim(), cargo:E("u-cargo").value.trim(), email:E("u-mail").value.trim(), telefone:E("u-tel").value.trim(), etapas:et, admin:E("u-adm").checked, senha:novo ? E("u-pw").value : ""};
    if(!b.nome){ say("fumsg", "Escreva o nome da pessoa.", true); return; }
    if(!b.login){ say("fumsg", "Escreva o login.", true); return; }
    if(novo && b.senha.length < 6){ say("fumsg", "A senha provisória precisa ter pelo menos 6 caracteres.", true); return; }
    if(!b.admin && !et.length){ say("fumsg", "Marque pelo menos uma etapa ou marque Administrador.", true); return; }
    E("u-ok").disabled = true; say("fumsg", "Salvando…");
    post(b).then(function(j){ d.close(); toast(novo ? "Usuário cadastrado." : "Usuário atualizado."); if(depois) depois(j); refresh(); },
      function(e){ E("u-ok").disabled = false; say("fumsg", e.message, true); });
  };
  E("u-nome").focus();
}
function senhaUsuario(u){
  var d = dlg('<h2>Nova senha</h2><p>Para <b>'+esc(u.nome)+'</b> (login: '+esc(u.login)+'). Anote e entregue a senha provisória; a pessoa pode trocar depois em <b>Minha senha</b>.</p><div class="fg one"><label class="w"><span>Senha provisória (mínimo 6 caracteres)</span><div class="inl"><input id="np" autocomplete="off" autocapitalize="none" spellcheck="false"><button class="btn" id="np-g" type="button">Gerar</button></div></label></div><div class="msg" id="npmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="np-ok" type="button">Salvar senha</button></div>');
  E("np-g").onclick = function(){ E("np").value = senhaAleatoria(); };
  E("np-ok").onclick = function(){
    var v = E("np").value; if(v.length < 6){ say("npmsg", "A senha precisa ter pelo menos 6 caracteres.", true); return; }
    E("np-ok").disabled = true; say("npmsg", "Salvando…");
    post({acao:"usuario_senha", login:u.login, senha:v}).then(function(){ d.close(); toast("Senha de " + u.nome + " redefinida."); },
      function(e){ E("np-ok").disabled = false; say("npmsg", e.message, true); });
  };
  E("np").focus();
}

/* =====================================================================================
   FORMULÁRIOS POR ETAPA
   Cada etapa é um "bloco" com poucos campos. Campos: [chave, rótulo, opções].
   opções: req (sempre obrigatório) · pub (obrigatório para publicar no MEP) · pubc (idem, só se tiver carga)
           t (tipo) · w (linha inteira) · agora (botão "Agora") · def:"now" (já vem com a hora de agora ao avançar de etapa)
   ===================================================================================== */
function manobraCampos(p){
  var d = p === "d_";
  return [
    [p+"hora_pratico", "Prático a bordo (POB)", {t:"hm", agora:1}],
    [p+"inicio_manobra", "Início da manobra (BOSP)", {t:"hm", agora:1}],
    [p+"hora_amarracao", d ? "Largada do último cabo" : "Amarração do último cabo (ATB)", {t:"hm", agora:1}],
    [p+"termino_manobra", d ? "Término da manobra" : "Término da manobra (ATB)", {t:"hm", agora:1}],
    [p+"bordo", d ? "Bordo de desatracação" : "Bordo de atracação", {t:"bordo"}],
    [p+"pratico", "Prático (nome)", {}],
    [p+"calado_proa", d ? "Calado proa na saída (m)" : "Calado proa (m)", {t:"dec",h:1}],
    [p+"calado_popa", d ? "Calado popa na saída (m)" : "Calado popa (m)", {t:"dec",h:1}],
    [p+"cabecos", "Cabeços de amarração (ex.: 47, 50, 53, 57)", {w:1}],
    [p+"rebocadores", "Rebocadores", {w:1}]
  ];
}
function bloco(id, sit){
  var pre = sit === "rascunhos" || sit === "previstos";
  if(id === "dados"){
    var c = [["navio","Nome da embarcação",{req:1}], ["imo","IMO",{t:"imo"}], ["agencia","Agência de navegação",{pub:1,h:1}], ["operador","Operador portuário",{h:1}],
             ["operacao","Operação",{t:"op",w:1,pub:1}], ["carga","Carga",{t:"carga",pubc:1,h:1,w:1}], ["ton_prevista","Toneladas previstas",{t:"num",pubc:1,h:1}]];
    if(pre) c.push(["chegada","Previsão de chegada (ETA)",{t:"dt",pub:1}], ["cais","Berço previsto",{t:"cais",pub:1}]);
    var mais = [["nacionalidade","Bandeira (país)",{t:"pais"}], ["comprimento","Comprimento (m)",{t:"dec",h:1}], ["calado","Calado máximo (m)",{t:"dec",h:1}], ["origem_destino","Origem / destino da carga",{}], ["porto_anterior","Porto anterior",{}], ["proximo_porto","Próximo porto",{}]];
    if(pre) mais.push(["previsao_atracacao","Previsão de atracação (POB)",{t:"dt"}], ["saida","Previsão de saída (ETD)",{t:"dt"}], ["observacoes","Observações",{t:"ta",w:1}]);
    return {id:"dados", t:"Embarcação", secs:[{c:c}], mais:mais};
  }
  if(id === "fundeio") return {id:"fundeio", t:"Chegada", secs:[{c:[["chegada","Chegada confirmada (fundeio)",{t:"dt",req:1,agora:1,def:"now"}], ["cais","Berço previsto",{t:"cais"}], ["previsao_atracacao","Previsão de atracação (POB)",{t:"dt"}], ["saida","Previsão de saída (ETD)",{t:"dt"}], ["observacoes","Observações",{t:"ta",w:1}]]}]};
  if(id === "atracacao"){
    var m = manobraCampos("");
    return {id:"atracacao", t:"Atracação", secs:[
      {c:[["chegada","Data e hora da atracação",{t:"dt",req:1,agora:1,def:"now"}], ["cais","Berço atracado",{t:"cais",req:1}], ["cbo","CBO",{t:"cbo",h:1}], ["nr_livro","Nº no livro de registro",{h:1}]]},
      {t:"Manobra de atracação", c:m}]};
  }
  if(id === "operacao") return {id:"operacao", t:"Operação", secs:[{c:[["ton_movimentada","Toneladas movimentadas até agora",{t:"num"}], ["saida","Previsão de saída (ETD)",{t:"dt"}], ["observacoes","Observações",{t:"ta",w:1}]]}]};
  if(id === "desatracacao") return {id:"desatracacao", t:"Desatracação", secs:[
    {c:[["saida","Data e hora da saída (desatracação)",{t:"dt",req:1,agora:1,def:"now"}], ["ton_movimentada","Tonelagem final (t)",{t:"num"}]]},
    {t:"Manobra de desatracação", c:manobraCampos("d_")},
    {c:[["observacoes","Observações",{t:"ta",w:1}]]}]};
}
function todosCampos(b){ var o = []; b.secs.forEach(function(s){ s.c.forEach(function(f){ o.push(f); }); }); (b.mais || []).forEach(function(f){ o.push(f); }); return o; }

function opcoesNovo(){
  var o = [
    ["rascunhos", "Nova previsão", "O agente de navegação informou o navio. Fica em rascunho, só aqui dentro, até você publicar no MEP."],
    ["fundeados", "Embarcação que já chegou", "Já está fundeada, esperando para atracar."],
    ["atracados", "Embarcação que já atracou", "Registre a atracação e a manobra."],
    ["desatracados", "Embarcação que já saiu", "Para completar o histórico."]
  ];
  return o.filter(function(x){ return podeCriar(x[0]); });
}

function passosHtml(para){
  var nome = PASSOS.filter(function(p){ return p[0] === para; })[0][1];
  return '<p class="etapa-m">Etapa <b>'+(ORDEM[para] + 1)+' de '+PASSOS.length+'</b> · '+nome+'</p><ol class="steps" aria-label="Etapas">' + PASSOS.map(function(p){
    var c = ORDEM[p[0]] < ORDEM[para] ? "ok" : p[0] === para ? "cur" : "";
    return '<li class="'+c+'"'+(c === "cur" ? ' aria-current="step"' : "")+'>'+p[1]+'</li>';
  }).join("") + '</ol>';
}
function valorIni(f, rec, ctx){
  var k = f[0], o = f[2] || {}, v = rec[k] == null ? "" : String(rec[k]);
  if(o.def === "now" && ctx.avanco) return agoraDt();
  if(o.t === "dt") return dtIn(v);
  if(o.t === "dec") return v.replace(".", ",");
  return v;
}
function campoHtml(f, rec, ctx){
  var k = f[0], lab = f[1], o = f[2] || {}, t = o.t || "", v = valorIni(f, rec, ctx), id = "f_"+k, base = k.replace(/^d_/, ""), c;
  var list = SUG_CAMPOS.indexOf(base) >= 0 ? ' list="dl_'+base+'" autocomplete="off"' : "";
  var agora = o.agora ? '<button type="button" class="agora" data-agora="'+k+'">Agora</button>' : "";
  if(t === "dt") c = '<div class="inl"><input type="datetime-local" id="'+id+'" value="'+esc(v)+'">'+agora+'</div>';
  else if(t === "hm") c = '<div class="inl"><input type="time" id="'+id+'" value="'+esc(v)+'">'+agora+'</div>';
  else if(t === "ta") c = '<textarea id="'+id+'" rows="3">'+esc(v)+'</textarea>';
  else if(t === "bordo"){
    var ob = [["", "—"], ["Boreste", "Boreste (lado direito)"], ["Bombordo", "Bombordo (lado esquerdo)"]];
    if(v && !ob.some(function(x){ return x[0] === v; })) ob.push([v, v]);
    c = '<select id="'+id+'">'+ob.map(function(x){ return '<option value="'+esc(x[0])+'"'+(x[0] === v ? " selected" : "")+'>'+esc(x[1])+'</option>'; }).join("")+'</select>';
  } else if(t === "cais"){
    var cbOn = ehCB(v), vb = caisBase(v), oc = ocupacao(ctx.id), op = ["", "00-TA"]; for(var i = 1; i <= 9; i++) op.push(String(i)); op.push("MARINA"); if(vb && op.indexOf(vb) < 0) op.push(vb);
    c = '<select id="'+id+'">'+op.map(function(x){
      var nome = x ? ((isNaN(x) && x !== "00-TA") ? x : "Berço " + x) : "Sem berço", kk = caisKeys(x)[0], oc2 = (ctx.ocupados && kk && oc[kk]) ? " · ocupado: " + oc[kk][0] : "";
      return '<option value="'+esc(x)+'"'+(x === vb ? " selected" : "")+'>'+esc(nome + oc2)+'</option>'; }).join("")+'</select>' +
      '<span class="cbk"><input type="checkbox" id="'+id+'_cb"'+(cbOn ? " checked" : "")+'> <em>A contra bordo de outro navio (/CB)</em></span>';
  } else if(t === "carga"){
    c = '<input type="hidden" id="'+id+'" value="'+esc(v)+'"><div class="cg" id="cg"></div><button type="button" class="cg-add" id="cg_add">+ Adicionar outro produto</button>';
  } else if(t === "op"){
    c = '<div class="seg2" id="opseg" role="group" aria-label="Operação"><button type="button" data-op="IMPORTAÇÃO">Importação</button><button type="button" data-op="EXPORTAÇÃO">Exportação</button><button type="button" data-op="SERV">Serviço (sem carga)</button></div>' +
        '<input id="f_servico" list="dl_servico" autocomplete="off" placeholder="Qual serviço? Ex.: Dragagem" hidden><input type="hidden" id="f_operacao" value="'+esc(v)+'">';
  } else if(t === "pais"){
    c = '<div class="inl"><input id="'+id+'" list="dl_paises" autocomplete="off" placeholder="Digite o país. Ex.: Panamá" value="'+esc(v)+'"><span class="flag-prev" id="fp_'+k+'">'+bandeiraHtml(v)+'</span></div>';
  } else if(t === "cbo"){
    c = '<input id="'+id+'" inputmode="numeric" maxlength="7" placeholder="0000/26" autocomplete="off" value="'+esc(v)+'"><div class="chips" id="sug_cbo"></div>';
  } else if(t === "imo"){
    c = '<input id="'+id+'" inputmode="numeric" maxlength="9" placeholder="Só números" autocomplete="off" value="'+esc(v)+'">';
  } else c = '<input id="'+id+'"'+list+(t === "num" ? ' inputmode="numeric"' : t === "dec" ? ' inputmode="decimal"' : "")+' value="'+esc(v)+'">';
  var cl = (o.w ? "w" : "") + ((o.h || t === "hm") ? " h" : "");
  return '<label'+(cl ? ' class="'+cl+'"' : "")+' data-k="'+k+'"><span id="l_'+k+'">'+esc(lab)+'<i class="rq" hidden> *</i></span>'+c+'<small class="fh" id="h_'+k+'"></small><small class="fe" id="e_'+k+'"></small></label>';
}
function paneHtml(b, rec, ctx){
  var h = b.info ? '<p class="info">'+b.info+'</p>' : "";
  b.secs.forEach(function(s){ h += (s.t ? '<h3 class="st">'+esc(s.t)+'</h3>' : "") + '<div class="fg">'+s.c.map(function(f){ return campoHtml(f, rec, ctx); }).join("")+'</div>'; });
  if(b.mais && b.mais.length){
    var tem2 = b.mais.some(function(f){ return String(rec[f[0]] == null ? "" : rec[f[0]]).trim() !== ""; });
    h += '<details class="mais"'+(tem2 ? " open" : "")+'><summary>Mais detalhes (opcional)</summary><div class="fg">'+b.mais.map(function(f){ return campoHtml(f, rec, ctx); }).join("")+'</div></details>';
  }
  return h;
}

/* Abre a janela de uma etapa. cfg: {s, titulo, sub, para, blocos, acoes:[{rot,sit,toast,pri,id}], avanco, preValidar, rodape} */
function abrirForm(cfg){
  var s = cfg.s, rec = s ? s.rec : {}, atual = s ? sitKey(s) : "", destPerm = permCampos(atual, cfg.acoes[0].sit);
  if(!destPerm){ toast("Você não é responsável por esta etapa.", true); return; }
  var ctx = {id:s ? s.id : "", avanco:!!cfg.avanco, ocupados:cfg.acoes[0].sit === "atracados"};
  var blocos = cfg.blocos.map(function(b){
    var ok = function(f){ return destPerm.todos || destPerm.set[f[0]]; };
    b.secs = b.secs.map(function(sc){ return {t:sc.t, c:sc.c.filter(ok)}; }).filter(function(sc){ return sc.c.length; });
    if(b.mais) b.mais = b.mais.filter(ok);
    return b;
  }).filter(function(b){ return b.secs.length || (b.mais && b.mais.length); });
  if(!blocos.length){ toast("Não há nada para você preencher nesta etapa.", true); return; }
  cfg.blocos = blocos;
  var html = '<div class="dh"><button type="button" class="dx" data-cx tabindex="-1" aria-label="Fechar">✕</button><h2>'+esc(cfg.titulo)+'</h2>'+(cfg.sub ? '<p class="dsub">'+cfg.sub+'</p>' : "")+passosHtml(cfg.para)+(cfg.acoes.some(function(a){ return a.sit === "previstos"; }) ? '<p class="nota">Campos com * são obrigatórios para publicar.</p>' : "")+'</div>';
  if(blocos.length > 1) html += '<div class="tabs2" role="tablist">'+blocos.map(function(b, i){ return '<button type="button" role="tab" class="t2" data-tab="'+b.id+'" aria-selected="'+(i === 0)+'">'+esc(b.t)+'<i class="dot" hidden></i></button>'; }).join("")+'</div>';
  html += '<div class="scroller">';
  blocos.forEach(function(b, i){ html += '<div class="tp" data-pane="'+b.id+'"'+(i ? " hidden" : "")+'>'+paneHtml(b, rec, ctx)+'</div>'; });
  html += SUG_CAMPOS.map(function(k){ return '<datalist id="dl_'+k+'"></datalist>'; }).join("") + '<datalist id="dl_servico"></datalist><datalist id="dl_paises">'+PAISES.map(function(p){ return '<option value="'+esc(p.pais)+'" label="Bandeira '+esc(p.nome)+'">'; }).join("")+'</datalist>';
  html += '<div class="avs" id="avs" aria-live="polite"></div></div><div class="btns">'+(cfg.rodape ? '<span class="rod">'+cfg.rodape+'</span>' : "")+'<button class="btn" data-cx type="button">Cancelar</button>'+
    cfg.acoes.map(function(a, i){ return '<button class="btn'+(a.pri ? " pri" : "")+'" data-go="'+i+'" type="button">'+esc(a.rot)+'</button>'; }).join("")+'</div>';
  var d = dlg(html, true), sujo = false, ack = "";
  carregarSug();
  var q = function(sel){ return d.querySelector(sel); }, F = function(k){ return d.querySelector("#f_"+k); };
  var campos = []; blocos.forEach(function(b){ todosCampos(b).forEach(function(f){ campos.push({k:f[0], l:f[1], o:f[2] || {}, b:b.id}); }); });

  /* --- fechar sem perder o que foi digitado por engano --- */
  function fechar(){ if(sujo && !confirm("Descartar o que você preencheu?")) return; d.close(); }
  d.addEventListener("cancel", function(e){ if(sujo && !confirm("Descartar o que você preencheu?")) e.preventDefault(); });
  Array.prototype.forEach.call(d.querySelectorAll("[data-cx]"), function(b){ b.onclick = fechar; });
  d.addEventListener("input", function(){ sujo = true; ack = ""; limparAvisos(); });
  d.addEventListener("change", function(){ sujo = true; });

  /* --- abas --- */
  function aba(id){
    Array.prototype.forEach.call(d.querySelectorAll(".tp"), function(p){ p.hidden = p.getAttribute("data-pane") !== id; });
    Array.prototype.forEach.call(d.querySelectorAll(".t2"), function(t){ t.setAttribute("aria-selected", String(t.getAttribute("data-tab") === id)); });
  }
  Array.prototype.forEach.call(d.querySelectorAll(".t2"), function(t){ t.onclick = function(){ aba(t.getAttribute("data-tab")); }; });

  /* --- botão "Agora" --- */
  d.addEventListener("click", function(e){
    var b = e.target.closest("[data-agora]"); if(!b) return;
    var k = b.getAttribute("data-agora"), el = F(k); if(!el) return;
    el.value = el.type === "time" ? agoraHm() : agoraDt(); sujo = true; ack = ""; limparAvisos(); el.dispatchEvent(new Event("input", {bubbles:true}));
  });

  /* --- carga: lista de produtos, cada um com suas embalagens --- */
  var cgBox = q("#cg"), cgRows = [];
  function cgDraw(foco){
    if(!cgBox) return;
    cgBox.innerHTML = cgRows.map(function(r, i){
      return '<div class="cg-r"><div class="inl"><input class="cg-p" data-i="'+i+'" list="dl_carga" autocomplete="off" placeholder="Produto. Ex.: Barrilha" value="'+esc(r.p)+'">'+(cgRows.length > 1 ? '<button type="button" class="cg-x" data-x="'+i+'" aria-label="Remover este produto">✕</button>' : "")+'</div>' +
        '<div class="cg-e" role="group" aria-label="Embalagem">'+EMBS.map(function(m, j){ return '<button type="button" class="cg-b" data-i="'+i+'" data-j="'+j+'" aria-pressed="'+(r.e.indexOf(j) >= 0)+'" title="'+esc(m[0])+'">'+esc(m[0])+' <small>'+m[1]+'</small></button>'; }).join("")+'</div></div>';
    }).join("");
    if(foco){ var ins = cgBox.querySelectorAll(".cg-p"); if(ins.length) ins[ins.length - 1].focus(); }
  }
  function cgSync(){ F("carga").value = cargaCompose(cgRows); }
  function cgLer(){ cgRows = cargaParse(F("carga").value); if(!cgRows.length) cgRows = [{p:"", e:[]}]; cgDraw(); }
  if(cgBox){
    cgLer();
    cgBox.addEventListener("input", function(e){ var i = e.target.getAttribute("data-i"); if(i == null || !e.target.classList.contains("cg-p")) return; cgRows[+i].p = e.target.value; cgSync(); });
    cgBox.addEventListener("click", function(e){
      var b = e.target.closest(".cg-b"), x = e.target.closest(".cg-x");
      if(b){ var r = cgRows[+b.getAttribute("data-i")], j = +b.getAttribute("data-j"), p = r.e.indexOf(j); if(p >= 0) r.e.splice(p, 1); else { r.e.push(j); r.e.sort(function(a, c){ return a - c; }); } cgSync(); cgDraw(); }
      else if(x){ cgRows.splice(+x.getAttribute("data-x"), 1); cgSync(); cgDraw(); }
      else return;
      sujo = true; ack = ""; limparAvisos();
    });
    q("#cg_add").addEventListener("click", function(){ cgRows.push({p:"", e:[]}); cgDraw(true); sujo = true; });
  }

  /* --- operação: importação / exportação / serviço (esconde o que não se aplica) --- */
  var seg = q("#opseg"), modo = "";
  function aplicarOp(){
    if(!seg) return;
    var v = F("operacao").value;
    modo = v === "IMPORTAÇÃO" || v === "EXPORTAÇÃO" ? v : (v || modo === "SERV") ? "SERV" : "";
    Array.prototype.forEach.call(seg.querySelectorAll("button"), function(b){ b.setAttribute("aria-pressed", String(b.getAttribute("data-op") === modo)); });
    var sv = F("servico"); sv.hidden = modo !== "SERV";
    ["carga","ton_prevista"].forEach(function(k){ var el = F(k); if(el) el.closest("label").hidden = modo === "SERV"; });
    var od = d.querySelector('[data-k="origem_destino"]'); if(od){ od.hidden = modo === "SERV"; var sp = q("#l_origem_destino"); if(sp) sp.firstChild.nodeValue = modo === "IMPORTAÇÃO" ? "Origem da carga" : modo === "EXPORTAÇÃO" ? "Destino da carga" : "Origem / destino da carga"; }
  }
  if(seg){
    var v0 = F("operacao").value; if(v0 && !comCarga(v0)){ F("servico").value = v0; }
    seg.addEventListener("click", function(e){
      var b = e.target.closest("[data-op]"); if(!b) return;
      var op = b.getAttribute("data-op"); modo = op;
      F("operacao").value = op === "SERV" ? (F("servico").value.trim().toUpperCase()) : op;
      aplicarOp(); sujo = true; ack = ""; limparAvisos(); if(op === "SERV") F("servico").focus();
    });
    F("servico").addEventListener("input", function(){ F("operacao").value = F("servico").value.trim().toUpperCase(); });
    aplicarOp();
  }

  /* --- IMO e CBO: formatam sozinhos --- */
  if(F("imo")) F("imo").addEventListener("input", function(){ this.value = this.value.replace(/\D/g, "").slice(0, 7); });
  if(F("cbo")){
    var cb = F("cbo");
    cb.addEventListener("input", function(){
      var n = this.value.replace(/[^\d]/g, "").slice(0, 6); this.value = n.length > 4 ? n.slice(0, 4) + "/" + n.slice(4) : n;
    });
    cb.addEventListener("blur", function(){ var m = /^(\d{1,4})$/.exec(this.value); if(m) this.value = ("000" + m[1]).slice(-4) + "/" + p2(new Date().getFullYear() % 100); });
    var sg = q("#sug_cbo");
    function pintarCbo(){ if(cb.value) { sg.innerHTML = ""; return; } var p = proximoCbo(); sg.innerHTML = '<button type="button" class="chip pick" data-cbo="'+p+'">Usar '+p+' (próximo da sequência)</button>'; }
    sg.addEventListener("click", function(e){ var b = e.target.closest("[data-cbo]"); if(!b) return; cb.value = b.getAttribute("data-cbo"); sg.innerHTML = ""; sujo = true; });
    pintarCbo(); setTimeout(pintarCbo, 1500); cb.addEventListener("input", function(){ if(cb.value) sg.innerHTML = ""; });
  }

  /* --- nome conhecido: preenche os dados fixos do navio e avisa se já está em andamento --- */
  function conhecer(){
    var nm = F("navio") ? F("navio").value.trim() : "", im = F("imo") ? F("imo").value.trim() : "";
    var hn = q("#h_navio"), en = q("#e_navio"); if(!hn) return;
    hn.textContent = ""; en.innerHTML = ""; if(F("navio")) F("navio").closest("label").classList.remove("err");
    if(!nm && !im) return;
    var dup = (cfg.acoes[0].sit !== "desatracados") ? emAndamento(nm, im, ctx.id) : null;
    if(dup){
      F("navio").closest("label").classList.add("err");
      en.innerHTML = esc(dup.navio)+' já está em andamento ('+esc(dup.rec.situacao)+'). <button type="button" class="lk" data-abrir="'+esc(dup.id)+'">Abrir esse registro</button>';
      return;
    }
    if(s) return;   /* só preenche automaticamente em cadastro novo */
    var r = achaNavio(nm, im); if(!r) return;
    var cp = {nacionalidade:r.nacionalidade, imo:r.imo, comprimento:r.comprimento, calado:r.calado, agencia:r.agencia, operador:r.operador}, pre = [];
    Object.keys(cp).forEach(function(k){ var el = F(k), val = cp[k] == null ? "" : String(cp[k]); if(el && !el.value && val){ el.value = String(val).replace(".", ","); pre.push(k); } });
    if(F("nacionalidade") && F("nacionalidade").value) F("nacionalidade").dispatchEvent(new Event("input"));
    if(!F("navio").value && r.navio) F("navio").value = r.navio;
    if(!F("operacao") || !F("operacao").value){ if(r.operacao && F("operacao")){ F("operacao").value = r.operacao; if(F("servico") && !comCarga(r.operacao)) F("servico").value = r.operacao; aplicarOp(); pre.push("operacao"); } }
    if(F("carga") && !F("carga").value && r.carga && comCarga(r.operacao)){ F("carga").value = r.carga; cgLer(); pre.push("carga"); }
    var dd = parseDate(r.saida || r.chegada);
    hn.textContent = "Já esteve no porto" + (dd ? " em " + fmt(r.saida || r.chegada).split(" · ")[0] : "") + (pre.length ? ". Preenchemos os dados dele — confira." : ".");
  }
  if(F("nacionalidade")){
    var fpv = function(fix){
      var el = F("nacionalidade"), p = acharPais(el.value), box = E("fp_nacionalidade");
      if(fix && p) el.value = p.pais;   /* "alemã", "DE" ou "panama" viram o nome certo do país */
      if(box) box.innerHTML = bandeiraHtml(el.value);
      var nv = navegacaoDe(el.value), hh = E("h_nacionalidade");
      if(hh) hh.textContent = nv ? "Navegação: " + nv.nome + " (" + nv.sigla + ")" : "";
    };
    fpv(false);
    F("nacionalidade").addEventListener("input", function(){ fpv(false); });
    F("nacionalidade").addEventListener("change", function(){ fpv(true); });
    F("nacionalidade").addEventListener("blur", function(){ fpv(true); });
  }
  if(F("navio")){ F("navio").addEventListener("change", conhecer); F("navio").addEventListener("blur", conhecer); if(F("imo")) F("imo").addEventListener("change", conhecer); }
  d.addEventListener("click", function(e){
    var b = e.target.closest("[data-abrir]"); if(!b) return;
    var it = findItem(b.getAttribute("data-abrir")); sujo = false; d.close(); if(it) editar(it);
  });

  /* --- leitura e conferência --- */
  function ler(){
    var v = {};
    campos.forEach(function(c){
      var el = F(c.k), o = c.o; if(!el) return;
      var lb = el.closest("label"); if(lb && lb.hidden) return;
      var x = el.value.trim(), t = o.t;
      if(t === "cais"){ var cbx = F("cais_cb"); if(x && cbx && cbx.checked) x += " / CB"; }
      v[c.k] = t === "dt" ? dtOut(x) : t === "num" ? x.replace(/\D/g, "") : t === "imo" ? x.replace(/\D/g, "") : t === "cbo" ? x.toUpperCase() : x;
    });
    if(F("operacao")){ if(modo === "SERV") v.operacao = F("servico").value.trim().toUpperCase(); else v.operacao = F("operacao").value; }
    return v;
  }
  function limparAvisos(){ var a = q("#avs"); if(a && !a.getAttribute("data-fixo")) { a.innerHTML = ""; } }
  function limparErros(){
    Array.prototype.forEach.call(d.querySelectorAll("label.err"), function(l){ l.classList.remove("err"); });
    Array.prototype.forEach.call(d.querySelectorAll(".fe"), function(x){ if(!x.querySelector("[data-abrir]")) x.textContent = ""; });
    Array.prototype.forEach.call(d.querySelectorAll(".dot"), function(x){ x.hidden = true; });
    var a = q("#avs"); a.innerHTML = ""; a.removeAttribute("data-fixo");
  }
  function marcar(k, msg, erros){ erros.push([k, msg]); }
  function checar(acao, v){
    var erros = [], avs = [], dest = acao.sit, val = function(k){ return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : (rec[k] == null ? "" : String(rec[k])); };
    var serv = modo === "SERV";
    /* obrigatórios */
    campos.forEach(function(c){
      if(!Object.prototype.hasOwnProperty.call(v, c.k)) return;
      var o = c.o, obrig = !!o.req;
      if(dest === "previstos"){ if(o.pub) obrig = true; if(o.pubc) obrig = modo === "IMPORTAÇÃO" || modo === "EXPORTAÇÃO"; }   /* carga e toneladas só se for importação/exportação */
      if(obrig && !v[c.k]) marcar(c.k, o.req ? "Obrigatório." : "Obrigatório para publicar no MEP.", erros);
    });
    if(serv && F("operacao") && !v.operacao) marcar("operacao", "Diga qual é o serviço.", erros);
    /* formatos */
    if(v.imo){ if(!/^\d{6,7}$/.test(v.imo)) marcar("imo", "O IMO tem 6 ou 7 números.", erros); else if(!imoOk(v.imo)) avs.push("O IMO " + v.imo + " não passa na conferência do dígito final. Confira com o agente."); }
    if(v.cbo){
      if(!/^\d{4}\/\d{2}$/.test(v.cbo)) marcar("cbo", "Use o formato 0000/26.", erros);
      else { var outro = todosRegistros().filter(function(r){ return r.id !== ctx.id && String(r.cbo||"").trim() === v.cbo; })[0]; if(outro) marcar("cbo", "O CBO " + v.cbo + " já é de " + outro.navio + ".", erros); }
    }
    var faixa = {comprimento:[5,450], calado:[0.5,25], calado_proa:[0.5,25], calado_popa:[0.5,25], d_calado_proa:[0.5,25], d_calado_popa:[0.5,25], ton_prevista:[0,500000], ton_movimentada:[0,500000]};
    Object.keys(faixa).forEach(function(k){
      if(!v[k]) return; var n = parseFloat(String(v[k]).replace(/\./g, "").replace(",", "."));
      if(isNaN(n) || n < faixa[k][0] || n > faixa[k][1]) marcar(k, "Valor fora do normal. Confira o número e a vírgula.", erros);
    });
    /* duplicidade */
    if(dest !== "desatracados" && v.navio !== undefined){
      var dup = emAndamento(v.navio, v.imo || "", ctx.id); if(dup) marcar("navio", dup.navio + " já está em andamento (" + dup.rec.situacao + ").", erros);
    }
    /* datas */
    var t = function(k){ var x = parseDate(val(k)); return x ? +x : null; }, agora = Date.now();
    if(dest === "previstos" || dest === "rascunhos"){
      if(t("chegada") && t("saida") && t("saida") < t("chegada")) marcar("saida", "A saída não pode ser antes da chegada.", erros);
      if(dest === "previstos" && v.chegada && t("chegada") < agora - 864e5 && (!s || sitKey(s) === "rascunhos" || cfg.avanco)) avs.push("A previsão de chegada já passou. Confirme a data, ou use \"Confirmar chegada\" se o navio já chegou.");
    }
    if(dest === "atracados"){
      var at = t("chegada");
      if(at && Object.prototype.hasOwnProperty.call(v, "chegada") && at > agora + 2 * 36e5) avs.push("A data e hora da atracação está no futuro.");
      if(v.saida && at && t("saida") < at) marcar("saida", "A previsão de saída não pode ser antes da atracação.", erros);
      if(v.cais && !ehCB(v.cais)){ var oc = ocupacao(ctx.id), ks = caisKeys(v.cais), b = ks.filter(function(k){ return oc[k]; })[0]; if(b && Object.prototype.hasOwnProperty.call(v, "chegada")) avs.push("O berço " + b + " está ocupado por " + oc[b][0] + ". Se ele já saiu, registre primeiro a desatracação dele."); }
      if(cfg.avanco || Object.prototype.hasOwnProperty.call(v, "hora_pratico")){
        if(!ordemHoras([v.hora_pratico, v.inicio_manobra, v.hora_amarracao, v.termino_manobra])) avs.push("Confira os horários da manobra: estão fora de ordem ou passam de 6 horas.");
        if(cfg.avanco){ var fm = []; if(!v.bordo) fm.push("bordo"); if(!v.hora_pratico) fm.push("hora do prático"); if(!v.hora_amarracao) fm.push("amarração"); if(fm.length) avs.push("Faltam dados da manobra: " + fm.join(", ") + ". Você pode completar depois em Editar."); }
      }
    }
    if(dest === "desatracados"){
      var ch = t("chegada"), sd = v.saida ? parseDate(v.saida) : null;
      if(sd && ch && +sd < ch) marcar("saida", "A saída não pode ser antes da atracação" + (rec.chegada ? " (" + fmt(rec.chegada) + ")" : "") + ".", erros);
      if(sd && +sd > agora + 2 * 36e5) avs.push("A data e hora da saída está no futuro.");
      if(cfg.avanco || Object.prototype.hasOwnProperty.call(v, "d_hora_pratico")){
        if(!ordemHoras([v.d_hora_pratico, v.d_inicio_manobra, v.d_hora_amarracao, v.d_termino_manobra])) avs.push("Confira os horários da manobra: estão fora de ordem ou passam de 6 horas.");
        if(cfg.avanco){ var fd = []; if(!v.d_bordo) fd.push("bordo"); if(!v.d_hora_pratico) fd.push("hora do prático"); if(!v.d_hora_amarracao) fd.push("largada do último cabo"); if(fd.length) avs.push("Faltam dados da manobra: " + fd.join(", ") + ". Você pode completar depois em Editar."); }
      }
    }
    if(Object.prototype.hasOwnProperty.call(v, "ton_movimentada") && v.ton_movimentada !== ""){
      var mv = +v.ton_movimentada, pv = +(val("ton_prevista") || rec.ton_prevista || 0), antes = +(rec.ton_movimentada || 0);
      if(pv > 0 && mv > pv * 1.1) avs.push("As toneladas movimentadas (" + num(mv) + ") passam 10% da prevista (" + num(pv) + "). Confira.");
      if(s && sitKey(s) === "atracados" && antes > 0 && mv < antes) avs.push("O valor é menor que o último registrado (" + num(antes) + " t). Confira.");
    }
    return {erros:erros, avs:avs};
  }
  function mostrar(res){
    limparErros();
    var porAba = {}, primeiro = null;
    res.erros.forEach(function(e){
      var el = F(e[0]), lb = el && el.closest("label"); if(!lb) return;
      lb.classList.add("err"); var fe = q("#e_"+e[0]); if(fe && !(e[0] === "navio" && fe.querySelector("[data-abrir]"))) fe.textContent = e[1];
      var cm = campos.filter(function(c){ return c.k === e[0]; })[0]; if(cm){ porAba[cm.b] = 1; }
      if(!primeiro) primeiro = el;
    });
    Array.prototype.forEach.call(d.querySelectorAll(".t2"), function(t){ var dot = t.querySelector(".dot"); if(dot) dot.hidden = !porAba[t.getAttribute("data-tab")]; });
    var a = q("#avs");
    if(res.erros.length) a.innerHTML = '<div class="bad">Falta acertar '+(res.erros.length === 1 ? "1 campo" : res.erros.length + " campos")+' (marcados em vermelho).</div>';
    else if(res.avs.length) a.innerHTML = '<div class="warn">'+res.avs.map(function(x){ return "<p>"+esc(x)+"</p>"; }).join("")+'</div>';
    if(primeiro){ var pane = primeiro.closest(".tp"); if(pane) aba(pane.getAttribute("data-pane")); var dt = primeiro.closest("details"); if(dt) dt.open = true; primeiro.scrollIntoView({block:"center", behavior:"smooth"}); try{ primeiro.focus({preventScroll:true}); }catch(x){} }
  }
  function enviar(acao, btn){
    var v = ler(), res = checar(acao, v);
    mostrar(res);
    if(res.erros.length) return;
    var sig = res.avs.join("|");
    if(res.avs.length && ack !== sig){ ack = sig; btn.setAttribute("data-rot", btn.textContent); btn.textContent = "Salvar mesmo assim"; return; }
    var reg = {id:s ? s.id : "", situacao:SITS.filter(function(x){ return x[0] === acao.sit; })[0][1], versao:s ? rec.atualizado_em : undefined};
    Object.keys(v).forEach(function(k){ reg[k] = v[k]; });
    Array.prototype.forEach.call(d.querySelectorAll("[data-go],[data-cx]"), function(b){ b.disabled = true; });
    var a = q("#avs"); a.innerHTML = '<div class="msg">Salvando…</div>'; a.setAttribute("data-fixo", "1");
    post({acao:"salvar", registro:reg}).then(function(){ sujo = false; d.close(); state.tab = acao.sit; toast(acao.toast || "Salvo."); SUG_CACHE = null; refresh(); },
      function(e){ Array.prototype.forEach.call(d.querySelectorAll("[data-go],[data-cx]"), function(b){ b.disabled = false; }); a.removeAttribute("data-fixo"); a.innerHTML = '<div class="bad">'+esc(e.message)+'</div>'; });
  }
  Array.prototype.forEach.call(d.querySelectorAll("[data-go]"), function(b){ b.onclick = function(){ enviar(cfg.acoes[+b.getAttribute("data-go")], b); }; });
  d.addEventListener("input", function(){ Array.prototype.forEach.call(d.querySelectorAll("[data-go]"), function(b){ if(b.getAttribute("data-rot")){ b.textContent = b.getAttribute("data-rot"); b.removeAttribute("data-rot"); } }); });
  Array.prototype.forEach.call(d.querySelectorAll("[data-k]"), function(lb){ var k = lb.getAttribute("data-k"); var c = campos.filter(function(x){ return x.k === k; })[0]; if(!c) return; var o = c.o; var rq = lb.querySelector(".rq"); if(rq && (o.req || o.pub || o.pubc)) rq.hidden = !(o.req || cfg.acoes.some(function(a){ return a.sit === "previstos"; })); });
  if(cfg.preValidar){ var a0 = cfg.acoes.filter(function(a){ return a.sit === cfg.preValidar; })[0]; if(a0) mostrar(checar(a0, ler())); }
  if(cfg.aposAbrir) cfg.aposAbrir(d, F);
  var primeiroCampo = d.querySelector(".tp:not([hidden]) input:not([type=hidden]):not([hidden]),.tp:not([hidden]) select"); if(primeiroCampo && !cfg.preValidar && window.matchMedia("(min-width:701px)").matches) primeiroCampo.focus();
  return d;
}

/* ---- Os caminhos: cada um monta a janelinha da sua etapa ---- */
function nomeNegrito(s){ return '<b>'+esc(s.navio)+'</b>'; }
function novo(sit){
  var ids = sit === "rascunhos" ? ["dados"] : sit === "fundeados" ? ["dados","fundeio"] : sit === "atracados" ? ["dados","atracacao"] : ["dados","atracacao","desatracacao"];
  var acoes = {
    rascunhos:[{rot:"Salvar rascunho", sit:"rascunhos", toast:"Rascunho salvo."}, {rot:"Publicar no MEP", sit:"previstos", pri:1, toast:"Publicado no MEP."}],
    fundeados:[{rot:"Confirmar chegada", sit:"fundeados", pri:1, toast:"Chegada confirmada."}],
    atracados:[{rot:"Registrar atracação", sit:"atracados", pri:1, toast:"Atracação registrada."}],
    desatracados:[{rot:"Registrar desatracação", sit:"desatracados", pri:1, toast:"Desatracação registrada."}]
  }[sit];
  abrirForm({s:null, titulo:sit === "rascunhos" ? "Nova previsão" : "Nova embarcação", sub:sit === "rascunhos" ? "Preencha o que já sabe. Só o nome é obrigatório para guardar o rascunho; ele só aparece para o público depois de publicado." : "", para:sit, blocos:ids.map(function(i){ return bloco(i, sit); }), acoes:acoes, avanco:sit !== "rascunhos"});
}
function abrirNovo(){
  var op = opcoesNovo(); if(!op.length) return;
  if(op.length === 1){ novo(op[0][0]); return; }
  var d = dlg('<h2>Nova embarcação</h2><p>Em que ponto ela está?</p><div class="escolha">'+op.map(function(x){ return '<button type="button" class="btn esc" data-novo="'+x[0]+'"><b>'+esc(x[1])+'</b><span>'+esc(x[2])+'</span></button>'; }).join("")+'</div><div class="btns"><button class="btn" data-x type="button">Cancelar</button></div>');
  d.addEventListener("click", function(e){ var b = e.target.closest("[data-novo]"); if(!b) return; d.close(); novo(b.getAttribute("data-novo")); });
}
function editar(s, opts){
  opts = opts || {};
  var k = sitKey(s), ids = k === "rascunhos" || k === "previstos" ? ["dados"] : k === "fundeados" ? ["dados","fundeio"] : k === "atracados" ? ["dados","atracacao","operacao"] : ["dados","atracacao","desatracacao"];
  var blocos = ids.map(function(i){ return bloco(i, k); });
  if(k === "atracados" && s.rec.operacao && ehServico(s.rec.operacao)) blocos.forEach(function(b){ if(b.id === "operacao") b.secs[0].c = b.secs[0].c.filter(function(f){ return f[0] !== "ton_movimentada"; }); });
  if(k === "atracados"){ var ob = blocos[2]; var pv = +s.rec.ton_prevista || 0, mv = +s.rec.ton_movimentada || 0; if(pv > 0 && !ehServico(s.rec.operacao)) ob.info = "Previsto <b>"+num(pv)+" t</b> · movimentado <b>"+num(mv)+" t</b> · saldo <b>"+num(pv - mv)+" t</b> ("+Math.min(100, Math.round(mv / pv * 100))+"%)."; }
  var acoes = k === "rascunhos"
    ? [{rot:"Salvar rascunho", sit:"rascunhos", toast:"Rascunho salvo."}, {rot:"Publicar no MEP", sit:"previstos", pri:1, toast:"Publicado no MEP."}]
    : [{rot:"Salvar alterações", sit:k, pri:1, toast:"Alterações salvas."}];
  var rod = "";
  if(s.rec.id){ rod += '<button class="btn ghost" id="fhist" type="button">Histórico</button>'; }
  var back = destinosVoltar(s); if(back.length) rod += '<button class="btn ghost" id="fvolta" type="button">'+(k === "previstos" && !EDIT.admin ? "Voltar para rascunho" : "Voltar etapa…")+'</button>';
  rod += '<span class="sp"></span>';
  var d = abrirForm({s:s, titulo:k === "rascunhos" ? "Rascunho" : "Editar embarcação", sub:nomeNegrito(s) + " · " + esc(s.rec.situacao), para:k, blocos:blocos, acoes:acoes, rodape:rod, preValidar:opts.preValidar || (k === "rascunhos" ? "previstos" : "")});
  if(d){ var h = d.querySelector("#fhist"); if(h) h.onclick = function(){ openHist(s); }; var v = d.querySelector("#fvolta"); if(v) v.onclick = function(){ d.close(); voltar(s); }; }
}
function avancar(s, tipo){
  var k = sitKey(s), cfg = {s:s, avanco:true, sub:nomeNegrito(s) + (s.cais ? " · berço " + esc(s.cais) : "")};
  if(tipo === "fundear"){ cfg.titulo = "Confirmar chegada"; cfg.para = "fundeados"; cfg.blocos = [bloco("fundeio", "fundeados")]; cfg.acoes = [{rot:"Confirmar chegada", sit:"fundeados", pri:1, toast:"Chegada confirmada."}]; }
  else if(tipo === "atracar"){ cfg.titulo = "Registrar atracação"; cfg.para = "atracados"; cfg.blocos = [bloco("atracacao", "atracados")]; cfg.acoes = [{rot:"Registrar atracação", sit:"atracados", pri:1, toast:"Atracação registrada."}]; }
  else if(tipo === "desatracar"){
    cfg.titulo = "Registrar desatracação"; cfg.para = "desatracados"; var b = bloco("desatracacao", "desatracados");
    if(ehServico(s.rec.operacao)) b.secs[0].c = b.secs[0].c.filter(function(f){ return f[0] !== "ton_movimentada"; });
    cfg.blocos = [b]; cfg.acoes = [{rot:"Registrar desatracação", sit:"desatracados", pri:1, toast:"Desatracação registrada."}];
  }
  else if(tipo === "operacao"){
    cfg.titulo = "Atualizar operação"; cfg.para = "atracados"; cfg.avanco = false; var b2 = bloco("operacao", "atracados");
    var pv = +s.rec.ton_prevista || 0, mv = +s.rec.ton_movimentada || 0;
    if(ehServico(s.rec.operacao)) b2.secs[0].c = b2.secs[0].c.filter(function(f){ return f[0] !== "ton_movimentada"; });
    else if(pv > 0) b2.info = "Previsto <b>"+num(pv)+" t</b> · movimentado <b>"+num(mv)+" t</b> · saldo <b>"+num(pv - mv)+" t</b> ("+Math.min(100, Math.round(mv / pv * 100))+"%).";
    cfg.blocos = [b2]; cfg.acoes = [{rot:"Salvar operação", sit:"atracados", pri:1, toast:"Operação atualizada."}];
  }
  abrirForm(cfg);
}
function destinosVoltar(s){
  var k = sitKey(s);
  if(EDIT.admin) return SITS.filter(function(x){ return ORDEM[x[0]] < ORDEM[k]; });
  if(k === "previstos" && tem("previsao")) return SITS.filter(function(x){ return x[0] === "rascunhos"; });
  return [];
}
function voltar(s){
  var op = destinosVoltar(s); if(!op.length) return;
  var d = dlg('<h2>Voltar etapa</h2><p>'+nomeNegrito(s)+' está em <b>'+esc(s.rec.situacao)+'</b>. Os dados já preenchidos ficam guardados.</p><div class="fg one"><label class="w"><span>Voltar para</span><select id="vsel">'+op.map(function(x){ return '<option value="'+x[0]+'">'+esc(x[2])+'</option>'; }).join("")+'</select></label></div><p class="nota" id="vnota"></p><div class="msg" id="vmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="vgo" type="button">Voltar etapa</button></div>');
  function nota(){ var v = E("vsel").value; E("vnota").textContent = v === "rascunhos" ? "Deixa de aparecer para o público no MEP." : ""; }
  E("vsel").onchange = nota; nota();
  E("vgo").onclick = function(){
    var sit = SITS.filter(function(x){ return x[0] === E("vsel").value; })[0];
    E("vgo").disabled = true; say("vmsg", "Salvando…");
    post({acao:"salvar", registro:{id:s.id, situacao:sit[1], versao:s.rec.atualizado_em}}).then(function(){ d.close(); state.tab = sit[0]; toast("Voltou para " + sit[1] + "."); refresh(); },
      function(e){ E("vgo").disabled = false; say("vmsg", e.message, true); });
  };
}
function openHist(s){
  var d = dlg('<h2>Histórico</h2><p><b>'+esc(s.navio)+'</b></p><div id="hl" class="hist">Carregando…</div><div class="btns"><button class="btn" data-x type="button">Fechar</button></div>');
  post({acao:"historico", id:s.id}).then(function(j){
    E("hl").innerHTML = j.itens.length ? j.itens.map(function(i){ return '<div class="hi"><b>'+esc(i.em)+'</b> · '+esc(i.usuario)+' · '+esc(i.acao)+(i.resumo ? '<br><span>'+esc(i.resumo)+'</span>' : "")+'</div>'; }).join("") : "Nenhum registro ainda.";
  }, function(e){ E("hl").textContent = e.message; });
}
function askDel(s){
  var rasc = sitKey(s) === "rascunhos";
  var d = dlg('<h2>'+(rasc ? "Descartar rascunho?" : "Excluir embarcação?")+'</h2><p><b>'+esc(s.navio)+'</b> será removida do banco. Não dá para desfazer.'+(rasc ? "" : ' (Para só encerrar, registre a desatracação.)')+'</p><div class="msg" id="dmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn dng" id="dgo" type="button">'+(rasc ? "Descartar" : "Excluir")+'</button></div>');
  E("dgo").onclick = function(){
    E("dgo").disabled = true; say("dmsg", "Excluindo…");
    post({acao:"excluir", id:s.id, versao:s.rec.atualizado_em, navio:s.navio})
      .then(function(){ d.close(); toast(rasc ? "Rascunho descartado." : "Embarcação excluída."); refresh(); }, function(e){ E("dgo").disabled = false; say("dmsg", e.message, true); });
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
  E("btn-new").onclick = abrirNovo;
  E("btn-aviso").onclick = openAviso;
  E("btn-pw").onclick = openSenha;
  E("btn-usu").onclick = openUsuarios;
  E("btn-out").onclick = function(){ sair(); };
  E("panel").addEventListener("click", function(e){
    var b = e.target.closest("[data-act]"); if(!b) return;
    var s = findItem(b.getAttribute("data-id")); if(!s) return;
    var a = b.getAttribute("data-act");
    if(a === "editar") editar(s, {preValidar:sitKey(s) === "rascunhos" ? "previstos" : ""});
    else if(a === "excluir") askDel(s);
    else avancar(s, a);
  });
  var tk; try{ tk = sessionStorage.getItem("lu_t"); }catch(x){}
  if(tk){ EDIT.token = tk; post({acao:"sessao"}).then(function(j){ entrou(j); }, function(){ EDIT.token = ""; try{ sessionStorage.removeItem("lu_t"); }catch(x){} }); }
});
