/* =====================================================================
   LINE-UP RECIFE — SERVIDOR (Google Apps Script, preso à planilha)
   - Cada pessoa entra com seu próprio login e senha.
   - Cada pessoa tem uma ou mais ETAPAS: previsão, ao largo, atracação, movimentação, desatracação.
     Mais de uma pessoa pode ter a mesma etapa.
   - Quem não tem a etapa não consegue criar nem alterar aquela parte (o servidor confere, não só a tela).
   - Toda alteração fica registrada na aba LOG (quem, quando, o que mudou).
   - A página pública só recebe os dados públicos; observações, prático, rebocadores etc. só aparecem para quem entrou.
   Instalação: veja o passo a passo enviado junto (Extensões > Apps Script > colar este arquivo).
   ===================================================================== */

var ABA = 'BANCO', ABA_USU = 'USUARIOS', ABA_LOG = 'LOG';
var SIT = {previstos: 'Previsto', fundeados: 'Fundeado', atracados: 'Atracado', desatracados: 'Desatracado'};
var ETAPA_DA_SIT = {previstos: 'previsao', fundeados: 'fundeio', atracados: 'atracacao', desatracados: 'desatracacao'};
var ETAPA_NOME = {previsao: 'Previsão', fundeio: 'Ao largo', atracacao: 'Atracação', movimentacao: 'Movimentação', desatracacao: 'Desatracação'};

/* Colunas da aba BANCO: [chave, cabeçalho padrão, padrão do cabeçalho (sem acento, minúsculo)].
   Colunas que já existem na sua planilha são reaproveitadas pelo nome; as que faltam são criadas no fim. */
var COLS = [
  ['id', 'ID', /^id$/],
  ['situacao', 'Situação', /^situacao$/],
  ['navio', 'Navio', /^navio|embarcac/],
  ['nacionalidade', 'Bandeira / Porto de Matrícula', /^bandeira|^matricula|^nacionalidade/],
  ['imo', 'IMO', /^imo$/],
  ['cbo', 'CBO', /^cbo$/],
  ['comprimento', 'Compr.', /^compr/],
  ['calado', 'Calado', /^calado(?! (proa|popa))/],
  ['calado_proa', 'Calado Proa', /^calado proa/],
  ['calado_popa', 'Calado Popa', /^calado popa/],
  ['agencia', 'Agência de Navegação', /^agencia/],
  ['operador', 'Operador Portuário', /^operador/],
  ['carga', 'Carga', /^carga$/],
  ['operacao', 'Modalidade', /^modalidade/],
  ['origem_destino', 'Procedência / Destino da Carga', /^proced|^destino/],
  ['porto_anterior', 'Porto Anterior', /^porto anterior/],
  ['proximo_porto', 'Próximo Porto', /^proximo porto/],
  ['prev_chegada', 'Previsão de Chegada', /^previsao de chegada/],
  ['chegada_conf', 'Chegada confirmada', /^chegada confirmada/],
  ['prev_atrac', 'Previsão de Atracação', /^previsao de atracacao/],
  ['atrac', 'Atracação', /^atracacao$|^chegada$/],
  ['prev_saida', 'Previsão Desatracação', /^previsao (de )?(desatracacao|saida)/],
  ['desatrac', 'Desatracação', /^desatracacao$|^saida$/],
  ['prev_cais', 'Previsão de Cais', /^previsao de cais/],
  ['cais', 'Cais Atracado', /^cais atracado|^cais$/],
  ['ton_prev', 'Tonelagem Prevista', /^tonelagem prevista/],
  ['ton_mov', 'Tonelagem Movimentada', /^tonelagem movimentada/],
  ['saldo', 'Saldo', /^saldo$/],
  ['ton_final', 'Tonelagem final', /^tonelagem final/],
  ['bordo', 'Bordo de Atracação', /^bordo/],
  ['hora_pratico', 'Hora Prático', /^hora pratico/],
  ['hora_amarracao', 'Hora Amarração', /^hora amarracao/],
  ['inicio_manobra', 'Início Manobra', /^inicio manobra/],
  ['termino_manobra', 'Término Manobra', /^termino manobra/],
  ['cabecos', 'Cabeços', /^cabecos/],
  ['pratico', 'Prático', /^pratico$/],
  ['rebocadores', 'Rebocadores', /^rebocadores/],
  ['observacoes', 'Observações', /^observac/],
  ['nr_livro', 'Nº Livro', /^(n|no|num|numero)\b.*livro/],
  ['reg_alt', 'Registro alterado em', /^registro alterado em/],
  ['atualizado_por', 'Atualizado por', /^atualizado por/],
  ['aba_origem', 'Aba de origem', /^aba de origem/]
];
var DATAS = ['prev_chegada', 'chegada_conf', 'prev_atrac', 'atrac', 'prev_saida', 'desatrac'];
var HORAS = ['hora_pratico', 'hora_amarracao', 'inicio_manobra', 'termino_manobra'];
var NUMS = ['comprimento', 'calado', 'calado_proa', 'calado_popa', 'ton_prev', 'ton_mov', 'ton_final', 'saldo'];

