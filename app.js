// Finanças da Família — o app.
//
// Como funciona, em uma frase: o app pede os dados à API (Apps Script), guarda
// numa variável (S.dados) e desenha a tela a partir dela. Toda vez que algo
// muda, a função render() redesenha. Os números NUNCA ficam neste código:
// só a chave fica no celular, e os dados vêm da planilha.
'use strict';

// O endereço da API não é segredo: sem a chave, ela não entrega nada.
const API = 'https://script.google.com/macros/s/AKfycbxriI1SGh0VkSg8jAwh_gl5umYEVtarFvGeu_QtHJNxAnagOfD40s5FZiMdxDZhmaaQ/exec';
const LIVRE_MINIMO = 0.15; // na divisão, pelo menos 15% fica livre para o dia a dia

// ---------- Memória do celular (só a chave e preferências) ----------
// Pode falhar (aba anônima, iPhone que limpou dados): por isso o try/catch.
const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v === null ? padrao : JSON.parse(v); } catch (e) { return padrao; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let chave = ler('fin_chave', '');
let eu = ler('fin_quem', 'Gabriel');

// S = o estado da tela (o que está aberto, qual aba, etc.)
const S = {
  tab: 'inicio', dados: ler('fin_cache', null), carregando: false,
  ocultar: ler('fin_ocultar', false), contasAbertas: false, vencAberto: false, dica: 0,
  envAberto: null, abaMes: 'gastos', periodo: 'mes', catSel: null, folha: null, erroEntrar: ''
};

// ---------- Conversa com a API ----------
async function api(acao, dados = {}) {
  // "text/plain" de propósito: evita a pergunta prévia do navegador (CORS),
  // que o Apps Script não sabe responder.
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ chave, acao }, dados))
  });
  const j = await r.json();
  if (j.erro === 'chave') { chave = ''; guardar('fin_chave', ''); S.erroEntrar = 'Chave não confere.'; render(); throw new Error('chave'); }
  if (j.erro) throw new Error(j.erro);
  return j;
}

async function carregar() {
  if (S.carregando) return;
  S.carregando = true;
  try {
    S.dados = await api('estado');
    guardar('fin_cache', S.dados);
  } catch (e) {
    if (e.message !== 'chave') avisar('Sem conexão com a planilha. Tente de novo.', true);
  }
  S.carregando = false;
  render();
}

// ---------- Ajudantes ----------
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (n, centavos) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', centavos ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
const priv = (texto) => (S.ocultar ? 'R$ ••••' : texto);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const diaMes = (iso) => { if (!iso) return ''; const [, m, d] = iso.slice(0, 10).split('-'); return d + '/' + m; };
const diasAte = (iso, hoje) => Math.round((new Date(iso + 'T12:00:00') - new Date(hoje + 'T12:00:00')) / 864e5);
function quando(isoDataHora) {
  if (!isoDataHora) return '';
  const d = new Date(isoDataHora), hoje = new Date();
  const ontem = new Date(Date.now() - 864e5);
  const mesmo = (a, b) => a.toDateString() === b.toDateString();
  if (mesmo(d, hoje)) return 'hoje';
  if (mesmo(d, ontem)) return 'ontem';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

const IC = {
  olho: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  seta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  mais: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  menos: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  mover: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 21l-4-4 4-4"/></svg>',
  proximo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  fechar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  voltar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  certo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  atualizar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  inicio: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  envelopes: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  mes: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
  jornada: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>'
};

function anel(p, tam, grossura, cor) {
  const r = (tam - grossura) / 2, c = 2 * Math.PI * r, meio = tam / 2;
  const cheio = Math.max(0.001, Math.min(1, p || 0)) * c;
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true"><circle cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke="#262B33" stroke-width="${grossura}"/><circle cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke="${cor}" stroke-width="${grossura}" stroke-linecap="round" stroke-dasharray="${cheio.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${meio} ${meio})"/></svg>`;
}

let timerAviso;
function avisar(texto, erro) {
  const el = document.getElementById('aviso');
  el.innerHTML = (erro ? '' : IC.certo) + esc(texto);
  el.className = 'toast' + (erro ? ' erro' : '');
  el.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { el.hidden = true; }, erro ? 4000 : 2600);
}

// ---------- Contas derivadas dos dados ----------
function contasAtivas() { return (S.dados.contas || []).filter((c) => c.ativa); }
function situacaoEnvelope(e, hoje) {
  if (!e.meta) return { txt: 'Sem meta', cls: 'info', cor: '#93B4FF' };
  if (e.guardado >= e.meta) return { txt: 'Completo', cls: 'info', cor: '#93B4FF' };
  if (e.dataAlvo && diasAte(e.dataAlvo, hoje) <= 14) return { txt: 'Falta pouco tempo', cls: 'atencao', cor: '#F5A524' };
  return { txt: 'Juntando', cls: 'ok', cor: '#6EE7A0' };
}
function vencimentosOrdenados() {
  const d = S.dados;
  return (d.compromissos || []).slice().sort((a, b) => {
    const pa = a.situacao === 'atrasado' ? 0 : (a.proximaData ? 1 : 2);
    const pb = b.situacao === 'atrasado' ? 0 : (b.proximaData ? 1 : 2);
    if (pa !== pb) return pa - pb;
    return (a.proximaData || '').localeCompare(b.proximaData || '');
  });
}

