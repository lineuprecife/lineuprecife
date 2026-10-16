/* Modo edição do Line-up: entrar com senha, adicionar, editar, mover e excluir navios.
   Este arquivo carrega ANTES do app.js; tudo aqui só roda depois que a página abre. */
var EDIT = {on:false, senha:"", nome:""};
var FIELDS = [
  {k:"navio",l:"Nome do navio",w:1},
  {k:"cais",l:"Cais",t:"cais"},
  {k:"mod",l:"Operação",t:"mod"},
  {k:"carga",l:"Carga"},
  {k:"origem",l:"Origem / destino"},
  {k:"agencia",l:"Agência"},
  {k:"operador",l:"Operador"},
  {k:"chegada",l:"Chegada",t:"dt"},
  {k:"saida",l:"Saída",t:"dt"},
  {k:"prev",l:"Toneladas previstas",t:"num"},
  {k:"mov",l:"Toneladas já movimentadas",t:"num"},
  {k:"comp",l:"Comprimento (m)"},
  {k:"calado",l:"Calado (m)"},
  {k:"cbo",l:"CBO"},
  {k:"imo",l:"IMO"},
  {k:"anterior",l:"Porto anterior"}
];
var SITS = [["previstos","Previsto (ainda não chegou)"],["fundeados","Fundeado (esperando no mar)"],["atracados","Atracado (no cais)"],["desatracados","Desatracado (já saiu)"]];

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
function dtOut(v){ var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v||""); return m ? m[3]+"/"+m[2]+"/"+m[1]+" "+m[4]+":"+m[5]+":00" : ""; }
function dlg(html){
  var d = document.createElement("dialog");
  d.innerHTML = html; document.body.appendChild(d);
  d.addEventListener("close", function(){ d.remove(); });
  d.addEventListener("click", function(e){ if(e.target.hasAttribute("data-x")) d.close(); });
  d.showModal(); return d;
}

/* Leitura pelo Apps Script (uma só requisição traz as quatro abas) */
function refreshApi(){
  return fetch(CONFIG.api, {cache:"no-store"}).then(function(r){ return r.json(); }).then(function(j){
    TABS.forEach(function(t){
      var c = CONFIG.tabs[t.id], r = mapRows((j.tabs && j.tabs[c.sheet]) || [], c.layout);
      if(j.atualizado) r.atualizado = j.atualizado;
      data[t.id] = r; errors[t.id] = false;
    });
    var d = new Date(); lastOk = p2(d.getHours())+":"+p2(d.getMinutes());
  }).catch(function(){ TABS.forEach(function(t){ errors[t.id] = true; }); }).then(renderAll);
}