/* Campos como a página os conhece (iguais aos do formulário) e quem pode mexer em cada grupo. */
var G_IDENT = ['navio', 'nacionalidade', 'imo', 'cbo', 'comprimento', 'calado', 'agencia', 'operador', 'carga', 'operacao', 'origem_destino', 'porto_anterior', 'proximo_porto', 'ton_prevista', 'nr_livro', 'observacoes'];
var G_DATAS = ['chegada', 'previsao_atracacao', 'saida', 'cais'];
var G_MANOBRA = ['hora_pratico', 'hora_amarracao', 'inicio_manobra', 'termino_manobra', 'bordo', 'calado_proa', 'calado_popa', 'cabecos', 'pratico', 'rebocadores'];
var G_MOV = ['ton_movimentada'];
var TODOS = G_IDENT.concat(G_DATAS, G_MANOBRA, G_MOV);
var CAMPOS_ETAPA = {
  previsao: G_IDENT.concat(G_DATAS),
  fundeio: G_IDENT.concat(G_DATAS),
  atracacao: TODOS,
  movimentacao: ['ton_movimentada', 'observacoes'],      /* só em embarcação atracada */
  desatracacao: ['saida', 'ton_movimentada', 'observacoes']
};
var INTERNOS = ['nacionalidade', 'calado_proa', 'calado_popa', 'bordo', 'cabecos', 'pratico', 'rebocadores', 'observacoes', 'nr_livro', 'hora_pratico', 'hora_amarracao', 'inicio_manobra', 'termino_manobra'];
var ROTULO = {navio: 'Nome da embarcação', nacionalidade: 'Bandeira / porto de matrícula', imo: 'IMO', cbo: 'CBO', comprimento: 'Comprimento', calado: 'Calado máximo', agencia: 'Agência', operador: 'Operador', carga: 'Carga', operacao: 'Operação', origem_destino: 'Origem / destino', porto_anterior: 'Porto anterior', proximo_porto: 'Próximo porto', ton_prevista: 'Toneladas previstas', nr_livro: 'Nº no livro', observacoes: 'Observações', chegada: 'Data de chegada / atracação', previsao_atracacao: 'Previsão de atracação (POB)', saida: 'Saída', cais: 'Berço', hora_pratico: 'Hora do prático', hora_amarracao: 'Hora da amarração', inicio_manobra: 'Início da manobra', termino_manobra: 'Término da manobra', bordo: 'Bordo de atracação', calado_proa: 'Calado proa', calado_popa: 'Calado popa', cabecos: 'Cabeços', pratico: 'Prático', rebocadores: 'Rebocadores', ton_movimentada: 'Toneladas movimentadas'};