// A sugestão de divisão: enche os envelopes pela prioridade, até o que falta em
// cada um, e garante um mínimo livre. Depois a pessoa ajusta no + e −.
function sugerirDivisao(valor) {
  let resto = valor - Math.round(valor * LIVRE_MINIMO);
  return (S.dados.envelopes || []).map((e) => {
    const falta = Math.max(0, e.meta - e.guardado);
    let v = e.meta ? Math.min(falta, resto) : 0;
    v = Math.max(0, Math.floor(v));
    resto -= v;
    return { envelope: e.nome, sugerido: v, real: v };
  }).filter((l) => l.sugerido > 0 || (S.dados.envelopes.find((e) => e.nome === l.envelope) || {}).meta);
}

// ---------- Telas ----------
function telaEntrar() {
  return `<section class="entrar">
    <div class="avatar" style="width:64px;height:64px;font-size:20px">G&amp;D</div>
    <div><h1 class="titulo">Finanças da Família</h1><p class="sub">Digite a chave uma vez. Ela fica guardada só neste celular.</p></div>
    <div class="grupo"><label for="campo-chave">Chave</label>
      <input id="campo-chave" class="campo" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="a chave que aparece na planilha"></div>
    <div class="grupo"><span>Quem está usando este celular?</span>
      <div class="chips">${['Gabriel', 'Débora'].map((n) => `<button class="chip ${eu === n ? 'on' : ''}" data-a="eu" data-v="${n}">${n}</button>`).join('')}</div></div>
    ${S.erroEntrar ? `<p class="faixa-alerta">${esc(S.erroEntrar)}</p>` : ''}
    <button class="principal" style="background:var(--verde)" data-a="entrar">Entrar</button>
    <p class="sub" style="font-size:12px">A chave está na planilha: menu <b>Finanças → Mostrar chave do app</b>.</p>
  </section>`;
}