/* Linhas ganham botões quando o modo edição está ligado */
function row(s, lista){
  var h = rowBase(s, lista);
  if(!EDIT.on) return h;
  var id = lista+":"+s.row;
  return h.replace(/<\/div>$/, '<div class="acts"><button class="btn" type="button" data-ed="'+id+'">✏️ Editar / mover</button><button class="btn dng" type="button" data-del="'+id+'">Excluir</button></div></div>');
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

function openForm(tab, s){
  var L0 = LAYOUTS[CONFIG.tabs[tab].layout], raw = s ? s.raw : [];
  var html = '<h2>'+(s ? "Editar navio" : "Novo navio")+'</h2><div class="fg"><label class="w"><span>Situação (para mover o navio de lista, mude aqui)</span><select id="f_sit">'+
    SITS.map(function(x){ return '<option value="'+x[0]+'"'+(x[0]===tab?" selected":"")+'>'+x[1]+'</option>'; }).join("")+'</select></label>';
  FIELDS.forEach(function(f){
    var v = L0[f.k] != null ? String(raw[L0[f.k]] || "").trim() : "", c;
    if(v.toUpperCase() === "N/I") v = "";
    if(f.t === "dt") c = '<input type="datetime-local" id="f_'+f.k+'" value="'+dtIn(v)+'">';
    else if(f.t === "cais"){
      var o = [""]; for(var i=2;i<=9;i++) o.push(String(i)); if(v && o.indexOf(v)<0) o.push(v);
      c = '<select id="f_cais">'+o.map(function(x){ return '<option value="'+esc(x)+'"'+(x===v?" selected":"")+'>'+(x ? "Cais "+esc(x) : "Sem cais")+'</option>'; }).join("")+'</select>';
    } else if(f.t === "mod"){
      c = '<select id="f_mod">'+[["","Não informada"],["IMPORTAÇÃO","Importação"],["EXPORTAÇÃO","Exportação"]].map(function(x){ return '<option value="'+x[0]+'"'+(x[0]===v.toUpperCase()?" selected":"")+'>'+x[1]+'</option>'; }).join("")+'</select>';
    } else c = '<input id="f_'+f.k+'"'+(f.t==="num"?' inputmode="numeric"':"")+' value="'+esc(v)+'">';
    html += '<label data-k="'+f.k+'"'+(f.w?' class="w"':"")+'><span>'+f.l+'</span>'+c+'</label>';
  });
  var d = dlg(html+'</div><div class="msg" id="fmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn pri" id="fgo" type="button">Salvar</button></div>');
  var ini = {}; FIELDS.forEach(function(f){ ini[f.k] = E("f_"+f.k).value; });
  function vis(){
    var L = LAYOUTS[CONFIG.tabs[E("f_sit").value].layout];
    Array.prototype.forEach.call(d.querySelectorAll("label[data-k]"), function(l){ l.hidden = L[l.getAttribute("data-k")] == null; });
  }
  vis(); E("f_sit").onchange = vis;

  E("fgo").onclick = function(){
    var sit = E("f_sit").value, L = LAYOUTS[CONFIG.tabs[sit].layout], same = !!s && sit === tab, cel = {}, bad = "";
    var navio = E("f_navio").value.trim();
    if(!navio) bad = "Escreva o nome do navio.";
    else if(!E("f_chegada").value) bad = "Informe a data e a hora de chegada.";
    else if(sit === "atracados" && !E("f_cais").value) bad = "Escolha o cais onde o navio está atracado.";
    if(bad){ say("fmsg", bad, true); return; }
    FIELDS.forEach(function(f){
      if(L[f.k] == null) return;
      if(same && E("f_"+f.k).value === ini[f.k]) return;   /* só envia o que mudou */
      var x = E("f_"+f.k).value.trim();
      if(f.t === "dt") x = dtOut(x);
      else if(f.t === "num") x = x.replace(/\D/g, "");
      else if(!x && f.t !== "cais" && f.t !== "mod") x = "N/I";
      cel[L[f.k]] = x;
    });
    if(same && !Object.keys(cel).length){ d.close(); return; }
    var body;
    if(!s) body = {acao:"add", aba:CONFIG.tabs[sit].sheet, celulas:cel};
    else {
      body = {acao:same?"update":"move", aba:CONFIG.tabs[tab].sheet, linha:s.row, celulas:cel, expect:{col:L0.navio, val:String(raw[L0.navio] || "")}};
      if(!same) body.destino = CONFIG.tabs[sit].sheet;
    }
    body.navio = navio;
    E("fgo").disabled = true; say("fmsg", "Salvando…");
    post(body).then(function(){ d.close(); state.tab = sit; toast("Salvo."); refresh(); },
      function(e){ E("fgo").disabled = false; say("fmsg", e.message, true); });
  };
}

function askDel(tab, s){
  var d = dlg('<h2>Excluir navio?</h2><p><b>'+esc(s.navio)+'</b> será removido da lista. Não dá para desfazer.</p><div class="msg" id="dmsg"></div><div class="btns"><button class="btn" data-x type="button">Cancelar</button><button class="btn dng" id="dgo" type="button">Excluir</button></div>');
  E("dgo").onclick = function(){
    var L = LAYOUTS[CONFIG.tabs[tab].layout];
    E("dgo").disabled = true; say("dmsg", "Excluindo…");
    post({acao:"delete", aba:CONFIG.tabs[tab].sheet, linha:s.row, expect:{col:L.navio, val:String(s.raw[L.navio] || "")}, navio:s.navio})
      .then(function(){ d.close(); toast("Navio excluído."); refresh(); },
        function(e){ E("dgo").disabled = false; say("dmsg", e.message, true); });
  };
}

window.addEventListener("load", function(){
  if(!CONFIG.api) return;
  E("btn-login").hidden = false;
  E("btn-login").onclick = openLogin;
  E("btn-new").onclick = function(){ openForm(state.tab); };
  E("btn-out").onclick = function(){ EDIT.on = false; EDIT.senha = ""; try{ sessionStorage.removeItem("lu"); }catch(x){} setMode(); };
  E("panel").addEventListener("click", function(e){
    var b = e.target.closest("[data-ed],[data-del]"); if(!b) return;
    var id = (b.getAttribute("data-ed") || b.getAttribute("data-del")).split(":");
    var s = listOf(id[0]).filter(function(x){ return String(x.row) === id[1]; })[0];
    if(!s) return;
    if(b.hasAttribute("data-ed")) openForm(id[0], s); else askDel(id[0], s);
  });
  var pw; try{ pw = sessionStorage.getItem("lu"); }catch(x){}
  if(pw){ EDIT.senha = pw; post({acao:"check"}).then(function(j){ EDIT.on = true; EDIT.nome = j.nome; setMode(); }, function(){ EDIT.senha = ""; }); }
});