/* ---------- utilidades ---------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function norm(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function erro(msg, codigo) { var e = new Error(msg); if (codigo) e.codigo = codigo; return e; }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sitDe(v) {
  var t = norm(v);
  if (SIT[t]) return t;
  if (/^previst|^programad/.test(t)) return 'previstos';
  if (/^fundead|^aguard|^ao largo/.test(t)) return 'fundeados';
  if (/^desatrac/.test(t)) return 'desatracados';
  if (/^atrac/.test(t)) return 'atracados';
  return '';
}
function toNum(v) {
  if (typeof v === 'number') return v;
  var s = String(v == null ? '' : v).trim().replace(/[^\d.,-]/g, ''); if (!s) return '';
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  var n = parseFloat(s); return isNaN(n) ? '' : n;
}
function fmtData(v) {
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, tz_(), 'dd/MM/yyyy HH:mm');
  v = String(v == null ? '' : v).trim();
  var m = /^(\d\d\/\d\d\/\d{4})(?:[ T](\d\d:\d\d))?/.exec(v);
  if (m) return m[1] + ' ' + (m[2] || '00:00');
  m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d:\d\d))?/.exec(v);
  return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + (m[4] || '00:00') : '';
}
function fmtHora(v) {
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, tz_(), 'HH:mm');
  var m = /(\d{1,2}):(\d\d)/.exec(String(v == null ? '' : v));
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}
function parseData(s) {
  var m = /^(\d\d)\/(\d\d)\/(\d{4})(?: (\d\d):(\d\d))?/.exec(String(s || '').trim());
  return m ? Utilities.parseDate(m[1] + '/' + m[2] + '/' + m[3] + ' ' + (m[4] || '00') + ':' + (m[5] || '00'), tz_(), 'dd/MM/yyyy HH:mm') : '';
}
function agora_() { return new Date().toISOString(); }

/* ---------- leitura da aba BANCO ---------- */
function layout_(criar) {
  var s = ss_().getSheetByName(ABA); if (!s) throw erro('Não achei a aba ' + ABA + ' na planilha.');
  var vals = s.getDataRange().getValues(), hdr = -1, h = [];
  for (var i = 0; i < Math.min(vals.length, 6); i++) {
    var t = vals[i].map(norm);
    if (t.indexOf('situacao') >= 0 && t.some(function (x) { return /^navio/.test(x); })) { hdr = i; h = t; break; }
  }
  if (hdr < 0) throw erro('A primeira linha da aba ' + ABA + ' precisa ter as colunas Situação e Navio.');
  var idx = {}, usados = {}, n = vals[hdr].length;
  COLS.forEach(function (c) {
    for (var j = 0; j < h.length; j++) if (!usados[j] && c[2].test(h[j])) { idx[c[0]] = j; usados[j] = 1; return; }
  });
  if (criar) COLS.forEach(function (c) {
    if (idx[c[0]] == null) { idx[c[0]] = n; s.getRange(hdr + 1, n + 1).setValue(c[1]); n++; }
  });
  return {sheet: s, vals: vals, hdr: hdr, idx: idx, n: n};
}
function ler_() {
  var L = layout_(true), s = L.sheet, I = L.idx, vals = L.vals;
  var itens = [], porId = {}, aviso = {texto: '', r: 0}, semId = [];
  for (var r = L.hdr + 1; r < vals.length; r++) {
    var row = vals[r], a = String(row[I.situacao] == null ? '' : row[I.situacao]).trim(), t = norm(a);
    if (t === 'aviso' || t === 'nota') { if (!aviso.r) { aviso.texto = String(row[I.situacao + 1] || '').trim(); aviso.r = r + 1; } continue; }
    var sit = sitDe(a); if (!sit || !String(row[I.navio] == null ? '' : row[I.navio]).trim()) continue;
    var o = {r: r + 1, sit: sit};
    COLS.forEach(function (c) { var v = row[I[c[0]]]; o[c[0]] = v == null ? '' : v; });
    if (!String(o.id).trim()) { o.id = Utilities.getUuid().replace(/-/g, '').slice(0, 12); semId.push(o); }
    itens.push(o); porId[o.id] = o;
  }
  if (semId.length) {   /* linhas digitadas à mão ganham um ID na primeira leitura (gravação única da coluna inteira) */
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var n0 = L.hdr + 1, col = [];
      for (var q = n0; q < vals.length; q++) col.push([vals[q][I.id] == null ? '' : vals[q][I.id]]);
      semId.forEach(function (o) { col[o.r - 1 - n0][0] = o.id; });
      s.getRange(n0 + 1, I.id + 1, col.length, 1).setValues(col);
    } finally { lock.releaseLock(); }
  }
  return {sheet: s, idx: I, n: L.n, hdr: L.hdr, itens: itens, porId: porId, aviso: aviso};
}
function paraApi_(o) {
  var sit = o.sit, prevL = sit === 'previstos' || sit === 'fundeados', desat = sit === 'desatracados';
  var d = function (k) { return fmtData(o[k]); }, n = function (k) { return toNum(o[k]); };
  return {
    id: String(o.id), situacao: SIT[sit], navio: String(o.navio).trim(), nacionalidade: String(o.nacionalidade), imo: String(o.imo), cbo: String(o.cbo),
    comprimento: n('comprimento'), calado: n('calado'), calado_proa: n('calado_proa'), calado_popa: n('calado_popa'),
    agencia: String(o.agencia), operador: String(o.operador), carga: String(o.carga), operacao: String(o.operacao), origem_destino: String(o.origem_destino),
    porto_anterior: String(o.porto_anterior), proximo_porto: String(o.proximo_porto),
    chegada: prevL ? (d('chegada_conf') || d('prev_chegada') || d('atrac')) : (d('atrac') || d('chegada_conf') || d('prev_chegada')),
    previsao_atracacao: d('prev_atrac'),
    saida: desat ? (d('desatrac') || d('prev_saida')) : d('prev_saida'),
    cais: caisTxt_(prevL ? vazio_(o.prev_cais) ? o.cais : o.prev_cais : vazio_(o.cais) ? o.prev_cais : o.cais),
    ton_prevista: n('ton_prev'), ton_movimentada: desat ? (n('ton_final') !== '' ? n('ton_final') : n('ton_mov')) : n('ton_mov'),
    hora_pratico: fmtHora(o.hora_pratico), hora_amarracao: fmtHora(o.hora_amarracao), inicio_manobra: fmtHora(o.inicio_manobra), termino_manobra: fmtHora(o.termino_manobra),
    bordo: String(o.bordo), cabecos: String(o.cabecos), pratico: String(o.pratico), rebocadores: String(o.rebocadores), observacoes: String(o.observacoes), nr_livro: String(o.nr_livro),
    atualizado_em: String(o.reg_alt || '')
  };
}
function vazio_(v) { return v === '' || v == null; }
function caisTxt_(v) { return vazio_(v) ? '' : (String(v).trim() === '0' ? '00-TA' : String(v).trim()); }   /* na planilha o berço 00-TA costuma estar como 0 */
function colDe_(k, sit) {   /* campo da página + situação -> coluna da planilha */
  switch (k) {
    case 'chegada': return sit === 'previstos' ? 'prev_chegada' : sit === 'fundeados' ? 'chegada_conf' : 'atrac';
    case 'saida': return sit === 'desatracados' ? 'desatrac' : 'prev_saida';
    case 'cais': return (sit === 'previstos' || sit === 'fundeados') ? 'prev_cais' : 'cais';
    case 'ton_movimentada': return sit === 'desatracados' ? 'ton_final' : 'ton_mov';
    case 'ton_prevista': return 'ton_prev';
    case 'previsao_atracacao': return 'prev_atrac';
  }
  return k;
}
function lista_(publico, dias) {
  var d = ler_(), ult = {}; try { ult = JSON.parse(PropertiesService.getScriptProperties().getProperty('ultimo') || '{}'); } catch (x) { }
  var lim = Date.now() - Math.max(1, Math.min(3650, +dias || 3650)) * 864e5, navios = [];
  d.itens.forEach(function (o) {
    if (o.sit === 'desatracados') { var dt = o.desatrac instanceof Date ? o.desatrac : (o.atrac instanceof Date ? o.atrac : null); if (dt && +dt < lim) return; }   /* histórico antigo fica na planilha, mas não vai para a página */
    var a = paraApi_(o);
    if (publico) INTERNOS.forEach(function (k) { delete a[k]; });
    Object.keys(a).forEach(function (k) { if (a[k] === '' || a[k] == null) delete a[k]; });   /* menos dados trafegando */
    navios.push(a);
  });
  return {ok: true, aviso: d.aviso.texto, atualizado: ult.em ? fmtData(new Date(ult.em)) : '', responsavel: ult.nome ? {nome: ult.nome, cargo: ult.cargo || ''} : null, navios: navios};
}
/* cache em pedaços (cada item do cache aceita ~100 KB) */
function cachePut_(chave, txt, seg) {
  var c = CacheService.getScriptCache(), n = Math.ceil(txt.length / 90000), o = {};
  if (n > 20) return;
  for (var i = 0; i < n; i++) o[chave + ':' + i] = txt.slice(i * 90000, (i + 1) * 90000);
  o[chave + ':n'] = String(n); c.putAll(o, seg);
}
function cacheGet_(chave) {
  var c = CacheService.getScriptCache(), n = +c.get(chave + ':n'); if (!n) return null;
  var ks = []; for (var i = 0; i < n; i++) ks.push(chave + ':' + i);
  var o = c.getAll(ks), t = ''; for (var j = 0; j < n; j++) { if (o[ks[j]] == null) return null; t += o[ks[j]]; }
  return t;
}
function cacheChave_(dias) { return 'pub' + (PropertiesService.getScriptProperties().getProperty('gen') || '0') + '_' + dias; }
function cacheLimpa_() { PropertiesService.getScriptProperties().setProperty('gen', String(Date.now())); }   /* a chave nova invalida o cache antigo */

