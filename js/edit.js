/* Modo edição do Line-up: entrar com senha, adicionar, editar, mover (mudando a situação) e excluir navios.
   Este arquivo carrega ANTES do app.js; tudo aqui só roda depois que a página abre. */
var EDIT = {on:false, senha:"", nome:""}, AVISO = "";
var SITS = [["previstos","Previsto","Previsto (ainda não chegou)"],["fundeados","Fundeado","Fundeado (esperando no mar)"],["atracados","Atracado","Atracado (no cais)"],["desatracados","Desatracado","Desatracado (já saiu)"]];
var FIELDS = [
  {k:"navio",l:"Nome do navio",w:1},
  {k:"cais",l:"Cais",t:"cais"},
  {k:"operacao",l:"Operação",t:"op"},
  {k:"carga",l:"Carga (ou serviço)"},
  {k:"origem_destino",l:"Origem / destino da carga"},
  {k:"agencia",l:"Agência"},
  {k:"operador",l:"Operador"},
  {k:"chegada",l:"Chegada",t:"dt"},
  {k:"saida",l:"Saída",t:"dt"},
  {k:"ton_prevista",l:"Toneladas previstas",t:"num"},
  {k:"ton_movimentada",l:"Toneladas já movimentadas",t:"num"},
  {k:"comprimento",l:"Comprimento (m)",t:"dec"},
  {k:"calado",l:"Calado (m)",t:"dec"},
  {k:"cbo",l:"CBO"},
  {k:"imo",l:"IMO"},
  {k:"porto_anterior",l:"Porto anterior"},
  {k:"proximo_porto",l:"Próximo porto"}
];

function E(id){ return document.getElementById(id); }
function toast(t, bad){
  var el = E("toast");
  if(!el){ el = document.createElement("div"); el.id = "toast"; el.setAttribute("role","status"); document.body.appendChild(el); }
  el.textContent = t; el.className = bad ? "bad" : ""; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(function(){ el.hidden = true; }, 3500);
}
function say(id, t, bad){ var m = E(id); m.textContent = t; m.className = "msg" + (bad ? " bad" : ""); }
function post(b){
  b.senha = EDIT.senha;
  return fetch(CONFIG.api, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(b)})
    .then(function(r){ return r.json(); }, function(){ throw new Error("Sem conexão. Tente de novo."); })
    .then(function(j){ if(!j.ok) throw new Error(j.erro || "Não deu certo."); return j; });
}
function dtIn(s){ var m = /^(\d\d)\/(\d\d)\/(\d{4})(?: (\d\d):(\d\d))?/.exec(s||""); return m ? m[3]+"-"+m[2]+"-"+m[1]+"T"+(m[4]||"00")+":"+(m[5]||"00") : ""; }
function dtOut(v){ var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v||""); return m ? m[3]+"/"+m[2]+"/"+m[1]+" "+m[4]+":"+m[5] : ""; }
function dlg(html){
  var d = document.createElement("dialog");
  d.innerHTML = html; document.body.appendChild(d);
  d.addEventListener("close", function(){ d.remove(); });
  d.addEventListener("click", function(e){ if(e.target.hasAttribute("data-x")) d.close(); });
  d.showModal(); return d;
}