function telaInicio() {
  const d = S.dados, hoje = d.hoje;
  const contas = contasAtivas();
  const disponivel = contas.filter((c) => c.disponivel).reduce((s, c) => s + c.saldo, 0);
  const total = contas.reduce((s, c) => s + c.saldo, 0);
  const semInicial = contas.filter((c) => !c.temSaldoInicial).map((c) => c.nome);
  const nomeMes = MESES_LONGOS[Number(hoje.slice(5, 7)) - 1];

  // Vencimentos
  const lista = vencimentosOrdenados();
  const atrasados = lista.filter((c) => c.situacao === 'atrasado');
  const futuros = lista.filter((c) => c.proximaData && c.situacao !== 'atrasado');
  let faixa = '';
  if (lista.length) {
    let topoTxt, sub, box;
    if (atrasados.length) {
      const soma = atrasados.reduce((s, c) => s + c.valor, 0);
      box = `<span class="data-box perigo"><b>${atrasados.length}</b><small>ATRAS.</small></span>`;
      sub = 'Contas atrasadas';
      topoTxt = `${atrasados.map((c) => esc(c.nome)).slice(0, 2).join(' + ')}${atrasados.length > 2 ? '…' : ''} · ${priv(brl(soma))}`;
    } else if (futuros.length) {
      const data = futuros[0].proximaData;
      const doDia = futuros.filter((c) => c.proximaData === data);
      const soma = doDia.reduce((s, c) => s + c.valor, 0);
      const falta = diasAte(data, hoje);
      box = `<span class="data-box atencao"><b>${data.slice(8, 10)}</b><small>${MESES[Number(data.slice(5, 7)) - 1].toUpperCase()}</small></span>`;
      sub = 'Próximo vencimento · ' + (falta <= 0 ? 'hoje' : falta === 1 ? 'amanhã' : 'em ' + falta + ' dias');
      topoTxt = `${doDia.map((c) => esc(c.nome)).join(' + ')} · ${priv(brl(soma))}`;
    }
    if (box) {
      faixa = `<div class="venc">
        <button class="venc-topo" data-a="venc" aria-expanded="${S.vencAberto}">${box}
          <span class="cresce"><small>${sub}</small><b>${topoTxt}</b></span>
          <span class="seta ${S.vencAberto ? 'virada' : ''}" style="color:var(--apagado)">${IC.seta}</span></button>
        ${S.vencAberto ? `<div class="venc-corpo">${lista.map((c) => `
          <div class="venc-item"><span class="quando">${c.situacao === 'atrasado' ? '<span class="etiqueta perigo">atrasada</span>' : (c.proximaData ? diaMes(c.proximaData) : '—')}</span>
            <span class="cresce"><b>${esc(c.nome)}</b><small>${esc(c.obs || c.credor || '')}</small></span>
            <b style="font-size:14px">${c.valor ? priv(brl(c.valor, true)) : '—'}</b></div>`).join('')}</div>` : ''}
      </div>`;
    }
  }

  // O aviso que troca: só frases presas a número real.
  const dicas = [];
  if (atrasados.length) dicas.push({ r: 'Atenção', c: 'var(--laranja-txt)', t: `${atrasados.length} ${atrasados.length === 1 ? 'conta atrasada' : 'contas atrasadas'}, somando ${brl(atrasados.reduce((s, c) => s + c.valor, 0), true)}. Atrasada cobra multa e juros: é a primeira da fila.` });
  if (d.sequencia > 0) dicas.push({ r: 'Conquista', c: 'var(--verde)', t: `${d.sequencia} ${d.sequencia === 1 ? 'dia' : 'dias seguidos'} anotando. É esse hábito que faz o sistema acertar.` });
  const envPerto = (d.envelopes || []).filter((e) => e.meta && e.guardado < e.meta && e.dataAlvo).sort((a, b) => a.dataAlvo.localeCompare(b.dataAlvo))[0];
  if (envPerto) dicas.push({ r: 'O gestor diz', c: 'var(--azul-txt)', t: `Faltam ${brl(envPerto.meta - envPerto.guardado)} no envelope ${envPerto.nome} até ${diaMes(envPerto.dataAlvo)}.` });
  dicas.push({ r: 'Este mês', c: 'var(--azul-txt)', t: 'Primeiro mês: só medindo, sem meta. O número real é o que vai mostrar onde dá para melhorar.' });
  const di = S.dica % dicas.length;
  const dica = dicas[di];

  // Envelopes (carrossel)
  const envs = (d.envelopes || []).map((e) => {
    const st = situacaoEnvelope(e, hoje);
    return `<button class="env-mini" data-a="abrirEnv" data-v="${esc(e.nome)}">${anel(e.meta ? e.guardado / e.meta : 0, 48, 5, st.cor)}
      <small>${esc(e.nome)}</small><b>${priv(brl(e.guardado))}</b><em class="${st.cls}" style="background:none;padding:0">${st.txt}</em></button>`;
  }).join('');

  return `
  <header class="topo">
    <div class="quem"><div class="avatar">${eu === 'Débora' ? 'D' : 'G'}</div>
      <div><div class="sub" style="font-size:12px">${nomeMes}</div><div style="font-size:16px;font-weight:700">Olá, ${esc(eu)}</div></div></div>
    <button class="btn-icone" data-a="atualizar" aria-label="Atualizar">${IC.atualizar}</button>
  </header>

  <section class="saldo">
    <div class="saldo-linha"><span class="sub">Disponível agora</span>
      <button class="btn-icone" style="margin:-12px 0" data-a="ocultar" aria-label="Mostrar ou esconder valores">${IC.olho}</button></div>
    <span class="saldo-valor">${priv(brl(disponivel, true))}</span>
    <button class="total" data-a="contas" aria-expanded="${S.contasAbertas}">Total com o cofre <strong>${priv(brl(total))}</strong><span class="seta ${S.contasAbertas ? 'virada' : ''}">${IC.seta}</span></button>
    ${S.contasAbertas ? `<div class="lista">${contas.map((c) => `<div class="lista-linha"><span style="color:var(--texto2)">${esc(c.nome)}</span><b>${priv(brl(c.saldo, true))}</b></div>`).join('')}</div>` : ''}
  </section>
  ${semInicial.length ? `<p class="faixa-alerta">Falta o saldo inicial de: <b>${semInicial.map(esc).join(', ')}</b>. Preencha na planilha, aba <b>Contas</b>, coluna saldo_inicial. Sem ele o saldo começa do zero.</p>` : ''}

  <section class="acoes">
    <button class="acao entrou" data-a="nova" data-v="entrada"><span>${IC.mais}</span>Entrou</button>
    <button class="acao saiu" data-a="nova" data-v="saida"><span>${IC.menos}</span>Saiu</button>
    <button class="acao mover" data-a="nova" data-v="mover"><span>${IC.mover}</span>Mover</button>
  </section>
  ${faixa}

  <section class="cartao dicas">
    <div class="secao"><span class="rotulo" style="color:${dica.c}">${dica.r}</span>
      <span class="pontos">${dicas.map((x, i) => `<i class="${i === di ? 'on' : ''}"></i>`).join('')}</span></div>
    <p>${esc(dica.t)}</p>
    ${dicas.length > 1 ? `<button class="proximo" data-a="dica">Próximo ${IC.proximo}</button>` : ''}
  </section>

  <section style="display:flex;flex-direction:column;gap:10px">
    <div class="secao"><h2>Envelopes</h2><button class="link" data-a="tab" data-v="envelopes">Ver todos</button></div>
    <div class="carrossel sem-barra">${envs}</div>
  </section>

  <section style="display:flex;flex-direction:column;gap:2px">
    <div class="secao" style="margin-bottom:4px"><h2>Últimos registros</h2>
      ${d.anotouHoje ? '' : '<button class="link cinza" data-a="semGasto">Hoje não gastei</button>'}</div>
    ${(d.recentes || []).length ? d.recentes.slice(0, 6).map(linhaRegistro).join('') : '<p class="vazio">Nada anotado ainda. Toque em <b>Entrou</b> ou <b>Saiu</b> para começar.</p>'}
  </section>`;
}

function linhaRegistro(r) {
  const tipos = {
    entrada: { i: '+', cls: 'ok', titulo: r.categoria || 'Entrada', sinal: '+', cor: 'color:var(--verde)' },
    saida: { i: '−', cls: 'atencao', titulo: r.categoria || 'Saída', sinal: '−', cor: '' },
    mover: { i: '⇄', cls: 'info', titulo: r.envelope && r.conta === r.contaDestino ? 'Guardado em ' + r.envelope : (r.conta + ' → ' + r.contaDestino), sinal: '', cor: 'color:var(--azul-txt)' },
    sem_gasto: { i: '✓', cls: 'ok', titulo: 'Dia sem gasto', sinal: '', cor: 'color:var(--apagado)' }
  };
  const t = tipos[r.tipo] || tipos.saida;
  const partes = [r.item, r.lugar, r.quem, quando(r.data)].filter(Boolean);
  return `<button class="registro" data-a="verRegistro" data-v="${esc(r.id)}">
    <span class="icone ${t.cls}">${t.i}</span>
    <span class="cresce"><b>${esc(t.titulo)}</b><small>${esc(partes.join(' · '))}</small></span>
    <span class="valor" style="${t.cor}">${r.tipo === 'sem_gasto' ? '' : t.sinal + priv(brl(r.valor, true))}</span></button>`;
}