/* ---------- usuários, senhas e sessões ---------- */
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function hash_(senha, salt) { return hex_(Utilities.computeHmacSha256Signature(String(senha), salt)); }
function novoHash_(senha) { var salt = Utilities.getUuid().replace(/-/g, ''); return salt + '$' + hash_(senha, salt); }
function confere_(senha, h) {
  var p = String(h || '').split('$'); if (p.length !== 2) return false;
  var x = hash_(senha, p[0]), ok = x.length === p[1].length, dif = 0;
  for (var i = 0; i < x.length && i < p[1].length; i++) dif |= x.charCodeAt(i) ^ p[1].charCodeAt(i);
  return ok && dif === 0;
}
function etapasDe_(txt) {
  var t = norm(txt), out = [];
  if (/todas/.test(t)) return ['previsao', 'fundeio', 'atracacao', 'movimentacao', 'desatracacao'];
  if (/previs|agend/.test(t)) out.push('previsao');
  if (/largo|fundeio|fundead/.test(t)) out.push('fundeio');
  if (/(^|[^a-z])atrac/.test(t)) out.push('atracacao');
  if (/moviment/.test(t)) out.push('movimentacao');
  if (/desatrac/.test(t)) out.push('desatracacao');
  return out;
}
function usuarios_() {
  var s = ss_().getSheetByName(ABA_USU), out = {}; if (!s) return out;
  var v = s.getDataRange().getValues();
  for (var r = 1; r < v.length; r++) {
    var lg = norm(v[r][0]); if (!lg) continue;
    out[lg] = {login: lg, nome: String(v[r][1] || lg).trim(), cargo: String(v[r][2] || '').trim(), email: String(v[r][3] || '').trim(), etapas: etapasDe_(v[r][4]),
      admin: /^s/.test(norm(v[r][5])), ativo: !/^n/.test(norm(v[r][6])), hash: String(v[r][7] || ''), r: r + 1};
  }
  return out;
}
function perfil_(u) { return {usuario: u.login, nome: u.nome, cargo: u.cargo, etapas: u.etapas, admin: u.admin}; }
function login_(b) {
  var cache = CacheService.getScriptCache(), lg = norm(b.usuario), fk = 'f:' + lg;
  if (+cache.get(fk) >= 5) throw erro('Muitas tentativas. Aguarde 10 minutos e tente de novo.');
  var u = usuarios_()[lg];
  if (!u || !u.ativo || !confere_(b.senha, u.hash)) { cache.put(fk, String((+cache.get(fk) || 0) + 1), 600); throw erro('Usuário ou senha incorretos.'); }
  cache.remove(fk);
  var tok = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('tk:' + tok, lg, 21600);
  log_(u, 'login', '', '', '', '');
  var p = perfil_(u); p.ok = true; p.token = tok; return p;
}
function auth_(token) {
  var cache = CacheService.getScriptCache(), lg = token ? cache.get('tk:' + token) : null;
  var u = lg ? usuarios_()[lg] : null;
  if (!u || !u.ativo) throw erro('Sua sessão expirou. Entre de novo.', 'sessao');
  cache.put('tk:' + token, lg, 21600);
  return u;
}
function alterarSenha_(u, b) {
  if (!confere_(b.atual, u.hash)) throw erro('A senha atual não confere.');
  if (String(b.nova || '').length < 6) throw erro('A nova senha precisa ter pelo menos 6 caracteres.');
  ss_().getSheetByName(ABA_USU).getRange(u.r, 8).setValue(novoHash_(b.nova));
  log_(u, 'trocou a senha', '', '', '', '');
  return {ok: true};
}