/* ---- Leitura: uma requisição traz todos os navios; a situação decide em qual lista cada um aparece ---- */
function toItem(r){
  var n = function(x){ return x === "" || x == null ? 0 : Number(x) || 0; };
  var m = function(x){ return x === "" || x == null ? "" : String(x).replace(".", ",") + " m"; };
  var s = {id:r.id, rec:r, chegada:r.chegada||"", saida:r.saida||"", cais:String(r.cais||""), navio:String(r.navio||""),
    cbo:r.cbo||"", imo:r.imo||"", comp:m(r.comprimento), calado:m(r.calado), agencia:r.agencia||"", operador:r.operador||"",
    carga:r.carga||"", mod:String(r.operacao||"").toUpperCase(), origem:r.origem_destino||"", anterior:r.porto_anterior||"",
    prev:n(r.ton_prevista), mov:n(r.ton_movimentada), tipo:""};
  if(s.mod === "SEM CARGA"){ s.tipo = cap(s.carga) || "Serviço"; s.mod = ""; }
  return s;
}
function ord(id, a, b){
  var da = parseDate(a.chegada), db = parseDate(b.chegada); da = da ? +da : 0; db = db ? +db : 0;
  if(id === "atracados") return (parseInt(a.cais,10)||99) - (parseInt(b.cais,10)||99) || da - db;
  if(id === "desatracados"){ var sa = parseDate(a.saida), sb = parseDate(b.saida); return (sb ? +sb : 0) - (sa ? +sa : 0); }
  return da - db;
}
function refreshApi(){
  return fetch(CONFIG.api, {cache:"no-store"}).then(function(r){ return r.json(); }).then(function(j){
    AVISO = j.aviso || "";
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

/* ---- Botões nas linhas quando o modo edição está ligado ---- */
function row(s, lista){
  var h = rowBase(s, lista);
  if(!EDIT.on) return h;
  return h.replace(/<\/div>$/, '<div class="acts"><button class="btn" type="button" data-ed="'+esc(s.id)+'">✏️ Editar / mover</button><button class="btn dng" type="button" data-del="'+esc(s.id)+'">Excluir</button></div></div>');
}
function setMode(){
  E("editbar").hidden = !EDIT.on; E("btn-login").hidden = EDIT.on;
  E("who").textContent = "Modo edição" + (EDIT.nome && EDIT.nome !== "Coordenador" ? " · " + EDIT.nome : "");
  renderPanel();
}

function openLogin(){
  var d = dlg('<h2>Entrar para editar</h2><p>Digite a senha dos coordenadores.</p><input type="password" id="pw" autocomplete="current-password" aria-label="Senha"><div class="msg" id="lmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="lgo" type="button">Entrar</button></div>');
  function go(){
    var pw = E("pw").value; if(!pw) return;
    E("lgo").disabled = true; say("lmsg","Verificando…"); EDIT.senha = pw;
    post({acao:"check"}).then(function(j){
      EDIT.on = true; EDIT.nome = j.nome;
      try{ sessionStorage.setItem("lu", pw); }catch(x){}
      d.close(); setMode(); toast("Modo edição ligado.");
    }, function(e){ EDIT.senha = ""; E("lgo").disabled = false; say("lmsg", e.message, true); });
  }
  E("lgo").onclick = go;
  E("pw").onkeydown = function(e){ if(e.key === "Enter") go(); };
  E("pw").focus();
}

function openForm(s){
  var rec = s ? s.rec : {}, atual = s ? SITS.filter(function(x){ return x[1] === rec.situacao; })[0][0] : state.tab;
  var html = '<h2>'+(s ? "Editar navio" : "Novo navio")+'</h2><div class="fg"><label class="w"><span>Situação (para mover o navio de lista, mude aqui)</span><select id="f_sit">'+
    SITS.map(function(x){ return '<option value="'+x[0]+'"'+(x[0]===atual?" selected":"")+'>'+x[2]+'</option>'; }).join("")+'</select></label>';
  FIELDS.forEach(function(f){
    var v = rec[f.k] == null ? "" : String(rec[f.k]), c;
    if(f.t === "dec") v = v.replace(".", ",");
    if(f.t === "dt") c = '<input type="datetime-local" id="f_'+f.k+'" value="'+dtIn(v)+'">';
    else if(f.t === "cais"){
      var o = [""]; for(var i=2;i<=9;i++) o.push(String(i)); if(v && o.indexOf(v)<0) o.push(v);
      c = '<select id="f_cais">'+o.map(function(x){ return '<option value="'+esc(x)+'"'+(x===v?" selected":"")+'>'+(x ? "Cais "+esc(x) : "Sem cais")+'</option>'; }).join("")+'</select>';
    } else if(f.t === "op"){
      c = '<select id="f_operacao">'+[["","Não informada"],["IMPORTAÇÃO","Importação"],["EXPORTAÇÃO","Exportação"],["SEM CARGA","Sem carga (serviço, apreensão…)"]].map(function(x){ return '<option value="'+x[0]+'"'+(x[0]===v?" selected":"")+'>'+x[1]+'</option>'; }).join("")+'</select>';
    } else c = '<input id="f_'+f.k+'"'+(f.t==="num"?' inputmode="numeric"':f.t==="dec"?' inputmode="decimal"':"")+' value="'+esc(v)+'">';
    html += '<label'+(f.w?' class="w"':"")+'><span>'+f.l+'</span>'+c+'</label>';
  });
  var d = dlg(html+'</div><div class="msg" id="fmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="fgo" type="button">Salvar</button></div>');
  E("fgo").onclick = function(){
    var sit = SITS.filter(function(x){ return x[0] === E("f_sit").value; })[0], reg = {id:s ? s.id : "", situacao:sit[1], versao:s ? rec.atualizado_em : undefined}, bad = "";
    FIELDS.forEach(function(f){
      var x = E("f_"+f.k).value.trim();
      reg[f.k] = f.t === "dt" ? dtOut(x) : f.t === "num" ? x.replace(/\D/g, "") : x;
    });
    if(!reg.navio) bad = "Escreva o nome do navio.";
    else if(!reg.chegada) bad = "Informe a data e a hora de chegada.";
    else if(sit[0] === "atracados" && !reg.cais) bad = "Escolha o cais onde o navio está atracado.";
    if(bad){ say("fmsg", bad, true); return; }
    E("fgo").disabled = true; say("fmsg", "Salvando…");
    post({acao:"salvar", registro:reg}).then(function(){ d.close(); state.tab = sit[0]; toast("Salvo."); refresh(); },
      function(e){ E("fgo").disabled = false; say("fmsg", e.message, true); });
  };
}

function askDel(s){
  var d = dlg('<h2>Excluir navio?</h2><p><b>'+esc(s.navio)+'</b> será removido do banco. Não dá para desfazer. (Para só tirar da lista, mude a situação para "Desatracado".)</p><div class="msg" id="dmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn dng" id="dgo" type="button">Excluir</button></div>');
  E("dgo").onclick = function(){
    E("dgo").disabled = true; say("dmsg", "Excluindo…");
    post({acao:"excluir", id:s.id, versao:s.rec.atualizado_em, navio:s.navio})
      .then(function(){ d.close(); toast("Navio excluído."); refresh(); }, function(e){ E("dgo").disabled = false; say("dmsg", e.message, true); });
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
  E("btn-out").onclick = function(){ EDIT.on = false; EDIT.senha = ""; try{ sessionStorage.removeItem("lu"); }catch(x){} setMode(); };
  E("panel").addEventListener("click", function(e){
    var b = e.target.closest("[data-ed],[data-del]"); if(!b) return;
    var s = findItem(b.getAttribute("data-ed") || b.getAttribute("data-del")); if(!s) return;
    if(b.hasAttribute("data-ed")) openForm(s); else askDel(s);
  });
  var pw; try{ pw = sessionStorage.getItem("lu"); }catch(x){}
  if(pw){ EDIT.senha = pw; post({acao:"check"}).then(function(j){ EDIT.on = true; EDIT.nome = j.nome; setMode(); }, function(){ EDIT.senha = ""; }); }
});