function telaEnvelopes() {
  const d = S.dados;
  return `<div><h1 class="titulo">Envelopes</h1><p class="sub">Toque em um para ver o sugerido e o real.</p></div>
  <section style="display:flex;flex-direction:column;gap:10px">
  ${(d.envelopes || []).map((e) => {
    const st = situacaoEnvelope(e, d.hoje);
    const aberto = S.envAberto === e.nome;
    const pct = e.meta ? Math.min(100, e.guardado / e.meta * 100) : 0;
    const dif = e.realTotal - e.sugeridoTotal;
    return `<div class="env">
      <button class="env-topo" data-a="env" data-v="${esc(e.nome)}" aria-expanded="${aberto}">${anel(e.meta ? e.guardado / e.meta : 0, 52, 6, st.cor)}
        <span class="cresce"><b style="font-size:15px;font-weight:700">${esc(e.nome)}</b><small style="font-size:13px">${priv(brl(e.guardado))}${e.meta ? ' de ' + brl(e.meta) : ''}</small></span>
        <span class="etiqueta ${st.cls}">${st.txt}</span></button>
      ${aberto ? `<div class="env-corpo">
        ${e.meta ? `<div class="par"><span>Guardado</span><b>${priv(brl(e.guardado, true))} de ${brl(e.meta)}</b></div>
        <div class="barra"><i style="width:${pct}%;background:${st.cor}"></i></div>
        <div class="par"><span>Falta</span><b>${brl(Math.max(0, e.meta - e.guardado), true)}${e.dataAlvo ? ' até ' + diaMes(e.dataAlvo) : ''}</b></div>` : '<p class="nota">Sem meta ainda. Dá para pôr na planilha, aba Envelopes, coluna meta.</p>'}
        ${e.sugeridoTotal || e.realTotal ? `<div class="par"><span>Já dividido: sugerido × real</span><b>${brl(e.sugeridoTotal)} × ${brl(e.realTotal)} ${dif ? `<span class="etiqueta ${dif < 0 ? 'atencao' : 'info'}">${dif < 0 ? '−' : '+'}${brl(Math.abs(dif))}</span>` : ''}</b></div>` : ''}
        ${e.obs ? `<p class="nota">${esc(e.obs)}</p>` : ''}
        <button class="principal" style="background:var(--cartao2);color:var(--texto);font-size:14px;min-height:48px" data-a="guardar" data-v="${esc(e.nome)}">Guardar dinheiro aqui</button>
      </div>` : ''}
    </div>`;
  }).join('')}
  </section>`;
}

function telaMes() {
  const d = S.dados;
  const nomeMes = MESES_LONGOS[Number(d.hoje.slice(5, 7)) - 1];
  let corpo = '';
  if (S.abaMes === 'gastos') {
    const fonte = S.periodo === 'mes' ? d.gastosMes : d.gastosSemana;
    const cores = {};
    (d.categorias || []).forEach((c) => { cores[c.nome] = c.cor || '#5B6270'; });
    const tetos = {};
    (d.categorias || []).forEach((c) => { tetos[c.nome] = c.teto; });
    const cats = Object.keys(fonte || {}).map((n) => ({ nome: n, valor: fonte[n], cor: cores[n] || '#5B6270', teto: tetos[n] || 0 }))
      .sort((a, b) => b.valor - a.valor);
    const total = cats.reduce((s, c) => s + c.valor, 0);
    if (!cats.length) {
      corpo = `<p class="vazio">Nenhum gasto ${S.periodo === 'mes' ? 'este mês' : 'nos últimos 7 dias'} ainda.</p>`;
    } else {
      const R = 84, C = 2 * Math.PI * R;
      let acum = 0;
      const sel = cats.find((c) => c.nome === S.catSel);
      const arcos = cats.map((c) => {
        const len = c.valor / total * C;
        const arco = `<circle cx="115" cy="115" r="${R}" fill="none" stroke="${c.cor}" stroke-width="24" stroke-dasharray="${Math.max(0, len - (cats.length > 1 ? 4 : 0)).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-acum).toFixed(1)}" transform="rotate(-90 115 115)" style="opacity:${S.catSel && S.catSel !== c.nome ? 0.2 : 1}"/>`;
        acum += len;
        return arco;
      }).join('');
      corpo = `
      <div class="rosca"><svg width="230" height="230" viewBox="0 0 230 230" aria-hidden="true"><circle cx="115" cy="115" r="${R}" fill="none" stroke="#1C2027" stroke-width="24"/>${arcos}</svg>
        <div class="centro"><span class="sub" style="font-size:13px">${sel ? esc(sel.nome) : (S.periodo === 'mes' ? 'No mês' : 'Em 7 dias')}</span><b>${priv(brl(sel ? sel.valor : total))}</b></div></div>
      <div style="display:flex;flex-direction:column;gap:4px">${cats.map((c) => {
        const status = S.periodo !== 'mes' ? '' : (!c.teto ? '<span class="etiqueta info" style="background:none;padding:0">medindo</span>' : (c.valor > c.teto ? '<span class="etiqueta atencao" style="background:none;padding:0">acima</span>' : '<span class="etiqueta ok" style="background:none;padding:0">ok</span>'));
        return `<button class="cat ${S.catSel === c.nome ? 'on' : ''}" data-a="cat" data-v="${esc(c.nome)}"><span class="bolinha" style="background:${c.cor}"></span><span class="cresce">${esc(c.nome)}</span>${status}<span class="valor">${priv(brl(c.valor))}</span></button>`;
      }).join('')}</div>
      ${sel && S.periodo === 'mes' ? `<div class="cartao" style="animation:aparecer .25s ease-out"><b>${esc(sel.nome)}</b><p class="nota" style="margin-top:6px">${sel.teto ? (sel.valor > sel.teto ? `Teto de ${brl(sel.teto)}. Passou ${brl(sel.valor - sel.teto)}.` : `Teto de ${brl(sel.teto)}. Ainda cabem ${brl(sel.teto - sel.valor)}.`) : 'Primeiro mês: só medindo. O teto entra depois, combinado a partir do número real.'}</p></div>` : ''}`;
    }
    corpo = `<div class="pilulas"><button class="${S.periodo === 'semana' ? 'on' : ''}" data-a="periodo" data-v="semana">7 dias</button><button class="${S.periodo === 'mes' ? 'on' : ''}" data-a="periodo" data-v="mes">Mês</button></div>${corpo}
      <p class="sub" style="text-align:center;font-size:13px;line-height:1.5">Hoje, cada real conta. É olhando o preço agora que um dia vocês vão poder nem olhar.</p>`;
  } else {
    const ent = d.entradasMes || {};
    const nomes = Object.keys(ent).sort((a, b) => ent[b] - ent[a]);
    const total = nomes.reduce((s, n) => s + ent[n], 0);
    corpo = nomes.length ? `<div class="cartao" style="display:flex;flex-direction:column;gap:2px;padding:6px 18px">
        ${nomes.map((n) => `<div class="lista-linha"><span style="color:var(--texto2)">${esc(n)}</span><b>${priv(brl(ent[n], true))}</b></div>`).join('')}
        <div class="lista-linha"><b>Total</b><b style="color:var(--verde)">${priv(brl(total, true))}</b></div></div>
        <p class="sub" style="font-size:13px">Renda por hora e renda por pessoa chegam no próximo passo.</p>`
      : '<p class="vazio">Nenhuma entrada anotada este mês ainda.</p>';
  }
  return `<h1 class="titulo">${nomeMes}</h1>
    <div class="segmento"><button class="${S.abaMes === 'gastos' ? 'on' : ''}" data-a="abaMes" data-v="gastos">Gastos</button><button class="${S.abaMes === 'rendas' ? 'on' : ''}" data-a="abaMes" data-v="rendas">Rendas</button></div>
    <section style="display:flex;flex-direction:column;gap:16px">${corpo}</section>`;
}