/* ---------- permissões ---------- */
function permissao_(u, sitAtual, sitNova) {
  if (u.admin) return {ok: true, todos: true};
  var tem = function (e) { return u.etapas.indexOf(e) >= 0; }, set = {};
  var add = function (e) { CAMPOS_ETAPA[e].forEach(function (k) { set[k] = 1; }); };
  var eNova = ETAPA_DA_SIT[sitNova];
  if (!sitAtual || sitAtual !== sitNova) {      /* criar, ou mover para outra situação: precisa ser responsável pela etapa de destino */
    if (!tem(eNova)) return {ok: false, motivo: 'Você não é responsável pela etapa "' + ETAPA_NOME[eNova] + '", por isso não pode ' + (sitAtual ? 'mover a embarcação para' : 'cadastrar embarcação em') + ' ' + SIT[sitNova] + '.'};
    add(eNova);
    if (sitAtual && tem(ETAPA_DA_SIT[sitAtual])) add(ETAPA_DA_SIT[sitAtual]);
  } else {
    if (tem(eNova)) add(eNova);
    if (sitNova === 'atracados' && tem('movimentacao')) add('movimentacao');
    if (!Object.keys(set).length) return {ok: false, motivo: 'Você não é responsável pela etapa "' + ETAPA_NOME[eNova] + '", por isso não pode alterar esta embarcação.'};
  }
  return {ok: true, set: set};
}