function telaJornada() {
  const d = S.dados;
  return `<h1 class="titulo">A caminhada</h1>
  <section class="cartao" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:28px 18px">
    <b style="font-size:56px;font-weight:800;color:var(--laranja-txt);letter-spacing:-.03em">${d.sequencia}</b>
    <span class="sub">${d.sequencia === 1 ? 'dia anotando' : 'dias seguidos anotando'}</span></section>
  <p class="nota">O anel das dívidas, a linha do tempo dos marcos e o "nosso porquê" chegam no passo 4. Primeiro, o hábito de anotar: é ele que dá número verdadeiro para essa tela.</p>`;
}

// ---------- A folha que sobe (anotar) ----------
function folhaHtml() {
  const f = S.folha;
  if (!f) return '';
  const d = S.dados;
  const cor = { entrada: 'var(--verde)', saida: 'var(--laranja)', mover: 'var(--azul)', guardar: 'var(--azul)' }[f.tipo] || 'var(--verde)';
  const titulos = { entrada: 'Entrou dinheiro', saida: 'Saiu dinheiro', mover: 'Mover entre contas', guardar: 'Guardar em ' + (f.envelope || ''), registro: 'Registro' };
  const valorNum = parseFloat((f.valor || '0').replace(',', '.')) || 0;
  const chips = (lista, campo, atual) => lista.map((n) => `<button class="chip ${atual === n ? 'on' : ''}" data-a="campo" data-v="${esc(campo)}|${esc(n)}">${esc(n)}</button>`).join('');
  const nomesContas = contasAtivas().map((c) => c.nome);
  let corpo = '';

  if (f.tipo === 'registro') {
    const r = f.reg;
    const linhas = [['Tipo', { entrada: 'Entrada', saida: 'Saída', mover: 'Mover', sem_gasto: 'Dia sem gasto' }[r.tipo]], ['Valor', brl(r.valor, true)], ['Categoria', r.categoria], ['Item', r.item], ['Lugar', r.lugar],
      ['Conta', r.conta], ['Para', r.contaDestino], ['Envelope', r.envelope], ['Pagamento de', r.compromisso], ['Quem', r.quem], ['De quem', r.deQuem], ['Quando', quando(r.data)]].filter((l) => l[1]);
    corpo = `<div class="lista" style="background:var(--cartao2)">${linhas.map((l) => `<div class="lista-linha"><span style="color:var(--apagado)">${l[0]}</span><b>${esc(l[1])}</b></div>`).join('')}</div>
      <p class="sub" style="font-size:13px;line-height:1.5">Errou? Cancele e anote de novo. O registro não some: fica marcado como cancelado na planilha, para dar para ver o que aconteceu.</p>
      <button class="principal" style="background:${f.confirmarCancelar ? '#FCA5A5' : 'var(--cartao2)'};color:${f.confirmarCancelar ? 'var(--fundo)' : 'var(--vermelho-txt)'}" data-a="cancelarReg" ${f.salvando ? 'disabled' : ''}>${f.confirmarCancelar ? 'Toque de novo para confirmar' : 'Cancelar este registro'}</button>`;
  } else if (f.passo === 1) {
    corpo = `<div class="visor"><span class="sub" style="font-size:13px">Quanto?</span><b style="color:${cor}">R$ ${esc(f.valor || '0')}</b>
      ${f.erro ? `<span style="font-size:12px;color:var(--vermelho-txt);font-weight:600">${esc(f.erro)}</span>` : ''}</div>
      <div class="teclado">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => `<button data-a="tecla" data-v="${k}" aria-label="${k === 'del' ? 'Apagar' : k}">${k === 'del' ? '⌫' : k}</button>`).join('')}</div>
      <button class="principal" style="background:${cor}" data-a="continuar">Continuar</button>`;
  } else if (f.passo === 2) {
    const cats = (d.categorias || []).filter((c) => c.tipo === (f.tipo === 'entrada' ? 'entrada' : 'saida')).map((c) => c.nome);
    const novaCat = f.criandoCat
      ? `<div style="display:flex;gap:6px;width:100%"><input id="campo-novacat" class="campo" placeholder="nome da categoria" value="${esc(f.novaCat || '')}" data-campo="novaCat"><button class="chip on" data-a="salvarCat" ${f.salvando ? 'disabled' : ''}>Criar</button></div>`
      : '<button class="chip novo" data-a="criarCat">+ Nova</button>';
    const quemDeQuem = `<div style="display:flex;flex-wrap:wrap;gap:16px">
        <div class="grupo"><span>Quem</span><div class="chips">${chips(['Gabriel', 'Débora'], 'quem', f.quem)}</div></div>
        ${f.tipo === 'mover' || f.tipo === 'guardar' ? '' : `<div class="grupo"><span>De quem é</span><div class="chips">${chips(['Pessoal', 'Automy'], 'deQuem', f.deQuem)}</div></div>`}</div>`;
    if (f.tipo === 'entrada' || f.tipo === 'saida') {
      const compromissos = (d.compromissos || []).map((c) => c.nome);
      corpo = `<b style="font-size:32px;font-weight:800;letter-spacing:-.03em;color:${cor}">R$ ${esc(f.valor)}</b>
        <div class="grupo"><span>${f.tipo === 'entrada' ? 'De onde veio' : 'Com o quê'}</span><div class="chips">${chips(cats, 'cat', f.cat)}${novaCat}</div></div>
        ${f.tipo === 'saida' ? `<div class="grupo"><label for="campo-item">O que exatamente (opcional)</label><input id="campo-item" class="campo" placeholder="ex.: fralda pacote G" value="${esc(f.item)}" data-campo="item"></div>
        <div class="grupo"><label for="campo-lugar">Onde comprou (para comparar preço)</label><input id="campo-lugar" class="campo" placeholder="ex.: mercadinho Y" value="${esc(f.lugar)}" data-campo="lugar"></div>` : ''}
        <div class="grupo"><span>${f.tipo === 'entrada' ? 'Caiu em qual conta' : 'Saiu de qual conta'}</span><div class="chips">${chips(nomesContas, 'conta', f.conta)}</div></div>
        ${f.tipo === 'saida' && compromissos.length ? `<div class="grupo"><span>É pagamento de uma conta? (opcional)</span><div class="chips">${chips(compromissos, 'compromisso', f.compromisso)}</div></div>` : ''}
        ${quemDeQuem}
        <button class="principal" style="background:${cor}" data-a="${f.tipo === 'entrada' ? 'irDividir' : 'salvar'}" ${f.salvando ? 'disabled' : ''}>${f.tipo === 'entrada' ? 'Continuar para dividir' : (f.salvando ? 'Anotando…' : 'Anotar saída')}</button>`;
    } else if (f.tipo === 'mover') {
      corpo = `<b style="font-size:32px;font-weight:800;letter-spacing:-.03em;color:${cor}">R$ ${esc(f.valor)}</b>
        <div class="grupo"><span>De onde sai</span><div class="chips">${chips(nomesContas, 'conta', f.conta)}</div></div>
        <div class="grupo"><span>Para onde vai</span><div class="chips">${chips(nomesContas, 'para', f.para)}</div></div>
        ${quemDeQuem}
        <p class="sub" style="font-size:13px;color:var(--azul-txt);line-height:1.5">Mover não é gasto: o dinheiro só troca de lugar.</p>
        <button class="principal" style="background:${cor}" data-a="salvar" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Movendo…' : 'Mover'}</button>`;
    } else if (f.tipo === 'guardar') {
      corpo = `<b style="font-size:32px;font-weight:800;letter-spacing:-.03em;color:${cor}">R$ ${esc(f.valor)}</b>
        <div class="grupo"><span>Esse dinheiro está em qual conta?</span><div class="chips">${chips(nomesContas, 'conta', f.conta)}</div></div>
        ${quemDeQuem}
        <p class="sub" style="font-size:13px;line-height:1.5">O dinheiro continua na conta; ele só passa a ter destino: ${esc(f.envelope)}.</p>
        <button class="principal" style="background:${cor}" data-a="salvar" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Guardando…' : 'Guardar'}</button>`;
    }
  } else if (f.passo === 3) {
    const usado = f.div.reduce((s, l) => s + l.real, 0);
    const livre = Math.max(0, valorNum - usado);
    const sugLivre = Math.max(0, valorNum - f.div.reduce((s, l) => s + l.sugerido, 0));
    corpo = `<div><b style="font-size:32px;font-weight:800;letter-spacing:-.03em;color:${cor}">R$ ${esc(f.valor)}</b>
      <p class="nota" style="margin-top:4px">Já vem com a sugestão. Se for fazer diferente, ajuste no + e −.</p></div>
      ${f.div.map((l, i) => {
        const dif = l.real - l.sugerido;
        return `<div class="linha-div"><span class="cresce"><b>${esc(l.envelope)}</b><small>sugerido ${brl(l.sugerido)} ${dif ? `<span class="etiqueta ${dif < 0 ? 'atencao' : 'info'}" style="margin-left:4px">${dif < 0 ? '−' : '+'}${brl(Math.abs(dif))}</span>` : ''}</small></span>
          <button class="passo" data-a="div" data-v="${i}|-10" aria-label="Diminuir ${esc(l.envelope)}">−</button><span class="real">${brl(l.real)}</span>
          <button class="passo" data-a="div" data-v="${i}|10" aria-label="Aumentar ${esc(l.envelope)}">+</button></div>`;
      }).join('')}
      <div class="secao"><span class="cresce"><b>Livre para gastar</b><small>sugerido ${brl(sugLivre)}</small></span><b style="font-size:22px;color:var(--verde)">${brl(livre)}</b></div>
      <button class="principal" style="background:${cor}" data-a="salvar" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Anotando…' : 'Confirmar divisão'}</button>`;
  }

  const temVoltar = f.tipo !== 'registro' && f.passo > 1;
  return `<div class="fundo-folha"><div class="fora" data-a="fechar"></div>
    <div class="folha" role="dialog" aria-label="${esc(titulos[f.tipo])}"><div class="alca"></div>
      <div class="folha-topo">${temVoltar ? `<button class="btn-icone" data-a="voltar" aria-label="Voltar" style="color:var(--texto)">${IC.voltar}</button>` : ''}
        <h3>${esc(titulos[f.tipo])}</h3><button class="btn-icone" data-a="fechar" aria-label="Fechar">${IC.fechar}</button></div>
      ${corpo}</div></div>`;
}

function abrirFolha(tipo, extra) {
  const contas = contasAtivas().map((c) => c.nome);
  const minha = eu === 'Débora' ? 'Inter Débora' : 'Inter Gabriel';
  S.folha = Object.assign({ tipo, passo: 1, valor: '', cat: null, item: '', lugar: '', conta: contas.indexOf(minha) >= 0 ? minha : contas[0],
    para: contas.find((c) => c !== minha) || '', quem: eu, deQuem: 'Pessoal', compromisso: null, div: null, erro: '' }, extra || {});
}

async function salvarFolha() {
  const f = S.folha;
  const valor = parseFloat((f.valor || '0').replace(',', '.')) || 0;
  const base = { valor, quem: f.quem, deQuem: f.deQuem, conta: f.conta };
  let pedido, msg;
  if (f.tipo === 'saida') {
    pedido = Object.assign(base, { tipo: 'saida', categoria: f.cat || 'Outro', item: f.item, lugar: f.lugar, compromisso: f.compromisso || '' });
    msg = f.compromisso ? f.compromisso + ': pago e anotado' : 'Anotado';
  } else if (f.tipo === 'entrada') {
    pedido = Object.assign(base, { tipo: 'entrada', categoria: f.cat || 'Outro', divisao: f.div });
    const marco = f.div.find((l) => l.real < l.sugerido);
    msg = marco ? `Dividido. ${marco.envelope} ficou ${brl(marco.sugerido - marco.real)} abaixo do sugerido` : 'Dividido como o sugerido';
  } else if (f.tipo === 'mover') {
    if (f.conta === f.para) { avisar('Escolha contas diferentes.', true); return; }
    pedido = Object.assign(base, { tipo: 'mover', contaDestino: f.para, deQuem: 'Pessoal' });
    msg = 'Movido. Não conta como gasto';
  } else if (f.tipo === 'guardar') {
    pedido = Object.assign(base, { tipo: 'mover', contaDestino: f.conta, envelope: f.envelope, deQuem: 'Pessoal',
      divisao: [{ envelope: f.envelope, sugerido: valor, real: valor }], obs: 'guardar no envelope' });
    msg = 'Guardado em ' + f.envelope;
  }
  f.salvando = true; render();
  try {
    await api('registrar', pedido);
    S.folha = null;
    avisar(msg);
    S.tab = 'inicio';
    await carregar();
  } catch (e) {
    f.salvando = false;
    if (e.message !== 'chave') avisar('Não salvou (sem internet?). Tente de novo.', true);
    render();
  }
}