/* ---------- gravação ---------- */
function paraCelula_(k, v) {
  v = v == null ? '' : v;
  if (k === 'chegada' || k === 'saida' || k === 'previsao_atracacao') return parseData(v);
  if (G_MANOBRA.indexOf(k) >= 0 && /^hora|manobra$/.test(k)) return fmtHora(v);
  if (k === 'comprimento' || k === 'calado' || k === 'calado_proa' || k === 'calado_popa' || k === 'ton_prevista' || k === 'ton_movimentada') return toNum(v);
  return String(v).trim();
}
function normCampo_(k, v) {
  if (k === 'chegada' || k === 'saida' || k === 'previsao_atracacao') return fmtData(v);
  if (/^hora_|_manobra$/.test(k)) return fmtHora(v);
  if (k === 'comprimento' || k === 'calado' || k === 'calado_proa' || k === 'calado_popa' || k === 'ton_prevista' || k === 'ton_movimentada') { var n = toNum(v); return n === '' ? '' : String(n); }
  if (k === 'cais') return caisTxt_(v);
  return String(v == null ? '' : v).trim();
}
function gravarCelula_(s, r, col, ck, valor) {
  var rg = s.getRange(r, col + 1);
  if (DATAS.indexOf(ck) >= 0) rg.setNumberFormat('dd/MM/yyyy HH:mm'); else if (HORAS.indexOf(ck) >= 0) rg.setNumberFormat('@');
  rg.setValue(valor);
}
function colLetra_(n) { var t = ''; while (n > 0) { var m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); } return t; }
function salvar_(u, reg) {
  reg = reg || {};
  var sitNova = sitDe(reg.situacao); if (!sitNova) throw erro('Escolha a situação da embarcação.');
  var d = ler_(), I = d.idx, o = null, sitAtual = null;
  if (reg.id) {
    o = d.porId[reg.id]; if (!o) throw erro('Embarcação não encontrada (talvez outra pessoa a tenha excluído). Atualize a página.');
    if (String(reg.versao || '') !== String(o.reg_alt || '')) throw erro('Esta embarcação foi alterada' + (o.atualizado_por ? ' por ' + o.atualizado_por : '') + ' depois que você abriu o formulário. Feche, abra de novo e refaça a alteração.');
    sitAtual = o.sit;
  }
  var perm = permissao_(u, sitAtual, sitNova); if (!perm.ok) throw erro(perm.motivo);
  var atual = o ? paraApi_(o) : {}, mudouSit = !!(sitAtual && sitAtual !== sitNova), trocas = [], mexidos = [];
  TODOS.forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(reg, k)) return;
    var novo = normCampo_(k, reg[k]), velho = o ? normCampo_(k, atual[k]) : '';
    var forcar = mudouSit && (k === 'chegada' || k === 'saida' || k === 'cais' || k === 'ton_movimentada') && novo !== '' && String(o[colDe_(k, sitNova)]) === '';
    if (novo === velho && !forcar) return;
    if (!perm.todos && !perm.set[k]) throw erro('Você não tem permissão para alterar "' + ROTULO[k] + '" nesta etapa.');
    mexidos.push(k);
    if (novo !== velho) trocas.push(ROTULO[k] + ': ' + (velho || '—') + ' → ' + (novo || '—'));
  });
  var f = function (k) { return Object.prototype.hasOwnProperty.call(reg, k) ? String(reg[k] == null ? '' : reg[k]).trim() : String(atual[k] == null ? '' : atual[k]).trim(); };
  if (!f('navio')) throw erro('Escreva o nome da embarcação.');
  if (!o || mudouSit) {
    if (!f('chegada') && !(sitNova === 'desatracados' && f('saida'))) throw erro('Informe a data e a hora (previsão de chegada, chegada ou atracação).');
    if (sitNova === 'atracados' && !f('cais')) throw erro('Escolha o berço onde a embarcação está atracada.');
  }
  if (o && !mexidos.length && !mudouSit) return {ok: true, semMudanca: true};
  if (mudouSit) trocas.unshift('Situação: ' + SIT[sitAtual] + ' → ' + SIT[sitNova]);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var agora = agora_(), id = o ? o.id : Utilities.getUuid().replace(/-/g, '').slice(0, 12), s = d.sheet;
    if (o) {
      var chk = s.getRange(o.r, I.reg_alt + 1).getValue();
      if (String(chk || '') !== String(o.reg_alt || '')) throw erro('Outra pessoa acabou de alterar esta embarcação. Feche, abra de novo e refaça a alteração.');
      mexidos.forEach(function (k) { var ck = colDe_(k, sitNova); gravarCelula_(s, o.r, I[ck], ck, paraCelula_(k, reg[k])); });
      s.getRange(o.r, I.situacao + 1).setValue(SIT[sitNova]);
      if (mudouSit) s.getRange(o.r, I.aba_origem + 1).setValue(sitNova.toUpperCase());
      s.getRange(o.r, I.reg_alt + 1).setValue(agora); s.getRange(o.r, I.atualizado_por + 1).setValue(u.nome);
    } else {
      var arr = []; for (var i = 0; i < d.n; i++) arr.push('');
      arr[I.id] = id; arr[I.situacao] = SIT[sitNova]; arr[I.reg_alt] = agora; arr[I.atualizado_por] = u.nome;
      mexidos.forEach(function (k) { var ck = colDe_(k, sitNova); arr[I[ck]] = paraCelula_(k, reg[k]); });
      arr[I.aba_origem] = sitNova.toUpperCase();
      var cL = function (k) { return colLetra_(I[k] + 1); };
      s.appendRow(arr);
      var nr = s.getLastRow();
      s.getRange(nr, I.saldo + 1).setFormula('=IF(AND(ISNUMBER(' + cL('ton_prev') + nr + '),ISNUMBER(' + cL('ton_mov') + nr + ')),' + cL('ton_prev') + nr + '-' + cL('ton_mov') + nr + ',"")');
      mexidos.forEach(function (k) { var ck = colDe_(k, sitNova); if (DATAS.indexOf(ck) >= 0) s.getRange(nr, I[ck] + 1).setNumberFormat('dd/MM/yyyy HH:mm'); });
    }
    PropertiesService.getScriptProperties().setProperty('ultimo', JSON.stringify({em: agora, nome: u.nome, cargo: u.cargo}));
    cacheLimpa_();
    log_(u, o ? 'alterou' : 'cadastrou', id, f('navio'), SIT[sitNova], trocas.join(' | '));
    return {ok: true, id: id};
  } finally { lock.releaseLock(); }
}
function excluir_(u, b) {
  if (!u.admin) throw erro('Só administradores podem excluir embarcações. Para tirar da lista, mude a situação para Desatracado.');
  var d = ler_(), o = d.porId[b.id]; if (!o) throw erro('Embarcação não encontrada.');
  if (String(b.versao || '') !== String(o.reg_alt || '')) throw erro('Esta embarcação foi alterada depois que você abriu a tela. Atualize e tente de novo.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    d.sheet.deleteRow(o.r);
    PropertiesService.getScriptProperties().setProperty('ultimo', JSON.stringify({em: agora_(), nome: u.nome, cargo: u.cargo}));
    cacheLimpa_();
    log_(u, 'excluiu', o.id, String(o.navio), SIT[o.sit], '');
  } finally { lock.releaseLock(); }
  return {ok: true};
}
function salvarAviso_(u, b) {
  if (!(u.admin || u.etapas.indexOf('previsao') >= 0 || u.etapas.indexOf('atracacao') >= 0)) throw erro('Você não tem permissão para alterar o aviso.');
  var d = ler_(), s = d.sheet, txt = String(b.texto || '').trim(), lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (d.aviso.r) s.getRange(d.aviso.r, d.idx.situacao + 2).setValue(txt);
    else { var arr = []; for (var i = 0; i < d.n; i++) arr.push(''); arr[d.idx.situacao] = 'AVISO'; arr[d.idx.situacao + 1] = txt; s.appendRow(arr); }
    cacheLimpa_();
    log_(u, 'alterou o aviso', '', '', '', txt.slice(0, 300));
  } finally { lock.releaseLock(); }
  return {ok: true};
}
function historico_(b) {
  var s = ss_().getSheetByName(ABA_LOG), out = []; if (!s) return {ok: true, itens: out};
  var v = s.getDataRange().getValues();
  for (var r = v.length - 1; r >= 1 && out.length < 40; r--) if (String(v[r][3]) === String(b.id)) out.push({em: fmtData(v[r][0]), usuario: String(v[r][1]), acao: String(v[r][2]), resumo: String(v[r][6])});
  return {ok: true, itens: out};
}
function log_(u, acao, id, navio, sit, resumo) {
  var s = ss_().getSheetByName(ABA_LOG); if (!s) return;
  s.appendRow([new Date(), u ? u.nome : '', acao, id, navio, sit, String(resumo).slice(0, 1500)]);
  s.getRange(s.getLastRow(), 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

/* ---------- endereços da página (web app) ---------- */
function doGet(e) {
  try {
    var dias = Math.min(3650, +(e && e.parameter && e.parameter.dias) || 3650), ch = cacheChave_(dias), c = cacheGet_(ch);
    if (c) return ContentService.createTextOutput(c).setMimeType(ContentService.MimeType.JSON);
    var txt = JSON.stringify(lista_(true, dias));
    cachePut_(ch, txt, 30);
    return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return json({ok: false, erro: String(err.message || err)}); }
}
function doPost(e) {
  var b; try { b = JSON.parse(e.postData.contents); } catch (x) { return json({ok: false, erro: 'Pedido inválido.'}); }
  try {
    if (b.acao === 'login') return json(login_(b));
    var u = auth_(b.token);
    switch (b.acao) {
      case 'sessao': var p = perfil_(u); p.ok = true; return json(p);
      case 'lista': return json(lista_(false, b.dias));
      case 'salvar': return json(salvar_(u, b.registro));
      case 'excluir': return json(excluir_(u, b));
      case 'aviso': return json(salvarAviso_(u, b));
      case 'senha': return json(alterarSenha_(u, b));
      case 'historico': return json(historico_(b));
      case 'sair': CacheService.getScriptCache().remove('tk:' + b.token); return json({ok: true});
    }
    return json({ok: false, erro: 'Ação desconhecida.'});
  } catch (err) { return json({ok: false, erro: String(err.message || err), codigo: err.codigo || ''}); }
}

/* ---------- menu "Line-up" na planilha (para quem administra) ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Line-up')
    .addItem('1. Preparar a planilha (primeira vez)', 'preparar')
    .addItem('Cadastrar ou editar usuário', 'cadastrarUsuario')
    .addItem('Redefinir a senha de um usuário', 'redefinirSenha')
    .addItem('Ativar ou desativar um usuário', 'alternarUsuario')
    .addToUi();
}
function preparar() {
  var ss = ss_(), ui = SpreadsheetApp.getUi();
  if (!ss.getSheetByName(ABA_USU)) { var u = ss.insertSheet(ABA_USU); u.appendRow(['Usuário', 'Nome', 'Cargo', 'E-mail', 'Etapas', 'Administrador', 'Ativo', 'Senha (criptografada)']); u.setFrozenRows(1); }
  if (!ss.getSheetByName(ABA_LOG)) { var l = ss.insertSheet(ABA_LOG); l.appendRow(['Data/hora', 'Usuário', 'Ação', 'ID', 'Embarcação', 'Situação', 'O que mudou']); l.setFrozenRows(1); }
  var d = ler_();
  var n = Object.keys(usuarios_()).length;
  ui.alert('Planilha preparada.\n\nColunas conferidas na aba ' + ABA + ' e ' + d.itens.length + ' embarcações com ID.' + (n ? '' : '\n\nAgora cadastre o primeiro usuário (será o administrador).'));
  if (!n) cadastrarUsuario(true);
}
function pergunta_(titulo, texto) {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt(titulo, texto, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? r.getResponseText().trim() : null;
}
function cadastrarUsuario(primeiro) {
  var ui = SpreadsheetApp.getUi(), s = ss_().getSheetByName(ABA_USU); if (!s) { ui.alert('Rode antes: Line-up > 1. Preparar a planilha.'); return; }
  var lg = pergunta_('Usuário', 'Login da pessoa (sem espaços, ex.: maria.souza):'); if (!lg) return;
  var all = usuarios_(), ex = all[norm(lg)];
  var nome = pergunta_('Nome', 'Nome que aparece no site e no histórico:'); if (!nome) return;
  var cargo = pergunta_('Cargo', 'Cargo (opcional):'); if (cargo === null) return;
  var etapas = primeiro ? 'todas' : pergunta_('Etapas', 'Etapas pelas quais esta pessoa é responsável, separadas por vírgula:\nprevisão, ao largo, atracação, movimentação, desatracação\n(ou escreva: todas)'); if (!etapas) return;
  var adm = primeiro ? 'sim' : (ui.alert('Administrador?', 'Esta pessoa será administradora (pode tudo, inclusive excluir embarcações)?', ui.ButtonSet.YES_NO) === ui.Button.YES ? 'sim' : 'não');
  var hash = ex ? ex.hash : '';
  if (!ex || ui.alert('Senha', 'Trocar também a senha desta pessoa?', ui.ButtonSet.YES_NO) === ui.Button.YES) {
    var senha = pergunta_('Senha provisória', 'Senha provisória (mínimo 6 caracteres). A pessoa pode trocar depois em "Minha senha" no site:'); if (!senha) return;
    if (senha.length < 6) { ui.alert('A senha precisa ter pelo menos 6 caracteres.'); return; }
    hash = novoHash_(senha);
  }
  var linha = [norm(lg), nome, cargo, ex ? ex.email : '', etapas, adm, ex ? (ex.ativo ? 'sim' : 'não') : 'sim', hash];
  if (ex) s.getRange(ex.r, 1, 1, 8).setValues([linha]); else s.appendRow(linha);
  ui.alert('Usuário salvo: ' + norm(lg) + '\nEtapas: ' + etapasDe_(etapas).map(function (e) { return ETAPA_NOME[e]; }).join(', '));
}
function redefinirSenha() {
  var ui = SpreadsheetApp.getUi(), lg = pergunta_('Redefinir senha', 'Login da pessoa:'); if (!lg) return;
  var u = usuarios_()[norm(lg)]; if (!u) { ui.alert('Usuário não encontrado.'); return; }
  var senha = pergunta_('Nova senha', 'Nova senha provisória (mínimo 6 caracteres):'); if (!senha) return;
  if (senha.length < 6) { ui.alert('A senha precisa ter pelo menos 6 caracteres.'); return; }
  ss_().getSheetByName(ABA_USU).getRange(u.r, 8).setValue(novoHash_(senha));
  ui.alert('Senha redefinida para ' + u.nome + '.');
}
function alternarUsuario() {
  var ui = SpreadsheetApp.getUi(), lg = pergunta_('Ativar ou desativar', 'Login da pessoa:'); if (!lg) return;
  var u = usuarios_()[norm(lg)]; if (!u) { ui.alert('Usuário não encontrado.'); return; }
  ss_().getSheetByName(ABA_USU).getRange(u.r, 7).setValue(u.ativo ? 'não' : 'sim');
  ui.alert(u.nome + (u.ativo ? ' foi DESATIVADO(A) e não consegue mais entrar.' : ' foi ATIVADO(A).'));
}