// ---------- Desenhar ----------
function render() {
  const tela = document.getElementById('tela');
  const nav = document.getElementById('nav');
  if (!chave) { tela.innerHTML = telaEntrar(); nav.hidden = true; document.getElementById('folha').innerHTML = ''; return; }
  if (!S.dados) { tela.innerHTML = '<p class="carregando">Abrindo a planilha…</p>'; nav.hidden = true; carregar(); return; }
  const telas = { inicio: telaInicio, envelopes: telaEnvelopes, mes: telaMes, jornada: telaJornada };
  tela.innerHTML = telas[S.tab]();
  nav.hidden = false;
  nav.innerHTML = [['inicio', 'Início'], ['envelopes', 'Envelopes'], ['mes', 'Mês'], ['jornada', 'Jornada']]
    .map(([id, nome]) => `<button class="${S.tab === id ? 'on' : ''}" data-a="tab" data-v="${id}"><span>${IC[id]}</span>${nome}</button>`).join('');
  document.getElementById('folha').innerHTML = folhaHtml();
}

// Troca de aba recomeça a animação e volta ao topo.
function irPara(tab) { S.tab = tab; window.scrollTo(0, 0); const t = document.getElementById('tela'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; render(); }

// ---------- Toques ----------
const acoes = {
  eu: (v) => { eu = v; guardar('fin_quem', v); render(); },
  entrar: async () => {
    const v = (document.getElementById('campo-chave').value || '').trim();
    if (!v) { S.erroEntrar = 'Digite a chave.'; render(); return; }
    chave = v; S.erroEntrar = ''; guardar('fin_chave', v); S.dados = null; render();
  },
  atualizar: () => { avisar('Atualizando…'); carregar(); },
  ocultar: () => { S.ocultar = !S.ocultar; guardar('fin_ocultar', S.ocultar); render(); },
  contas: () => { S.contasAbertas = !S.contasAbertas; render(); },
  venc: () => { S.vencAberto = !S.vencAberto; render(); },
  dica: () => { S.dica++; render(); },
  tab: (v) => irPara(v),
  abrirEnv: (v) => { S.envAberto = v; irPara('envelopes'); },
  env: (v) => { S.envAberto = S.envAberto === v ? null : v; render(); },
  abaMes: (v) => { S.abaMes = v; render(); },
  periodo: (v) => { S.periodo = v; S.catSel = null; render(); },
  cat: (v) => { S.catSel = S.catSel === v ? null : v; render(); },
  nova: (v) => { abrirFolha(v); render(); },
  guardar: (v) => { abrirFolha('guardar', { envelope: v }); render(); },
  verRegistro: (v) => { const r = (S.dados.recentes || []).find((x) => x.id === v); if (r) { S.folha = { tipo: 'registro', reg: r }; render(); } },
  fechar: () => { S.folha = null; render(); },
  voltar: () => { S.folha.passo--; render(); },
  tecla: (k) => {
    const f = S.folha; let v = f.valor || '';
    if (k === 'del') v = v.slice(0, -1);
    else if (k === ',') { if (v.indexOf(',') < 0) v = (v || '0') + ','; }
    else { const dec = v.split(',')[1]; if (v.length < 9 && !(dec && dec.length >= 2)) v = (v === '0' ? '' : v) + k; }
    f.valor = v; f.erro = ''; render();
  },
  continuar: () => {
    const f = S.folha;
    if (!(parseFloat((f.valor || '0').replace(',', '.')) > 0)) { f.erro = 'Digite um valor maior que zero.'; render(); return; }
    f.passo = 2; render();
  },
  campo: (v) => { const [campo, valor] = v.split('|'); const f = S.folha; f[campo] = (campo === 'compromisso' && f[campo] === valor) ? null : valor; render(); },
  criarCat: () => { S.folha.criandoCat = true; render(); const el = document.getElementById('campo-novacat'); if (el) el.focus(); },
  salvarCat: async () => {
    const f = S.folha, nome = (f.novaCat || '').trim();
    if (!nome) return;
    f.salvando = true; render();
    try {
      await api('categoria', { nome, tipo: f.tipo === 'entrada' ? 'entrada' : 'saida' });
      S.dados.categorias.push({ nome, tipo: f.tipo === 'entrada' ? 'entrada' : 'saida', teto: 0, cor: '#5B6270' });
      f.cat = nome; f.criandoCat = false; f.novaCat = ''; avisar('Categoria criada');
    } catch (e) { avisar(e.message === 'ja_existe' ? 'Essa categoria já existe.' : 'Não criou. Tente de novo.', true); }
    f.salvando = false; render();
  },
  irDividir: () => {
    const f = S.folha;
    f.div = sugerirDivisao(parseFloat(f.valor.replace(',', '.')) || 0);
    f.passo = 3; render();
  },
  div: (v) => {
    const [i, passo] = v.split('|').map(Number);
    const f = S.folha, l = f.div[i];
    const total = parseFloat(f.valor.replace(',', '.')) || 0;
    const usado = f.div.reduce((s, x) => s + x.real, 0);
    if (passo > 0 && usado + passo > total) return;
    l.real = Math.max(0, l.real + passo); render();
  },
  salvar: () => salvarFolha(),
  semGasto: async () => {
    try { await api('registrar', { tipo: 'sem_gasto', quem: eu }); avisar('Dia sem gasto anotado. Sequência mantida'); carregar(); }
    catch (e) { if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); }
  },
  cancelarReg: async () => {
    const f = S.folha;
    if (!f.confirmarCancelar) { f.confirmarCancelar = true; render(); return; }
    f.salvando = true; render();
    try { await api('cancelar', { id: f.reg.id }); S.folha = null; avisar('Registro cancelado'); carregar(); }
    catch (e) { f.salvando = false; avisar('Não cancelou. Tente de novo.', true); render(); }
  }
};

document.addEventListener('click', (e) => {
  const alvo = e.target.closest('[data-a]');
  if (!alvo) return;
  const fn = acoes[alvo.dataset.a];
  if (fn) fn(alvo.dataset.v, alvo);
});
// Campos de texto: guardam na folha sem redesenhar (senão o teclado do celular fecha a cada letra).
document.addEventListener('input', (e) => {
  const campo = e.target.dataset && e.target.dataset.campo;
  if (campo && S.folha) S.folha[campo] = e.target.value;
});

// Voltou para o app depois de um tempo: busca os números de novo.
document.addEventListener('visibilitychange', () => { if (!document.hidden && chave && S.dados) carregar(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
if (chave && S.dados) carregar();
