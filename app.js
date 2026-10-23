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
const CONTA_ENVELOPES = 'Mercado Pago'; // onde mora todo o dinheiro dos envelopes
const ENV_PREVISTOS = 'Próximos dias';   // envelope dos gastos que já se sabe que vêm
const ENTRADA_PREV = 'Vai entrar';        // marca das entradas previstas (não é envelope de verdade)
// Tirar dinheiro de envelope para estas é aceitável; para o resto, o app pergunta duas vezes.
const FIADO = 'Fiado na caderneta'; // "conta" de mentira: a compra soma na caderneta, não sai do banco
const ESSENCIAIS = ['Mercado/caderneta', 'Alimentação', 'Luisa Amélia', 'Contas da casa', 'Dívidas'];

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
  previsaoAberta: false, animar: true, livreMostrado: null,
  envAberto: null, abaMes: 'gastos', periodo: 'mes', catSel: null, folha: null, erroEntrar: ''
};

// ---------- Conversa com a API ----------
async function api(acao, dados = {}) {
  // "text/plain" de propósito: evita a pergunta prévia do navegador (CORS),
  // que o Apps Script não sabe responder.
  // Cada falha ganha um nome diferente, para a tela dizer o que foi de fato.
  let r, j;
  try {
    r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ chave, acao }, dados))
    });
  } catch (e) { throw new Error('rede'); }
  try { j = await r.json(); } catch (e) { throw new Error('resposta ' + r.status); }
  if (j.erro === 'interno') throw new Error('interno: ' + (j.detalhe || ''));
  if (j.erro === 'chave') { chave = ''; guardar('fin_chave', ''); S.erroEntrar = 'Chave não confere.'; render(); throw new Error('chave'); }
  if (j.erro) throw new Error(j.erro);
  return j;
}

async function carregar() {
  if (S.carregando) return;
  S.carregando = true;
  try {
    S.dados = await api('estado');
    S.erroCarga = '';
    guardar('fin_cache', S.dados);
  } catch (e) {
    // Sem isto, a tela de "Abrindo…" chamava carregar() de novo sem parar.
    if (e.message !== 'chave') S.erroCarga = e.message;
    if (S.dados) avisar('Sem conexão com a planilha. Tente de novo.', true);
  }
  S.carregando = false;
  render();
}

// ---------- Ajudantes ----------
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Sempre com centavos: valor arredondado na tela confunde quando se compara com o banco.
const brl = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true"><circle cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke="#232835" stroke-width="${grossura}"/><circle cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke="${cor}" stroke-width="${grossura}" stroke-linecap="round" stroke-dasharray="${cheio.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${meio} ${meio})"/></svg>`;
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
  if (!e.meta) return { txt: e.nome === ENV_PREVISTOS ? 'Nada previsto' : 'Sem meta', cls: 'info', cor: '#8DA6FF' };
  if (e.guardado >= e.meta) return { txt: 'Completo', cls: 'info', cor: '#8DA6FF' };
  if (e.dataAlvo && diasAte(e.dataAlvo, hoje) <= 14) return { txt: 'Falta pouco tempo', cls: 'atencao', cor: '#FFB04A' };
  return { txt: 'Juntando', cls: 'ok', cor: '#5BE3A4' };
}
// O dinheiro "livre" de verdade: o que está nas contas, menos o que já tem
// destino (envelopes), menos os gastos previstos que ainda não têm dinheiro guardado.
function contasDoDinheiro() {
  const d = S.dados;
  const contas = contasAtivas();
  const nasContas = contas.filter((c) => c.disponivel).reduce((s, c) => s + c.saldo, 0);
  const guardado = (d.envelopes || []).reduce((s, e) => s + Math.max(0, e.guardado), 0);
  const envPrev = (d.envelopes || []).find((e) => e.nome === ENV_PREVISTOS);
  const prevSemDinheiro = envPrev ? Math.max(0, envPrev.meta - Math.max(0, envPrev.guardado)) : 0;
  const mp = contas.find((c) => c.nome === CONTA_ENVELOPES);
  // Quanto do dinheiro de envelope ainda está fora do Mercado Pago. O dos
  // "Próximos dias" não conta: é para gastar logo, fica no Inter.
  const guardadoMP = guardado - (envPrev ? Math.max(0, envPrev.guardado) : 0);
  const faltaMandar = mp && mp.temSaldoInicial ? Math.max(0, Math.round(guardadoMP - mp.saldo)) : 0;
  // livreReal = dinheiro sem destino. Se for negativo, os envelopes prometem mais
  // do que existe: isso vira "excesso" e é corrigido tirando do menos urgente.
  const livreReal = nasContas - guardado;
  const livre = Math.max(0, livreReal - prevSemDinheiro);
  const faltaPrev = Math.max(0, prevSemDinheiro - Math.max(0, livreReal));
  return { nasContas, guardado, prevSemDinheiro, livreReal, livre, faltaPrev, excesso: Math.max(0, Math.round(-livreReal * 100) / 100), faltaMandar };
}

// Este gasto passa do livre? Só conta para conta do dia a dia (não Mercado Pago,
// não cofre) e para gasto que não é conta fixa/previsto (esses já têm envelope).
function passaDoLivre(f, valorNum) {
  if (f.compromisso || f.conta === CONTA_ENVELOPES || f.substitui) return null;
  const conta = contasAtivas().find((c) => c.nome === f.conta);
  if (!conta || !conta.disponivel) return null;
  const livre = Math.max(0, contasDoDinheiro().livreReal);
  const falta = Math.round((valorNum - livre) * 100) / 100;
  if (falta <= 0) return null;
  return Object.assign({ livre, falta }, planoTirar(falta));
}

// A chave Pix vem da planilha (aba Config), nunca do código: o app é público.
function caixaPix() {
  const pix = S.dados && S.dados.pixMP;
  if (!pix) return '';
  return `<div class="lista-linha" style="background:var(--cartao2);border-radius:14px;padding:12px 14px">
    <span style="display:flex;flex-direction:column"><small style="color:var(--apagado)">Chave Pix do ${CONTA_ENVELOPES}</small><b style="font-size:17px;letter-spacing:.02em">${esc(pix)}</b></span>
    <button class="chip on" data-a="copiarPix">Copiar</button></div>`;
}

// "1.234,56" → 1234.56
const numBR = (t) => parseFloat(String(t || '').replace(/\./g, '').replace(',', '.')) || 0;
const txtBR = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
// Na tela de acerto: o livre que vai sobrar com os números digitados.
function resumoAcerto(f) {
  const disp = contasAtivas().filter((c) => c.disponivel).map((c) => c.nome);
  const contas = disp.reduce((s, n) => s + numBR(f.contas[n]), 0);
  const envs = Object.keys(f.envs).reduce((s, n) => s + numBR(f.envs[n]), 0);
  const livre = contas - envs;
  return livre < 0 ? `<span style="color:var(--vermelho-txt)">passa ${brl(-livre, true)}</span>` : `<span style="color:var(--verde)">${brl(livre, true)}</span>`;
}

// De onde tirar quando falta: do envelope MENOS urgente para o mais urgente.
// "Próximos dias" é prioridade 1, então é sempre o último.
function planoTirar(falta) {
  let resto = Math.round(falta * 100) / 100;
  const plano = [];
  (S.dados.envelopes || []).slice().sort((a, b) => b.prioridade - a.prioridade).forEach((e) => {
    if (resto <= 0 || e.guardado <= 0) return;
    const v = Math.min(e.guardado, resto);
    plano.push({ envelope: e.nome, valor: Math.round(v * 100) / 100, sobra: e.guardado - v, meta: e.meta });
    resto = Math.round((resto - v) * 100) / 100;
  });
  return { plano, naoCobre: resto };
}
const ehPrevisto = (c) => c.envelope === ENV_PREVISTOS;
const ehGanho = (c) => c.envelope === ENTRADA_PREV;
function ganhos() {
  return (S.dados.compromissos || []).filter(ehGanho).sort((a, b) => (a.proximaData || '9').localeCompare(b.proximaData || '9'));
}
// Como o mês fecha: livre de hoje + o que vai entrar − as contas do mês que
// ainda não têm dinheiro guardado no envelope delas.
function previsaoMes() {
  const d = S.dados;
  const x = new Date(d.hoje + 'T12:00:00'); x.setMonth(x.getMonth() + 1, 0);
  const ate = x.toISOString().slice(0, 10);
  const entra = ganhos().filter((c) => c.proximaData && c.proximaData <= ate).reduce((s, c) => s + c.valor, 0);
  let contas = 0;
  (d.envelopes || []).forEach((e) => {
    if (e.nome === ENV_PREVISTOS) return;
    const devidas = (d.compromissos || []).filter((c) => c.envelope === e.nome && (c.situacao === 'atrasado' || (c.proximaData && c.proximaData <= ate)))
      .reduce((s, c) => s + c.valor, 0);
    contas += Math.max(0, devidas - Math.max(0, e.guardado));
  });
  // Dinheiro previsto não conta até cair: o fim do mês usa só o que já existe.
  return { ate, entra, contas, fim: contasDoDinheiro().livre - contas };
}
// Dia de cair dinheiro: o app pergunta, e o "caiu" já abre a divisão.
function cartaoGanho(hoje) {
  const c = ganhos().find((x) => x.proximaData && diasAte(x.proximaData, hoje) <= 0);
  if (!c) return '';
  const n = -diasAte(c.proximaData, hoje);
  return `<section class="pergunta entra">
    <span class="rotulo" style="color:var(--verde)">${n === 0 ? 'Hoje deve cair' : 'Era para ter caído em ' + diaMes(c.proximaData)}</span>
    <b style="font-size:17px">${esc(c.nome)} · ${priv(brl(c.valor))}</b>
    <span class="sub" style="font-size:13px">Caiu?</span>
    <div class="chips">
      <button class="chip on" data-a="ganhoCaiu" data-v="${esc(c.nome)}">Caiu, anotar</button>
      <button class="chip" data-a="prevAdiar" data-v="${esc(c.nome)}">Ainda não</button>
      <button class="chip" data-a="prevNao" data-v="${esc(c.nome)}">Não vai cair</button>
    </div></section>`;
}
// O número grande "corre" até o valor novo (só quando muda).
function animarLivre() {
  const el = document.getElementById('livre-num');
  if (!el || S.ocultar) return;
  const alvo = Number(el.dataset.valor) || 0;
  const de = S.livreMostrado == null ? 0 : S.livreMostrado;
  S.livreMostrado = alvo;
  if (Math.abs(alvo - de) < 0.005 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now(), dur = 750;
  const passo = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = brl(de + (alvo - de) * e);
    if (k < 1 && document.body.contains(el)) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
const caderneta = () => (S.dados.compromissos || []).find((c) => /^Caderneta/.test(c.nome));
const contaDe = (pessoa) => (pessoa === 'Débora' ? 'Inter Débora' : 'Inter Gabriel');
function previstos() {
  return (S.dados.compromissos || []).filter(ehPrevisto).sort((a, b) => (a.proximaData || '9').localeCompare(b.proximaData || '9'));
}
// O que precisa estar à mão em cada prazo, e os previstos agrupados por categoria.
function resumoPrevistos(hoje) {
  const lista = previstos();
  const ate = (dias) => lista.filter((c) => c.proximaData && diasAte(c.proximaData, hoje) <= dias).reduce((s, c) => s + c.valor, 0);
  const grupos = {};
  lista.forEach((c) => { const g = c.categoria || 'Outro'; (grupos[g] = grupos[g] || []).push(c); });
  return { lista, ateAmanha: ate(1), ateSemana: ate(7), ateMes: ate(31), total: lista.reduce((s, c) => s + c.valor, 0), grupos };
}
// Previsto cuja data já passou: o app pergunta, uma resposta de um toque.
// Sem isso, um gasto que não aconteceu ficaria prendendo dinheiro para sempre.
function cartaoPassou(hoje) {
  const c = previstos().find((x) => x.proximaData && diasAte(x.proximaData, hoje) < 0);
  if (!c) return '';
  const n = -diasAte(c.proximaData, hoje);
  return `<section class="pergunta sai">
    <span class="rotulo" style="color:var(--laranja-txt)">${n === 1 ? 'Ontem' : 'Há ' + n + ' dias'} estava previsto</span>
    <b style="font-size:17px">${esc(c.nome)} · ${priv(brl(c.valor))}</b>
    <span class="sub" style="font-size:13px">Aconteceu?</span>
    <div class="chips">
      <button class="chip on" data-a="verPrevGastar" data-v="${esc(c.nome)}">Sim, anotar</button>
      <button class="chip" data-a="prevNao" data-v="${esc(c.nome)}">Não aconteceu</button>
      <button class="chip" data-a="prevAdiar" data-v="${esc(c.nome)}">Ficou para amanhã</button>
    </div></section>`;
}
// Depois da meia-noite, "amanhã" engana: quem ainda não dormiu pensa no dia de
// ontem. Entre 0h e 5h, oferece passar os previstos de amanhã para hoje.
const madrugada = () => new Date().getHours() < 5;
function cartaoMadrugada(hoje) {
  if (!madrugada()) return '';
  const amanha = dataDoQuando('Amanhã');
  const lista = previstos().filter((c) => c.proximaData === amanha);
  if (!lista.length) return '';
  return `<section class="pergunta azul">
    <span class="rotulo" style="color:var(--azul-txt)">Já passou da meia-noite</span>
    <span style="font-size:14px;line-height:1.5">Hoje já é <b>${diaMes(hoje)}</b>. ${lista.length === 1 ? 'Este previsto está' : 'Estes ' + lista.length + ' previstos estão'} para amanhã (${diaMes(amanha)}): ${lista.map((c) => esc(c.nome)).join(', ')}. Era para hoje?</span>
    <button class="chip on" style="align-self:flex-start" data-a="passarParaHoje">Sim, passar para hoje</button></section>`;
}
function quandoPrev(iso, hoje) {
  if (!iso) return 'sem data';
  const n = diasAte(iso, hoje);
  return n < 0 ? 'passou de ' + diaMes(iso) : n === 0 ? 'hoje' : n === 1 ? 'amanhã' : 'em ' + n + ' dias · ' + diaMes(iso);
}
// "Hoje", "Amanhã"... vira uma data. Meio-dia evita erro de fuso.
function dataDoQuando(q) {
  const d = new Date(S.dados.hoje + 'T12:00:00');
  if (q === 'Amanhã') d.setDate(d.getDate() + 1);
  else if (q === 'Esta semana') d.setDate(d.getDate() + 6);
  else if (q === 'Este mês') { d.setMonth(d.getMonth() + 1, 0); }
  return d.toISOString().slice(0, 10);
}

function vencimentosOrdenados() {
  const d = S.dados;
  return (d.compromissos || []).filter((c) => !ehPrevisto(c) && !ehGanho(c)).sort((a, b) => {
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
    v = Math.max(0, Math.floor(v * 100) / 100);
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
  const din = contasDoDinheiro();
  const prev = previsaoMes();
  const total = contas.reduce((s, c) => s + c.saldo, 0);
  const prevs = previstos();
  const gans = ganhos();
  const semInicial = contas.filter((c) => !c.temSaldoInicial).map((c) => c.nome);
  const dataLonga = new Date(hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

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
          <button class="venc-item" style="width:100%;text-align:left" data-a="editarFixa" data-v="${esc(c.nome)}"><span class="quando">${c.situacao === 'atrasado' ? '<span class="etiqueta perigo">atrasada</span>' : (c.proximaData ? diaMes(c.proximaData) : '—')}</span>
            <span class="cresce"><b>${esc(c.nome)}</b><small>${esc(c.obs || c.credor || '')}</small></span>
            <b style="font-size:14px">${c.valor ? priv(brl(c.valor)) : '—'}</b></button>`).join('')}
          <button class="link" style="padding:12px 0" data-a="novaFixa">+ Nova conta fixa</button></div>` : ''}
      </div>`;
    }
  }

  // O aviso que troca: só frases presas a número real.
  const dicas = [];
  if (prev.fim < 0) dicas.push({ r: 'Previsão', c: 'var(--vermelho-txt)', t: `Do jeito que está, o mês fecha faltando ${brl(-prev.fim)}. Dá tempo de ajustar: corte um previsto ou adie um gasto que não é essencial.` });
  if (atrasados.length) dicas.push({ r: 'Atenção', c: 'var(--laranja-txt)', t: `${atrasados.length} ${atrasados.length === 1 ? 'conta atrasada' : 'contas atrasadas'}, somando ${brl(atrasados.reduce((s, c) => s + c.valor, 0))}. Atrasada cobra multa e juros: é a primeira da fila.` });
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

  const itemTempo = (c, entra) => `<button class="item-tempo ${entra ? 'entra' : 'sai'}" data-a="verPrev" data-v="${esc(c.nome)}">
      <span class="ponto">${entra ? '↓' : '↑'}</span>
      <span class="cresce"><b>${esc(c.nome)}</b><small>${c.quem ? esc(c.quem) + ' · ' : ''}${c.categoria ? esc(c.categoria) + ' · ' : ''}${quandoPrev(c.proximaData, hoje)}${c.repete === 'mensal' ? ' · todo mês' : ''}</small></span>
      <span class="valor">${entra ? '+' : ''}${priv(brl(c.valor))}</span></button>`;

  const fimCor = prev.fim < 0 ? 'var(--vermelho-txt)' : 'var(--verde)';

  return `
  <header class="topo">
    <div class="quem"><div class="avatar">${eu === 'Débora' ? 'D' : 'G'}</div>
      <div><div class="sub" style="font-size:12px;text-transform:capitalize">${dataLonga}</div><div style="font-size:17px;font-weight:800">Olá, ${esc(eu)}</div></div></div>
    <button class="btn-icone" data-a="atualizar" aria-label="Atualizar">${IC.atualizar}</button>
  </header>

  <section class="heroi">
    <div class="saldo-linha"><span class="sub" style="color:var(--texto2);font-weight:600">Livre para gastar</span>
      <button class="btn-icone" style="margin:-12px 0" data-a="ocultar" aria-label="Mostrar ou esconder valores">${IC.olho}</button></div>
    <span id="livre-num" class="saldo-valor ${din.livre <= 0 ? 'zero' : ''}" data-valor="${din.livre}">${priv(brl(din.livre))}</span>
    ${din.faltaPrev > 0 ? `<span class="sub" style="font-size:12px;color:var(--laranja-txt)">Faltam ${priv(brl(din.faltaPrev))} para cobrir os gastos previstos.</span>` : ''}
    <div class="mini-stats">
      <button class="stat" data-a="tab" data-v="envelopes"><small>Guardado nos envelopes</small><b style="color:var(--azul-txt)">${priv(brl(din.guardado))}</b></button>
      <button class="stat" data-a="previsao" aria-expanded="${S.previsaoAberta}"><small>Fim do mês (${diaMes(prev.ate)})</small><b style="color:${fimCor}">${priv(brl(prev.fim))}</b></button>
    </div>
    ${S.previsaoAberta ? `<div class="previsao">
      <div class="par"><span>Livre agora</span><b>${priv(brl(din.livre))}</b></div>
      <div class="par"><span>− Contas do mês sem dinheiro guardado</span><b style="color:var(--laranja-txt)">${priv(brl(prev.contas))}</b></div>
      <hr><div class="par"><span style="color:var(--texto)">Como o mês fecha</span><b style="color:${fimCor}">${priv(brl(prev.fim))}</b></div>
      ${prev.entra ? `<p class="sub" style="font-size:12px;margin:0;line-height:1.5">Fora da conta: ${priv(brl(prev.entra))} previstos para entrar até ${diaMes(prev.ate)}. Só contam depois de cair.</p>` : ''}
      <p class="sub" style="font-size:12px;margin:0;line-height:1.5">É uma previsão: muda conforme vocês anotam o que entra e o que sai.</p></div>` : ''}
    <button class="total" data-a="contas" aria-expanded="${S.contasAbertas}">Total com o cofre <strong>${priv(brl(total))}</strong><span class="seta ${S.contasAbertas ? 'virada' : ''}">${IC.seta}</span></button>
    ${S.contasAbertas ? `<div class="lista">${contas.map((c) => `<button class="lista-linha" style="width:100%" data-a="ajustar" data-v="${esc(c.nome)}"><span style="color:var(--texto2)">${esc(c.nome)}</span><b>${priv(brl(c.saldo))} <small style="color:var(--azul-txt);font-weight:600">editar</small></b></button>`).join('')}
      <button class="principal" style="background:linear-gradient(135deg,var(--azul),var(--azul-2));margin:10px 0 8px;font-size:14px;min-height:46px;width:100%" data-a="acertar">Acertar tudo com o banco</button></div>` : ''}
  </section>
  ${cartaoGanho(hoje)}
  ${cartaoPassou(hoje)}
  ${cartaoMadrugada(hoje)}
  ${din.excesso > 0.009 ? (() => {
    const pl = planoTirar(din.excesso);
    return `<div class="pergunta sai"><span class="rotulo" style="color:var(--laranja-txt)">Os números não batem</span>
      <span style="font-size:14px;line-height:1.5">Os envelopes estão com <b>${priv(brl(din.excesso))}</b> a mais do que existe nas contas: algum gasto saiu sem descontar de envelope. Vai sair de <b>${pl.plano.map((t) => esc(t.envelope) + ' (' + brl(t.valor) + ')').join(', ')}</b>.</span>
      <div class="chips"><button class="chip on" data-a="reequilibrar">Acertar assim</button><button class="chip" data-a="acertar">Acertar tudo com o banco</button></div></div>`;
  })() : ''}
  ${din.faltaMandar > 1 ? `<button class="faixa-alerta" style="text-align:left;width:100%;border-color:rgba(141,166,255,.35);background:rgba(141,166,255,.08);color:var(--azul-txt)" data-a="mandarMP" data-v="${din.faltaMandar}">Falta mandar <b>${priv(brl(din.faltaMandar))}</b> para o ${CONTA_ENVELOPES}: é dinheiro de envelope que ainda está no Inter. <b style="color:var(--texto)">Já mandei →</b></button>` : ''}
  ${semInicial.length ? `<button class="faixa-alerta" style="text-align:left;width:100%" data-a="saldoIni">Falta dizer quanto tem em: <b>${semInicial.map(esc).join(', ')}</b>. Sem isso o saldo começa do zero. <b style="color:var(--texto)">Toque para preencher →</b></button>` : ''}

  <section class="acoes">
    <button class="acao entrou" data-a="nova" data-v="entrada"><span>${IC.mais}</span>Entrou</button>
    <button class="acao saiu" data-a="nova" data-v="saida"><span>${IC.menos}</span>Saiu</button>
    <button class="acao mover" data-a="nova" data-v="mover"><span>${IC.mover}</span>Mover</button>
  </section>
  ${faixa}

  <section style="display:flex;flex-direction:column;gap:10px">
    <div class="secao"><h2><span class="sec-icone ok">↓</span>Vai entrar</h2><button class="link" data-a="nova" data-v="ganho">+ Adicionar</button></div>
    ${gans.length ? `<div class="tempo">${gans.map((c) => itemTempo(c, true)).join('')}</div>`
      : '<p class="vazio">Edição, Bolsa Família, Pé-de-Meia… Anote o que vai cair e quando: o app passa a prever como o mês fecha.</p>'}
  </section>

  <section style="display:flex;flex-direction:column;gap:10px">
    <div class="secao"><h2><span class="sec-icone atencao">↑</span>Vai ter gasto</h2><button class="link" data-a="nova" data-v="previsto">+ Adicionar</button></div>
    ${prevs.length ? `<div class="tempo">${prevs.map((c) => itemTempo(c, false)).join('')}</div>`
      : '<p class="vazio">Lembrou de um gasto que vem aí (cabelo, compra na cidade)? Anote aqui: a divisão passa a guardar dinheiro para ele.</p>'}
  </section>

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

  <section style="display:flex;flex-direction:column;gap:10px">
    <div class="secao"><h2>Últimos registros</h2>
      ${d.anotouHoje ? '' : '<button class="link cinza" data-a="semGasto">Hoje não gastei</button>'}</div>
    ${(d.recentes || []).length ? `<div class="registros">${d.recentes.slice(0, 6).map(linhaRegistro).join('')}</div>` : '<p class="vazio">Nada anotado ainda. Toque em <b>Entrou</b> ou <b>Saiu</b> para começar.</p>'}
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

function corpoPrevistos(e, hoje) {
  const r = resumoPrevistos(hoje);
  const falta = Math.max(0, r.total - Math.max(0, e.guardado));
  const prazo = (rotulo, v) => `<div class="par"><span>${rotulo}</span><b>${priv(brl(v, true))}</b></div>`;
  return `<div class="env-corpo">
    ${r.lista.length ? `
      <div class="par"><span>Guardado</span><b>${priv(brl(e.guardado, true))} de ${brl(r.total)}</b></div>
      <div class="barra"><i style="width:${r.total ? Math.min(100, e.guardado / r.total * 100) : 0}%;background:var(--azul)"></i></div>
      ${falta ? `<div class="par"><span>Falta guardar</span><b style="color:var(--laranja-txt)">${brl(falta, true)}</b></div>` : ''}
      <p class="nota" style="margin:4px 0 0">Precisa estar no Inter:</p>
      ${prazo('Até amanhã', r.ateAmanha)}${prazo('Nos próximos 7 dias', r.ateSemana)}${prazo('Até o fim do mês', r.ateMes)}
      ${Object.keys(r.grupos).map((g) => `<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
        <div class="par"><b style="color:var(--texto)">${esc(g)}</b><b>${priv(brl(r.grupos[g].reduce((s, c) => s + c.valor, 0)))}</b></div>
        ${r.grupos[g].map((c) => `<button class="par" style="background:none;border:0;color:inherit;font:inherit;padding:0 0 0 10px;text-align:left;cursor:pointer" data-a="verPrev" data-v="${esc(c.nome)}">
          <span>${esc(c.nome)} <small style="color:var(--apagado)">· ${quandoPrev(c.proximaData, hoje)}</small></span><span>${priv(brl(c.valor))}</span></button>`).join('')}
      </div>`).join('')}`
    : '<p class="nota">Nenhum gasto previsto ainda. Anote o que vem aí (leite, fralda, cabelo...) e o envelope passa a saber quanto precisa.</p>'}
    <p class="nota">Este dinheiro fica no Inter, não vai para o ${CONTA_ENVELOPES}: é para gastar logo.</p>
    <button class="principal" style="background:var(--laranja);font-size:14px;min-height:48px" data-a="nova" data-v="previsto">+ Vai ter gasto</button>
    <button class="principal" style="background:var(--cartao2);color:var(--texto);font-size:14px;min-height:48px" data-a="guardar" data-v="${esc(e.nome)}">Guardar dinheiro aqui</button>
  </div>`;
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
      ${aberto && e.nome === ENV_PREVISTOS ? corpoPrevistos(e, d.hoje) : ''}
      ${aberto && e.nome !== ENV_PREVISTOS ? `<div class="env-corpo">
        ${e.meta ? `<div class="par"><span>Guardado</span><b>${priv(brl(e.guardado, true))} de ${brl(e.meta)}</b></div>
        <div class="barra"><i style="width:${pct}%;background:${st.cor}"></i></div>
        <div class="par"><span>Falta</span><b>${brl(Math.max(0, e.meta - e.guardado), true)}${e.dataAlvo ? ' até ' + diaMes(e.dataAlvo) : ''}</b></div>` : '<p class="nota">Sem meta ainda. Dá para pôr na planilha, aba Envelopes, coluna meta.</p>'}
        ${e.sugeridoTotal || e.realTotal ? `<div class="par"><span>Já dividido: sugerido × real</span><b>${brl(e.sugeridoTotal)} × ${brl(e.realTotal)} ${dif ? `<span class="etiqueta ${dif < 0 ? 'atencao' : 'info'}">${dif < 0 ? '−' : '+'}${brl(Math.abs(dif))}</span>` : ''}</b></div>` : ''}
        ${e.obs ? `<p class="nota">${esc(e.obs)}</p>` : ''}
        <button class="principal" style="background:var(--cartao2);color:var(--texto);font-size:14px;min-height:48px" data-a="guardar" data-v="${esc(e.nome)}">Guardar dinheiro aqui</button>
        <div style="display:flex;justify-content:center;gap:22px">
          <button class="link" data-a="editarEnv" data-v="${esc(e.nome)}">Editar meta e data</button>
          ${e.guardado > 0 ? `<button class="link cinza" data-a="tirarEnv" data-v="${esc(e.nome)}">Tirar dinheiro daqui</button>` : ''}</div>
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
  const cor = { entrada: 'var(--verde)', saida: 'var(--laranja)', mover: 'var(--azul)', guardar: 'var(--azul)', previsto: 'var(--laranja)', ganho: 'var(--verde)', mandarMP: 'var(--azul)', ajuste: 'var(--azul)' }[f.tipo] || 'var(--verde)';
  const titulos = { entrada: 'Entrou dinheiro', saida: 'Saiu dinheiro', mover: 'Mover entre contas', guardar: 'Guardar em ' + (f.envelope || ''), registro: 'Registro', saldo: 'Ponto de partida',
    previsto: f.editandoPrev ? 'Editar previsto' : 'Vai ter gasto', ganho: f.editandoPrev ? 'Editar entrada prevista' : 'Vai entrar', prevVer: f.nome || '',
    proxCaderneta: 'Caderneta do próximo mês', ajuste: 'Corrigir saldo', acertar: 'Acertar com o banco', envEditar: 'Envelope ' + (f.nome || ''), fixa: f.nomeAntigo ? 'Editar conta fixa' : 'Nova conta fixa', mandarMP: 'Mandar para o ' + CONTA_ENVELOPES };
  const valorNum = parseFloat((f.valor || '0').replace(',', '.')) || 0;
  const chips = (lista, campo, atual) => lista.map((n) => `<button class="chip ${atual === n ? 'on' : ''}" data-a="campo" data-v="${esc(campo)}|${esc(n)}">${esc(n)}</button>`).join('');
  const nomesContas = contasAtivas().map((c) => c.nome);
  let corpo = '';

  if (f.tipo === 'saldo') {
    corpo = `<div class="visor"><span class="sub" style="font-size:13px">${f.posicao} de ${f.totalContas} · quanto tem agora em</span>
      <b style="font-size:22px;color:var(--texto)">${esc(f.conta)}</b><b style="color:var(--azul)">R$ ${esc(f.valor || '0')}</b>
      ${f.erro ? `<span style="font-size:12px;color:var(--vermelho-txt);font-weight:600">${esc(f.erro)}</span>` : ''}</div>
      <div class="teclado">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => `<button data-a="tecla" data-v="${k}" aria-label="${k === 'del' ? 'Apagar' : k}">${k === 'del' ? '⌫' : k}</button>`).join('')}</div>
      <p class="sub" style="font-size:12px;line-height:1.5;margin:0">Olhe no app do banco. Se não tem nada, deixe 0. Esse é o ponto de onde o sistema começa a contar.</p>
      <button class="principal" style="background:var(--azul)" data-a="salvarSaldo" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Salvando…' : 'Salvar'}</button>`;
  } else if (f.tipo === 'registro') {
    const r = f.reg;
    const linhas = [['Tipo', { entrada: 'Entrada', saida: 'Saída', mover: 'Mover', sem_gasto: 'Dia sem gasto' }[r.tipo]], ['Valor', brl(r.valor, true)], ['Categoria', r.categoria], ['Item', r.item], ['Lugar', r.lugar],
      ['Conta', r.conta], ['Para', r.contaDestino], ['Envelope', r.envelope], ['Pagamento de', r.compromisso], ['Quem', r.quem], ['De quem', r.deQuem], ['Quando', quando(r.data)]].filter((l) => l[1]);
    corpo = `<div class="lista" style="background:var(--cartao2)">${linhas.map((l) => `<div class="lista-linha"><span style="color:var(--apagado)">${l[0]}</span><b>${esc(l[1])}</b></div>`).join('')}</div>
      ${r.tipo !== 'sem_gasto' && r.categoria !== 'Ajuste' ? `<button class="principal" style="background:var(--cartao2);color:var(--texto)" data-a="editarReg">Editar</button>` : ''}
      <p class="sub" style="font-size:13px;line-height:1.5">Editar ou cancelar não apaga nada: o registro antigo fica marcado na planilha, para dar para ver o que aconteceu.</p>
      <button class="principal" style="background:${f.confirmarCancelar ? '#FF9AA5' : 'var(--cartao2)'};color:${f.confirmarCancelar ? 'var(--fundo)' : 'var(--vermelho-txt)'}" data-a="cancelarReg" ${f.salvando ? 'disabled' : ''}>${f.confirmarCancelar ? 'Toque de novo para confirmar' : 'Cancelar este registro'}</button>`;
  } else if (f.tipo === 'prevVer') {
    const c = (d.compromissos || []).find((x) => x.nome === f.nome) || {};
    corpo = `<div class="lista" style="background:var(--cartao2)">
        <div class="lista-linha"><span style="color:var(--apagado)">Valor previsto</span><b>${brl(c.valor, true)}</b></div>
        <div class="lista-linha"><span style="color:var(--apagado)">Quando</span><b>${quandoPrev(c.proximaData, d.hoje)}</b></div>
        ${c.quem ? `<div class="lista-linha"><span style="color:var(--apagado)">${ehGanho(c) ? 'Quem recebe' : 'Quem vai gastar'}</span><b>${esc(c.quem)}</b></div>` : ''}
        ${c.obs ? `<div class="lista-linha"><span style="color:var(--apagado)">Quem anotou</span><b>${esc(c.obs.replace('Previsto por ', ''))}</b></div>` : ''}</div>
      ${ehGanho(c) ? `<button class="principal" style="background:linear-gradient(135deg,var(--verde),var(--verde-2))" data-a="ganhoCaiu" data-v="${esc(c.nome)}">Caiu: anotar a entrada</button>`
        : '<button class="principal" style="background:linear-gradient(135deg,var(--laranja),var(--laranja-2))" data-a="prevGastar">Aconteceu: anotar o gasto</button>'}
      <div style="display:flex;gap:10px">
        <button class="principal" style="flex:1;background:var(--cartao2);color:var(--texto)" data-a="editarPrev">Editar</button>
        <button class="principal" style="flex:1;background:var(--cartao2);color:var(--texto)" data-a="prevAdiar" data-v="${esc(f.nome)}">Ficou para amanhã</button></div>
      <button class="principal" style="background:var(--cartao2);color:${f.confirmarCancelar ? 'var(--vermelho-txt)' : 'var(--texto2)'}" data-a="prevCancelar" ${f.salvando ? 'disabled' : ''}>${f.confirmarCancelar ? 'Toque de novo para confirmar' : 'Não vai mais acontecer'}</button>`;
  } else if (f.tipo === 'proxCaderneta') {
    corpo = `<div class="visor"><span class="sub" style="font-size:13px">Paga. Quanto já está a caderneta nova?</span><b style="color:var(--azul)">R$ ${esc(f.valor || '0')}</b></div>
      <div class="teclado">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => `<button data-a="tecla" data-v="${k}" aria-label="${k === 'del' ? 'Apagar' : k}">${k === 'del' ? '⌫' : k}</button>`).join('')}</div>
      <p class="sub" style="font-size:12px;line-height:1.5;margin:0">Se ainda não compraram nada, deixe 0. Daqui para a frente, cada compra fiado soma aqui.</p>
      <button class="principal" style="background:var(--azul)" data-a="salvarProxCad" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Salvando…' : 'Salvar'}</button>`;
  } else if (f.tipo === 'acertar') {
    const campo = (tipo, nome, valor) => `<div class="lista-linha"><span style="color:var(--texto2)">${esc(nome)}</span>
      <input class="campo" style="width:120px;text-align:right;padding:8px 10px;min-height:0" inputmode="decimal" value="${esc(valor)}" data-acerto="${tipo}|${esc(nome)}"></div>`;
    corpo = `<p class="sub" style="font-size:13px;line-height:1.5;margin:0">Já vem com o que o app sabe. Corrija só o que estiver diferente e toque em Salvar.</p>
      <span class="rotulo">1. Quanto tem em cada conta (olhe no banco)</span>
      <div class="lista" style="background:var(--cartao2)">${Object.keys(f.contas).map((n) => campo('conta', n, f.contas[n])).join('')}</div>
      <span class="rotulo">2. Quanto fica em cada envelope</span>
      <div class="lista" style="background:var(--cartao2)">${Object.keys(f.envs).map((n) => campo('env', n, f.envs[n])).join('')}</div>
      <div class="secao"><span class="cresce"><b>Livre para gastar</b><small>contas − envelopes</small></span><b id="acerto-livre" style="font-size:22px">${resumoAcerto(f)}</b></div>
      <button class="principal" style="background:var(--azul)" data-a="salvarAcerto" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Salvando…' : 'Salvar'}</button>`;
  } else if (f.tipo === 'ajuste') {
    const real = f.valor === '' ? null : (parseFloat(f.valor.replace(',', '.')) || 0);
    const dif = real === null ? 0 : real - f.saldoApp;
    corpo = `<div class="visor"><span class="sub" style="font-size:13px">Quanto tem de verdade agora em</span>
      <b style="font-size:22px;color:var(--texto)">${esc(f.conta)}</b><b style="color:var(--azul)">R$ ${esc(f.valor || '0')}</b>
      <span class="sub" style="font-size:12px">O app diz ${brl(f.saldoApp, true)}${real !== null && Math.abs(dif) >= 0.01 ? ` · diferença de ${dif > 0 ? '+' : '−'}${brl(Math.abs(dif), true)}` : ''}</span></div>
      <div class="teclado">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => `<button data-a="tecla" data-v="${k}" aria-label="${k === 'del' ? 'Apagar' : k}">${k === 'del' ? '⌫' : k}</button>`).join('')}</div>
      <p class="sub" style="font-size:12px;line-height:1.5;margin:0">Olhe no app do banco e digite o saldo. O app anota um <b>ajuste</b> com a diferença: não conta como gasto nem como entrada.</p>
      <button class="principal" style="background:var(--azul)" data-a="salvarAjuste" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Salvando…' : 'Corrigir'}</button>`;
  } else if (f.tipo === 'envEditar') {
    corpo = `<div class="grupo"><label for="ev-meta">Meta (R$)</label><input id="ev-meta" class="campo" inputmode="decimal" placeholder="em branco = soma das contas do envelope" value="${esc(f.meta)}" data-campo="meta"></div>
      <div class="grupo"><label for="ev-data">Até quando (opcional)</label><input id="ev-data" class="campo" type="date" value="${esc(f.dataAlvo)}" data-campo="dataAlvo"></div>
      <button class="principal" style="background:var(--azul)" data-a="salvarEnv" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Salvando…' : 'Salvar'}</button>`;
  } else if (f.tipo === 'fixa') {
    const repete = [['mensal', 'Todo mês'], ['bimestral', 'A cada 2 meses'], ['trimestral', 'A cada 3 meses']];
    const envs = (d.envelopes || []).filter((e) => e.nome !== ENV_PREVISTOS).map((e) => e.nome);
    corpo = `<div class="grupo"><label for="fx-nome">Nome</label><input id="fx-nome" class="campo" placeholder="ex.: Internet" value="${esc(f.nome)}" data-campo="nome"></div>
      <div style="display:flex;gap:10px">
        <div class="grupo" style="flex:1"><label for="fx-valor">Valor (R$)</label><input id="fx-valor" class="campo" inputmode="decimal" placeholder="ex.: 100" value="${esc(f.valorTxt)}" data-campo="valorTxt"></div>
        <div class="grupo" style="flex:1"><label for="fx-dia">Dia do mês</label><input id="fx-dia" class="campo" inputmode="numeric" placeholder="ex.: 10" value="${esc(f.dia)}" data-campo="dia"></div></div>
      <p class="nota" style="margin:-6px 0 0">Não sabe ainda? Deixe em branco e preencha quando a conta chegar.</p>
      <div class="grupo"><span>Repete</span><div class="chips">${repete.map(([v, t]) => `<button class="chip ${f.repete === v ? 'on' : ''}" data-a="campo" data-v="repete|${v}">${t}</button>`).join('')}</div></div>
      <div class="grupo"><label for="fx-parc">Quantas parcelas faltam? (em branco = sem fim)</label><input id="fx-parc" class="campo" inputmode="numeric" placeholder="sem fim" value="${esc(f.parcelas)}" data-campo="parcelas"></div>
      <div class="grupo"><span>Sai de qual envelope</span><div class="chips">${chips(envs, 'envelope', f.envelope)}</div></div>
      <button class="principal" style="background:var(--azul)" data-a="salvarFixa" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Salvando…' : 'Salvar'}</button>
      ${f.nomeAntigo ? `<button class="principal" style="background:var(--cartao2);color:${f.confirmarCancelar ? 'var(--vermelho-txt)' : 'var(--texto2)'}" data-a="encerrarFixa">${f.confirmarCancelar ? 'Toque de novo para confirmar' : 'Não existe mais'}</button>` : ''}`;
  } else if (f.tipo === 'mandarMP') {
    corpo = `<b style="font-size:32px;font-weight:800;letter-spacing:-.03em;color:${cor}">${brl(f.valorNum, true)}</b>
      <p class="sub" style="font-size:14px;line-height:1.55;margin:0">Esse é o dinheiro que acabou de ganhar destino nos envelopes. Faça a transferência no app do banco: <b style="color:var(--texto)">${esc(f.conta)} → ${CONTA_ENVELOPES}</b>.
      Assim ele sai da vista e para de parecer dinheiro para gastar.</p>
      ${caixaPix()}
      <div class="grupo"><span>Sai de qual conta</span><div class="chips">${chips(nomesContas.filter((n) => n !== CONTA_ENVELOPES), 'conta', f.conta)}</div></div>
      <button class="principal" style="background:${cor}" data-a="jaMandei" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Anotando…' : 'Já mandei, anotar'}</button>
      <button class="link cinza" style="align-self:center" data-a="fechar">Mando depois (fica um lembrete no início)</button>`;
  } else if (f.passo === 1) {
    corpo = `<div class="visor"><span class="sub" style="font-size:13px">${f.tipo === 'previsto' ? 'Quanto mais ou menos?' : f.tipo === 'ganho' ? 'Quanto deve entrar?' : 'Quanto?'}</span><b style="color:${cor}">R$ ${esc(f.valor || '0')}</b>
      ${f.erro ? `<span style="font-size:12px;color:var(--vermelho-txt);font-weight:600">${esc(f.erro)}</span>` : ''}</div>
      <div class="teclado">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => `<button data-a="tecla" data-v="${k}" aria-label="${k === 'del' ? 'Apagar' : k}">${k === 'del' ? '⌫' : k}</button>`).join('')}</div>
      <button class="principal" style="background:${cor}" data-a="continuar">Continuar</button>`;
  } else if (f.passo === 2) {
    const cats = (d.categorias || []).filter((c) => c.tipo === (['entrada', 'ganho'].includes(f.tipo) ? 'entrada' : 'saida')).map((c) => c.nome);
    const novaCat = f.criandoCat
      ? `<div style="display:flex;gap:6px;width:100%"><input id="campo-novacat" class="campo" placeholder="nome da categoria" value="${esc(f.novaCat || '')}" data-campo="novaCat"><button class="chip on" data-a="salvarCat" ${f.salvando ? 'disabled' : ''}>Criar</button></div>`
      : '<button class="chip novo" data-a="criarCat">+ Nova categoria</button>';
    // Modo "tirar": cada categoria vira um botão de remover (dois toques).
    const catChips = (lista) => f.tirandoCat
      ? lista.filter((n) => n !== 'Outro').map((n) => `<button class="chip" style="border:1px solid var(--vermelho-txt);color:${f.tirarCat === n ? 'var(--fundo)' : 'var(--vermelho-txt)'};background:${f.tirarCat === n ? '#FF9AA5' : 'none'}" data-a="tirarCat" data-v="${esc(n)}">${f.tirarCat === n ? 'Tirar ' + esc(n) + '?' : esc(n) + ' ×'}</button>`).join('')
        + '<button class="chip on" data-a="modoTirar">Pronto</button>'
      : chips(lista, 'cat', f.cat) + novaCat + '<button class="chip novo" data-a="modoTirar">Tirar</button>';
    const quemDeQuem = `<div style="display:flex;flex-wrap:wrap;gap:16px">
        <div class="grupo"><span>Quem</span><div class="chips">${chips(['Gabriel', 'Débora'], 'quem', f.quem)}</div></div>
        ${f.tipo === 'mover' || f.tipo === 'guardar' ? '' : `<div class="grupo"><span>De quem é</span><div class="chips">${chips(['Pessoal', 'Automy'], 'deQuem', f.deQuem)}</div></div>`}</div>`;
    if (f.tipo === 'previsto' || f.tipo === 'ganho') {
      const ganho = f.tipo === 'ganho';
      const catsLista = (d.categorias || []).filter((c) => c.tipo === (ganho ? 'entrada' : 'saida')).map((c) => c.nome);
      corpo = `<button class="valor-toque" data-a="mudarValor" aria-label="Mudar o valor"><b style="color:${cor}">R$ ${esc(f.valor)}</b><span>✎ mudar</span></button>
        <div class="grupo"><label for="campo-nomeprev">${ganho ? 'O que vai entrar' : 'O que vai ser'}</label><input id="campo-nomeprev" class="campo" placeholder="${ganho ? 'ex.: edição do mês' : 'ex.: corte de cabelo'}" value="${esc(f.nomePrev || '')}" data-campo="nomePrev"></div>
        ${madrugada() ? `<p class="nota" style="margin:0;color:var(--azul-txt)">Já passou da meia-noite: "Hoje" é ${diaMes(d.hoje)}, "Amanhã" é ${diaMes(dataDoQuando('Amanhã'))}.</p>` : ''}
        <div class="grupo"><span>Quando${f.dataAtual && !f.quando && !f.dataExata ? ` <small style="color:var(--apagado)">(agora: ${quandoPrev(f.dataAtual, d.hoje)})</small>` : ''}</span>
          <div class="chips">${chips(['Hoje', 'Amanhã', 'Esta semana', 'Este mês'], 'quando', f.dataExata ? null : f.quando)}</div>
          <input class="campo" type="date" aria-label="Ou o dia exato" value="${esc(f.dataExata || '')}" data-campo="dataExata"></div>
        <div class="grupo"><span>${ganho ? 'Quem recebe' : 'Quem vai gastar'}</span><div class="chips">${chips(['Gabriel', 'Débora'], 'quemGasta', f.quemGasta)}</div></div>
        <div class="grupo"><span>${ganho ? 'De onde vem' : 'Para quê'}</span><div class="chips">${catChips(catsLista)}</div></div>
        ${ganho ? `<div class="grupo"><span>Repete?</span><div class="chips">${[['unica', 'Só desta vez'], ['mensal', 'Todo mês']].map(([v, t]) => `<button class="chip ${(f.repete || 'unica') === v ? 'on' : ''}" data-a="campo" data-v="repete|${v}">${t}</button>`).join('')}</div></div>` : ''}
        <p class="sub" style="font-size:13px;line-height:1.5;margin:0">${ganho ? 'Entra na previsão do mês. No dia, o app pergunta se caiu e já abre a divisão.'
          : `Vai para o envelope <b style="color:var(--texto)">${ENV_PREVISTOS}</b>, o primeiro da fila: a próxima divisão já guarda dinheiro para ele.`}</p>
        <button class="principal" style="background:${ganho ? 'linear-gradient(135deg,var(--verde),var(--verde-2))' : 'linear-gradient(135deg,var(--laranja),var(--laranja-2))'}" data-a="salvarPrev" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Salvando…' : f.editandoPrev ? 'Salvar' : ganho ? 'Anotar entrada prevista' : 'Anotar previsto'}</button>`;
    } else if (f.tipo === 'entrada' || f.tipo === 'saida') {
      const compromissos = (d.compromissos || []).filter((c) => !ehGanho(c)).map((c) => c.nome);
      // Saindo do Mercado Pago sem ser uma conta prevista = mexendo em envelope.
      const doEnvelope = f.tipo === 'saida' && f.conta === CONTA_ENVELOPES && !f.compromisso;
      const envs = (d.envelopes || []).filter((e) => e.guardado > 0);
      let alertaEnv = '';
      if (doEnvelope) {
        const e = envs.find((x) => x.nome === f.envelope);
        const fica = e ? e.guardado - valorNum : 0;
        const essencial = ESSENCIAIS.indexOf(f.cat) >= 0;
        const texto = !f.cat ? 'Escolha com o quê, para o app pesar se vale tirar.'
          : !e ? 'Escolha de qual envelope sai.'
          : essencial ? `${esc(f.cat)} é essencial: tudo bem usar. ${esc(e.nome)} fica com ${brl(Math.max(0, fica))}${e.meta ? ' de ' + brl(e.meta) : ''}.`
          : `<b>Pare um segundo.</b> Esse dinheiro tem destino: ${esc(e.nome)}${e.dataAlvo ? ' (até ' + diaMes(e.dataAlvo) + ')' : ''}. ${esc(f.cat)} não é essencial. Tirando ${brl(valorNum)}, ${fica < 0 ? 'não cobre e' : ''} o envelope fica com ${brl(Math.max(0, fica))}${e.meta ? ' de ' + brl(e.meta) : ''}${e.meta && fica < e.meta ? `, e vai faltar ${brl(e.meta - Math.max(0, fica))}` : ''}. Dá para esperar?`;
        alertaEnv = `<div class="grupo"><span>Sai de qual envelope</span><div class="chips">${chips(envs.map((x) => x.nome), 'envelope', f.envelope)}</div></div>
          <p class="faixa-alerta" style="margin:0;${essencial && e ? 'border-color:var(--verde);color:var(--verde)' : ''}">${texto}</p>`;
      }
      // Antes de mexer em envelope: alguém da casa tem dinheiro livre no Inter?
      if (doEnvelope) {
        const outras = contasAtivas().filter((c) => c.disponivel && c.nome !== CONTA_ENVELOPES && c.saldo > 0);
        if (outras.length) alertaEnv = `<div class="faixa-alerta" style="margin:0;border-color:var(--azul);color:var(--azul-txt);display:flex;flex-direction:column;gap:8px">
          <span><b>Antes do envelope:</b> ${outras.map((c) => `${esc(c.nome)} tem ${brl(c.saldo, true)}`).join(', ')}. Dá para um mandar para o outro e o envelope fica inteiro.</span>
          <button class="chip on" style="align-self:flex-start" data-a="nova" data-v="mover">Mover entre vocês</button></div>` + alertaEnv;
      }
      // Gasto do Inter maior que o livre: a diferença sai dos envelopes menos urgentes.
      const passa = f.tipo === 'saida' ? passaDoLivre(f, valorNum) : null;
      if (passa) {
        const essencial = ESSENCIAIS.indexOf(f.cat) >= 0;
        const lista = passa.plano.map((t) => `<b>${esc(t.envelope)}</b> −${brl(t.valor, true)} (fica ${brl(Math.max(0, t.sobra))}${t.meta ? ' de ' + brl(t.meta) : ''})`).join('<br>');
        const cabeca = !f.cat ? `O livre é ${brl(passa.livre, true)}. Escolha com o quê, para o app pesar.`
          : essencial ? `O livre é ${brl(passa.livre, true)}. ${esc(f.cat)} é essencial: os ${brl(passa.falta, true)} que faltam saem do envelope menos urgente.`
          : `<b>Pare um segundo.</b> O livre acabou (${brl(passa.livre, true)}). ${esc(f.cat)} não é essencial, e os ${brl(passa.falta, true)} que faltam vão sair de dinheiro que já tem destino. Dá para esperar?`;
        alertaEnv += `<div class="faixa-alerta" style="margin:0;display:flex;flex-direction:column;gap:6px;${essencial ? 'border-color:var(--azul);color:var(--azul-txt)' : ''}">
          <span>${cabeca}</span>${f.cat ? `<span style="font-size:13px">${lista}</span>` : ''}
          ${passa.naoCobre > 0 ? `<span style="font-size:13px">Mesmo assim faltam ${brl(passa.naoCobre, true)}: confira o saldo da conta.</span>` : ''}</div>`;
      }
      const precisaConfirmar = (doEnvelope || passa) && f.cat && ESSENCIAIS.indexOf(f.cat) < 0;
      corpo = `<button class="valor-toque" data-a="mudarValor" aria-label="Mudar o valor"><b style="color:${cor}">R$ ${esc(f.valor)}</b><span>✎ mudar</span></button>
        <div class="grupo"><span>${f.tipo === 'entrada' ? 'De onde veio' : 'Com o quê'}</span><div class="chips">${catChips(cats)}</div></div>
        ${f.tipo === 'saida' ? `<div class="grupo"><label for="campo-item">O que exatamente (opcional)</label><input id="campo-item" class="campo" placeholder="ex.: fralda pacote G" value="${esc(f.item)}" data-campo="item"></div>
        <div class="grupo"><label for="campo-lugar">Onde comprou (para comparar preço)</label><input id="campo-lugar" class="campo" placeholder="ex.: mercadinho Y" value="${esc(f.lugar)}" data-campo="lugar"></div>` : ''}
        <div class="grupo"><span>${f.tipo === 'entrada' ? 'Caiu em qual conta' : 'Saiu de qual conta'}</span><div class="chips">${chips(f.tipo === 'saida' && caderneta() && !f.compromisso ? nomesContas.concat([FIADO]) : nomesContas, 'conta', f.conta)}</div></div>
        ${f.conta === FIADO ? `<p class="faixa-alerta" style="margin:0;border-color:var(--azul);color:var(--azul-txt)">Não sai dinheiro agora: soma na caderneta, que vai para ${brl(caderneta().valor + valorNum)}. O dinheiro sai no dia de pagar.</p>` : ''}
        ${alertaEnv}
        ${f.tipo === 'saida' && compromissos.length && f.conta !== FIADO ? `<div class="grupo"><span>É uma conta ou um gasto previsto? (opcional)</span><div class="chips">${chips(compromissos, 'compromisso', f.compromisso)}<button class="chip novo" data-a="novaFixa">+ Nova conta fixa</button></div></div>` : ''}
        ${quemDeQuem}
        <button class="principal" style="background:${cor}" data-a="${f.tipo === 'entrada' ? 'irDividir' : 'salvar'}" ${f.salvando ? 'disabled' : ''}>${f.tipo === 'entrada' ? 'Continuar para dividir' : (f.salvando ? 'Anotando…' : precisaConfirmar ? (f.confirmarTirar ? 'Sim, é importante: tirar' : 'Tirar do envelope') : 'Anotar saída')}</button>`;
    } else if (f.tipo === 'mover') {
      corpo = `<button class="valor-toque" data-a="mudarValor" aria-label="Mudar o valor"><b style="color:${cor}">R$ ${esc(f.valor)}</b><span>✎ mudar</span></button>
        <div class="grupo"><span>De onde sai</span><div class="chips">${chips(nomesContas, 'conta', f.conta)}</div></div>
        <div class="grupo"><span>Para onde vai</span><div class="chips">${chips(nomesContas, 'para', f.para)}</div></div>
        ${quemDeQuem}
        <p class="sub" style="font-size:13px;color:var(--azul-txt);line-height:1.5">Mover não é gasto: o dinheiro só troca de lugar.</p>
        <button class="principal" style="background:${cor}" data-a="salvar" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Movendo…' : 'Mover'}</button>`;
    } else if (f.tipo === 'guardar') {
      corpo = `<button class="valor-toque" data-a="mudarValor" aria-label="Mudar o valor"><b style="color:${cor}">R$ ${esc(f.valor)}</b><span>✎ mudar</span></button>
        <div class="grupo"><span>Esse dinheiro está em qual conta agora?</span><div class="chips">${chips(nomesContas, 'conta', f.conta)}</div></div>
        ${quemDeQuem}
        <p class="sub" style="font-size:13px;line-height:1.5">${f.envelope === ENV_PREVISTOS ? `O dinheiro fica no ${esc(f.conta)}: é para gastar logo. Ele só passa a ter destino.`
          : f.conta === CONTA_ENVELOPES ? `Já está no ${CONTA_ENVELOPES}: ele só passa a ter destino, ${esc(f.envelope)}.`
          : `Faça a transferência no banco: <b style="color:var(--texto)">${esc(f.conta)} → ${CONTA_ENVELOPES}</b>. O app anota as duas coisas: a mudança de conta e o destino, ${esc(f.envelope)}.`}</p>
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
          <button class="passo" data-a="div" data-v="${i}|-10" aria-label="Diminuir ${esc(l.envelope)}">−</button><input class="real" type="text" inputmode="decimal" aria-label="Valor para ${esc(l.envelope)}" value="${String(l.real).replace('.', ',')}" data-div="${i}">
          <button class="passo" data-a="div" data-v="${i}|10" aria-label="Aumentar ${esc(l.envelope)}">+</button></div>`;
      }).join('')}
      <div class="secao"><span class="cresce"><b>Livre para gastar</b><small>sugerido ${brl(sugLivre)}</small></span><b id="livre-div" style="font-size:22px;color:var(--verde)">${brl(livre)}</b></div>
      <button class="principal" style="background:${cor}" data-a="salvar" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Anotando…' : 'Confirmar divisão'}</button>`;
  }

  const temVoltar = f.tipo !== 'registro' && f.tipo !== 'saldo' && f.passo > 1;
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
    para: contas.find((c) => c !== minha) || '', quem: eu, quemGasta: eu, deQuem: 'Pessoal', compromisso: null, div: null, erro: '' }, extra || {});
}

async function salvarFolha() {
  const f = S.folha;
  const valor = parseFloat((f.valor || '0').replace(',', '.')) || 0;
  const base = { valor, quem: f.quem, deQuem: f.deQuem, conta: f.conta };
  let pedido, msg;
  if (f.tipo === 'saida' && f.conta === FIADO) {
    const cad = caderneta();
    pedido = Object.assign(base, { tipo: 'saida', conta: '', fiado: true, compromisso: cad.nome, categoria: f.cat || 'Mercado/caderneta',
      item: f.item, lugar: f.lugar, obs: 'fiado' });
    msg = 'Anotado na caderneta: agora ' + brl(cad.valor + valor);
  } else if (f.tipo === 'saida') {
    const doEnvelope = f.conta === CONTA_ENVELOPES && !f.compromisso;
    if (doEnvelope) {
      if (!f.cat) { avisar('Escolha com o quê.', true); return; }
      if (!f.envelope) { avisar('Escolha de qual envelope sai.', true); return; }
      // Não essencial: o primeiro toque só mostra o aviso; o segundo confirma.
      if (ESSENCIAIS.indexOf(f.cat) < 0 && !f.confirmarTirar) { f.confirmarTirar = true; render(); return; }
    }
    const passa = passaDoLivre(f, valor);
    if (passa) {
      if (!f.cat) { avisar('Escolha com o quê.', true); return; }
      if (ESSENCIAIS.indexOf(f.cat) < 0 && !f.confirmarTirar) { f.confirmarTirar = true; render(); return; }
    }
    pedido = Object.assign(base, { tipo: 'saida', categoria: f.cat || 'Outro', item: f.item, lugar: f.lugar, compromisso: f.compromisso || '',
      envelope: doEnvelope ? f.envelope : '',
      tirarDe: passa ? passa.plano.map((t) => ({ envelope: t.envelope, valor: t.valor })) : [],
      obs: doEnvelope ? 'tirado do envelope ' + f.envelope : passa ? 'passou do livre: tirou de ' + passa.plano.map((t) => t.envelope).join(', ') : '' });
    msg = f.compromisso ? f.compromisso + ': pago e anotado' : doEnvelope ? 'Anotado. Saiu de ' + f.envelope
      : passa ? 'Anotado. Saiu de ' + passa.plano.map((t) => t.envelope).join(', ') : 'Anotado';
  } else if (f.tipo === 'entrada') {
    if (f.div.reduce((s, l) => s + l.real, 0) > valor + 0.001) { avisar('A divisão passou do valor que entrou.', true); return; }
    pedido = Object.assign(base, { tipo: 'entrada', categoria: f.cat || 'Outro', divisao: f.div, compromisso: f.compromisso || '' });
    const marco = f.div.find((l) => l.real < l.sugerido);
    msg = marco ? `Dividido. ${marco.envelope} ficou ${brl(marco.sugerido - marco.real)} abaixo do sugerido` : 'Dividido como o sugerido';
  } else if (f.tipo === 'mover') {
    if (f.conta === f.para) { avisar('Escolha contas diferentes.', true); return; }
    pedido = Object.assign(base, { tipo: 'mover', contaDestino: f.para, deQuem: 'Pessoal' });
    msg = 'Movido. Não conta como gasto';
  } else if (f.tipo === 'guardar') {
    pedido = Object.assign(base, { tipo: 'mover', contaDestino: f.envelope === ENV_PREVISTOS ? f.conta : CONTA_ENVELOPES, envelope: f.envelope, deQuem: 'Pessoal',
      divisao: [{ envelope: f.envelope, sugerido: valor, real: valor }], obs: 'guardar no envelope' });
    msg = 'Guardado em ' + f.envelope;
  }
  if (f.substitui) { pedido.substitui = f.substitui; msg = 'Corrigido'; }
  f.salvando = true; render();
  try {
    await api('registrar', pedido);
    S.folha = null;
    // Pagou a caderneta: pergunta quanto já ficou a do próximo mês.
    if (f.tipo === 'saida' && f.conta !== FIADO && f.compromisso && /^Caderneta/.test(f.compromisso) && !f.substitui) {
      S.folha = { tipo: 'proxCaderneta', nome: f.compromisso, valor: '', erro: '' };
    }
    // Dividiu dinheiro que caiu fora do Mercado Pago: já pede para mandar.
    const paraMandar = f.tipo === 'entrada' ? f.div.filter((l) => l.envelope !== ENV_PREVISTOS).reduce((s, l) => s + l.real, 0) : 0;
    if (paraMandar > 0 && f.conta !== CONTA_ENVELOPES && contasAtivas().some((c) => c.nome === CONTA_ENVELOPES)) {
      S.folha = { tipo: 'mandarMP', valorNum: paraMandar, conta: f.conta, quem: f.quem };
    }
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
  if (!S.dados && S.erroCarga) {
    const motivo = S.erroCarga === 'rede' ? 'O celular não conseguiu falar com a planilha. Confira a internet (Wi-Fi ou dados).'
      : 'A planilha respondeu com erro.';
    tela.innerHTML = `<div class="carregando" style="display:flex;flex-direction:column;gap:14px;align-items:center;text-align:center">
      <b style="color:var(--texto)">Não abriu</b><span>${esc(motivo)}</span>
      <span style="font-size:12px;opacity:.7">Detalhe: ${esc(S.erroCarga)}</span>
      <button class="principal" data-a="tentar">Tentar de novo</button></div>`;
    nav.hidden = true; return;
  }
  if (!S.dados) {
    tela.innerHTML = `<div class="esqueleto" style="height:52px;border-radius:18px"></div><div class="esqueleto" style="height:210px;border-radius:30px"></div>
      <div class="esqueleto" style="height:96px"></div><div class="esqueleto" style="height:150px"></div>`;
    nav.hidden = true; S.animar = true; carregar(); return;
  }
  const telas = { inicio: telaInicio, envelopes: telaEnvelopes, mes: telaMes, jornada: telaJornada };
  tela.classList.toggle('parada', !S.animar);
  S.animar = false;
  tela.innerHTML = telas[S.tab]();
  animarLivre();
  nav.hidden = false;
  nav.innerHTML = [['inicio', 'Início'], ['envelopes', 'Envelopes'], ['mes', 'Mês'], ['jornada', 'Jornada']]
    .map(([id, nome]) => `<button class="${S.tab === id ? 'on' : ''}" data-a="tab" data-v="${id}"><span>${IC[id]}</span>${nome}</button>`).join('');
  // A folha só "sobe" quando abre. Se já estava aberta (ex.: tocou numa tecla),
  // redesenha sem animar — senão ela desce e volta a cada número.
  const folha = document.getElementById('folha');
  const jaAberta = !!folha.querySelector('.folha');
  folha.innerHTML = folhaHtml();
  if (jaAberta) folha.querySelectorAll('.folha, .fundo-folha, .lista').forEach((el) => { el.style.animation = 'none'; });
}

// Troca de aba recomeça a animação e volta ao topo.
function irPara(tab) { S.tab = tab; S.animar = true; window.scrollTo(0, 0); const t = document.getElementById('tela'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; render(); }

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
  tirarEnv: (v) => { abrirFolha('saida', { conta: CONTA_ENVELOPES, envelope: v }); render(); },
  verPrev: (v) => { S.folha = { tipo: 'prevVer', nome: v }; render(); },
  prevGastar: () => {
    const c = (S.dados.compromissos || []).find((x) => x.nome === S.folha.nome) || {};
    const pessoa = c.quem || eu;
    abrirFolha('saida', { compromisso: c.nome, valor: String(c.valor || '').replace('.', ','), item: c.nome, cat: c.categoria || null, quem: pessoa, conta: contaDe(pessoa) });
    render();
  },
  passarParaHoje: async () => {
    const amanha = dataDoQuando('Amanhã');
    const lista = previstos().filter((c) => c.proximaData === amanha);
    try {
      for (const c of lista) await api('previstoAdiar', { nome: c.nome, data: S.dados.hoje });
      avisar(lista.length + (lista.length === 1 ? ' previsto passou' : ' previstos passaram') + ' para hoje'); await carregar();
    } catch (e) { if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); carregar(); }
  },
  previsao: () => { S.previsaoAberta = !S.previsaoAberta; render(); },
  ganhoCaiu: (v) => {
    const c = (S.dados.compromissos || []).find((x) => x.nome === v);
    if (!c) return;
    const pessoa = c.quem || eu;
    abrirFolha('entrada', { valor: String(c.valor || '').replace('.', ','), cat: c.categoria || null, quem: pessoa, conta: contaDe(pessoa), compromisso: c.nome });
    render();
  },
  verPrevGastar: (v) => { S.folha = { tipo: 'prevVer', nome: v }; acoes.prevGastar(); },
  prevNao: async (v) => {
    try { await api('previstoCancelar', { nome: v }); avisar('Certo, tirado da lista'); carregar(); }
    catch (e) { if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); }
  },
  prevAdiar: async (v) => {
    try { await api('previstoAdiar', { nome: v, data: dataDoQuando('Amanhã') }); S.folha = null; avisar('Passou para amanhã'); carregar(); }
    catch (e) { if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); }
  },
  prevCancelar: async () => {
    const f = S.folha;
    if (!f.confirmarCancelar) { f.confirmarCancelar = true; render(); return; }
    f.salvando = true; render();
    try { await api('previstoCancelar', { nome: f.nome }); S.folha = null; avisar('Tirado da lista'); carregar(); }
    catch (e) { f.salvando = false; if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); render(); }
  },
  salvarPrev: async () => {
    const f = S.folha;
    const nome = (f.nomePrev || '').trim();
    if (!nome) { avisar('Escreva o que vai ser.', true); return; }
    if (!f.quando && !f.dataAtual && !f.dataExata) { avisar('Escolha quando.', true); return; }
    const data = f.dataExata || (f.quando ? dataDoQuando(f.quando) : f.dataAtual);
    const ganho = f.tipo === 'ganho';
    const valor = parseFloat(f.valor.replace(',', '.')) || 0;
    f.salvando = true; render();
    try {
      const repete = ganho ? (f.repete || 'unica') : '';
      if (f.editandoPrev) await api('previstoEditar', { nomeAntigo: f.editandoPrev, nome, valor, data, categoria: f.cat || 'Outro', quemGasta: f.quemGasta, repete });
      else await api('previsto', { nome, valor, data, quem: eu, quemGasta: f.quemGasta || eu, categoria: f.cat || 'Outro', entrada: ganho, repete });
      S.folha = null; avisar(f.editandoPrev ? 'Atualizado' : ganho ? 'Entrada prevista anotada' : 'Previsto anotado'); await carregar();
    } catch (e) { f.salvando = false; if (e.message !== 'chave') avisar(e.message === 'ja_existe' ? 'Já existe um com esse nome.' : 'Não salvou. Tente de novo.', true); render(); }
  },
  mandarMP: (v) => {
    const minha = eu === 'Débora' ? 'Inter Débora' : 'Inter Gabriel';
    S.folha = { tipo: 'mandarMP', valorNum: Number(v) || 0, conta: minha, quem: eu }; render();
  },
  jaMandei: async () => {
    const f = S.folha;
    f.salvando = true; render();
    try {
      await api('registrar', { tipo: 'mover', valor: f.valorNum, conta: f.conta, contaDestino: CONTA_ENVELOPES, quem: f.quem || eu, deQuem: 'Pessoal', obs: 'dinheiro dos envelopes' });
      S.folha = null; avisar('Anotado. Dinheiro dos envelopes no ' + CONTA_ENVELOPES); await carregar();
    } catch (e) { f.salvando = false; if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); render(); }
  },
  verRegistro: (v) => { const r = (S.dados.recentes || []).find((x) => x.id === v); if (r) { S.folha = { tipo: 'registro', reg: r }; render(); } },
  fechar: () => { S.folha = null; render(); },
  voltar: () => { S.folha.passo--; render(); },
  mudarValor: () => { S.folha.valor = ''; S.folha.passo = 1; render(); },
  tentar: () => { S.erroCarga = ''; render(); },
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
  campo: (v) => { const [campo, valor] = v.split('|'); const f = S.folha; if (campo === 'quando') f.dataExata = ''; f[campo] = (campo === 'compromisso' && f[campo] === valor) ? null : valor; f.confirmarTirar = false; render(); },
  criarCat: () => { S.folha.criandoCat = true; render(); const el = document.getElementById('campo-novacat'); if (el) el.focus(); },
  copiarPix: async () => {
    const pix = S.dados.pixMP;
    try { await navigator.clipboard.writeText(pix); avisar('Chave copiada. Cole no Pix do banco'); }
    catch (e) {
      // Navegador sem permissão de copiar: usa o jeito antigo.
      const t = document.createElement('textarea'); t.value = pix; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); avisar('Chave copiada. Cole no Pix do banco'); } catch (e2) { avisar('Não copiou. A chave é ' + pix, true); }
      t.remove();
    }
  },
  salvarProxCad: async () => {
    const f = S.folha;
    f.salvando = true; render();
    try { await api('contaFixaValor', { nome: f.nome, valor: numBR(f.valor) }); S.folha = null; avisar('Caderneta nova começou em ' + brl(numBR(f.valor))); await carregar(); }
    catch (e) { f.salvando = false; if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); render(); }
  },
  acertar: () => {
    const contas = {}, envs = {};
    contasAtivas().forEach((c) => { contas[c.nome] = txtBR(c.saldo); });
    (S.dados.envelopes || []).forEach((e) => { envs[e.nome] = txtBR(Math.max(0, e.guardado)); });
    S.folha = { tipo: 'acertar', contas, envs, inicio: { contas: Object.assign({}, contas), envs: Object.assign({}, envs) } };
    render();
  },
  salvarAcerto: async () => {
    const f = S.folha;
    const disp = contasAtivas().filter((c) => c.disponivel).map((c) => c.nome);
    const livre = disp.reduce((s, n) => s + numBR(f.contas[n]), 0) - Object.keys(f.envs).reduce((s, n) => s + numBR(f.envs[n]), 0);
    if (livre < -0.009) { avisar('Os envelopes passam do dinheiro das contas. Diminua algum.', true); return; }
    const contas = contasAtivas().filter((c) => Math.abs(numBR(f.contas[c.nome]) - c.saldo) >= 0.01)
      .map((c) => ({ conta: c.nome, saldoApp: c.saldo, real: numBR(f.contas[c.nome]) }));
    const envelopes = (S.dados.envelopes || []).map((e) => ({ envelope: e.nome, delta: numBR(f.envs[e.nome]) - Math.max(0, e.guardado) }))
      .filter((e) => Math.abs(e.delta) >= 0.01);
    if (!contas.length && !envelopes.length) { S.folha = null; avisar('Já estava tudo certo'); render(); return; }
    f.salvando = true; render();
    try { await api('acertarTudo', { contas, envelopes, quem: eu }); S.folha = null; avisar('Tudo acertado com o banco'); await carregar(); }
    catch (e) { f.salvando = false; if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); render(); }
  },
  reequilibrar: async () => {
    const din = contasDoDinheiro();
    if (din.excesso <= 0) return;
    const pl = planoTirar(din.excesso);
    try {
      await api('tirarEnvelopes', { itens: pl.plano.map((t) => ({ envelope: t.envelope, valor: t.valor })) });
      avisar('Acertado. Saiu de ' + pl.plano.map((t) => t.envelope).join(', ')); await carregar();
    } catch (e) { if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); }
  },
  editarPrev: () => {
    const c = (S.dados.compromissos || []).find((x) => x.nome === S.folha.nome);
    if (!c) return;
    S.folha = { tipo: ehGanho(c) ? 'ganho' : 'previsto', passo: 2, repete: c.repete || 'unica', valor: String(c.valor || '').replace('.', ','), nomePrev: c.nome, cat: c.categoria || null,
      quando: null, dataAtual: c.proximaData || '', editandoPrev: c.nome, quemGasta: c.quem || eu, erro: '' };
    render();
  },
  editarReg: () => {
    const r = S.folha.reg;
    const comum = { valor: String(r.valor).replace('.', ','), conta: r.conta, quem: r.quem || eu, deQuem: r.deQuem || 'Pessoal', substitui: r.id };
    if (r.tipo === 'saida' && r.obs === 'fiado') abrirFolha('saida', Object.assign(comum, { conta: FIADO, cat: r.categoria || null, item: r.item || '', lugar: r.lugar || '' }));
    else if (r.tipo === 'saida') abrirFolha('saida', Object.assign(comum, { cat: r.categoria || null, item: r.item || '', lugar: r.lugar || '', compromisso: r.compromisso || null, envelope: r.envelope || null }));
    else if (r.tipo === 'entrada') abrirFolha('entrada', Object.assign(comum, { cat: r.categoria || null }));
    else if (r.tipo === 'mover' && r.envelope) abrirFolha('guardar', Object.assign(comum, { envelope: r.envelope }));
    else abrirFolha('mover', Object.assign(comum, { para: r.contaDestino }));
    render();
  },
  ajustar: (v) => {
    const c = contasAtivas().find((x) => x.nome === v);
    if (c) { S.folha = { tipo: 'ajuste', conta: c.nome, saldoApp: c.saldo, valor: '', erro: '' }; render(); }
  },
  salvarAjuste: async () => {
    const f = S.folha;
    if (f.valor === '') { avisar('Digite o saldo do banco.', true); return; }
    const real = parseFloat(f.valor.replace(',', '.')) || 0;
    const dif = Math.round((real - f.saldoApp) * 100) / 100;
    if (!dif) { S.folha = null; avisar('Já estava certo'); render(); return; }
    f.salvando = true; render();
    try {
      await api('registrar', { tipo: dif > 0 ? 'entrada' : 'saida', valor: Math.abs(dif), categoria: 'Ajuste', conta: f.conta, quem: eu,
        obs: 'ajuste: app dizia ' + f.saldoApp.toFixed(2) + ', banco dizia ' + real.toFixed(2) });
      S.folha = null; avisar('Saldo corrigido'); await carregar();
    } catch (e) { f.salvando = false; if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); render(); }
  },
  editarEnv: (v) => {
    const e = (S.dados.envelopes || []).find((x) => x.nome === v);
    if (!e) return;
    // Meta que é a soma das contas (sem meta escrita) aparece em branco.
    const somaContas = (S.dados.compromissos || []).filter((c) => c.envelope === v).reduce((s, c) => s + c.valor, 0);
    const metaEscrita = e.meta && Math.abs(e.meta - somaContas) > 0.001 ? String(e.meta).replace('.', ',') : '';
    S.folha = { tipo: 'envEditar', nome: v, meta: metaEscrita, dataAlvo: e.dataAlvo || '' };
    render();
  },
  salvarEnv: async () => {
    const f = S.folha;
    f.salvando = true; render();
    try {
      const meta = (f.meta || '').trim();
      await api('envelopeEditar', { nome: f.nome, meta: meta === '' ? '' : parseFloat(meta.replace(/\./g, '').replace(',', '.')) || 0, dataAlvo: f.dataAlvo || '' });
      S.folha = null; avisar('Envelope atualizado'); await carregar();
    } catch (e) { f.salvando = false; if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); render(); }
  },
  novaFixa: () => {
    // Vindo do "Saiu": guarda a anotação para voltar a ela depois de criar.
    const anterior = S.folha && S.folha.tipo === 'saida' ? S.folha : null;
    S.folha = { tipo: 'fixa', nome: '', valorTxt: '', dia: '', repete: 'mensal', parcelas: '', envelope: 'Contas da casa', anterior };
    render();
  },
  editarFixa: (v) => {
    const c = (S.dados.compromissos || []).find((x) => x.nome === v);
    if (!c) return;
    if (ehPrevisto(c)) { S.folha = { tipo: 'prevVer', nome: v }; render(); return; }
    S.folha = { tipo: 'fixa', nomeAntigo: c.nome, nome: c.nome, valorTxt: c.valor ? String(c.valor).replace('.', ',') : '',
      dia: c.diaDoMes ? String(c.diaDoMes) : '', repete: c.repete || 'mensal', parcelas: c.parcelasRestantes === '' || c.parcelasRestantes == null ? '' : String(c.parcelasRestantes),
      envelope: c.envelope || '' };
    render();
  },
  salvarFixa: async () => {
    const f = S.folha;
    const nome = (f.nome || '').trim();
    if (!nome) { avisar('Escreva o nome.', true); return; }
    const dia = (f.dia || '').trim();
    if (dia && !(Number(dia) >= 1 && Number(dia) <= 31)) { avisar('O dia vai de 1 a 31.', true); return; }
    f.salvando = true; render();
    try {
      await api('contaFixa', { nomeAntigo: f.nomeAntigo || '', nome, valor: parseFloat((f.valorTxt || '').replace(/\./g, '').replace(',', '.')) || '',
        dia, repete: f.repete, parcelas: (f.parcelas || '').trim(), envelope: f.envelope || '' });
      const volta = f.anterior;
      S.folha = volta || null;
      if (volta) volta.compromisso = nome;
      avisar(f.nomeAntigo ? 'Conta atualizada' : 'Conta fixa criada');
      await carregar();
    } catch (e) {
      f.salvando = false;
      if (e.message !== 'chave') avisar(e.message === 'ja_existe' ? 'Já existe uma conta com esse nome.' : 'Não salvou. Tente de novo.', true);
      render();
    }
  },
  encerrarFixa: async () => {
    const f = S.folha;
    if (!f.confirmarCancelar) { f.confirmarCancelar = true; render(); return; }
    f.salvando = true; render();
    try { await api('contaFixaEncerrar', { nome: f.nomeAntigo }); S.folha = null; avisar('Tirada da lista'); carregar(); }
    catch (e) { f.salvando = false; if (e.message !== 'chave') avisar('Não salvou. Tente de novo.', true); render(); }
  },
  modoTirar: () => { const f = S.folha; f.tirandoCat = !f.tirandoCat; f.tirarCat = null; render(); },
  tirarCat: async (v) => {
    const f = S.folha;
    if (f.tirarCat !== v) { f.tirarCat = v; render(); return; }
    const tipo = ['entrada', 'ganho'].includes(f.tipo) ? 'entrada' : 'saida';
    try {
      await api('categoriaTirar', { nome: v, tipo });
      S.dados.categorias = S.dados.categorias.filter((c) => !(c.nome === v && c.tipo === tipo));
      if (f.cat === v) f.cat = null;
      f.tirarCat = null; avisar(v + ' tirada. Os gastos antigos dela continuam contando');
    } catch (e) { if (e.message !== 'chave') avisar('Não tirou. Tente de novo.', true); }
    render();
  },
  salvarCat: async () => {
    const f = S.folha, nome = (f.novaCat || '').trim();
    if (!nome) return;
    f.salvando = true; render();
    try {
      await api('categoria', { nome, tipo: ['entrada', 'ganho'].includes(f.tipo) ? 'entrada' : 'saida' });
      S.dados.categorias.push({ nome, tipo: ['entrada', 'ganho'].includes(f.tipo) ? 'entrada' : 'saida', teto: 0, cor: '#5B6270' });
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
  saldoIni: () => {
    const faltam = contasAtivas().filter((c) => !c.temSaldoInicial).map((c) => c.nome);
    if (!faltam.length) return;
    S.folha = { tipo: 'saldo', conta: faltam[0], faltam, posicao: 1, totalContas: faltam.length, valor: '', erro: '' };
    render();
  },
  salvarSaldo: async () => {
    const f = S.folha;
    if (f.valor === '') { f.erro = 'Digite o valor (ou 0).'; render(); return; }
    f.salvando = true; render();
    try {
      await api('saldoInicial', { conta: f.conta, valor: parseFloat(f.valor.replace(',', '.')) || 0 });
    } catch (e) {
      f.salvando = false;
      if (e.message === 'ja_tem') avisar(f.conta + ' já tinha saldo inicial.', true);
      else if (e.message !== 'chave') { avisar('Não salvou. Tente de novo.', true); render(); return; }
    }
    const resto = f.faltam.slice(1);
    if (resto.length) {
      S.folha = { tipo: 'saldo', conta: resto[0], faltam: resto, posicao: f.posicao + 1, totalContas: f.totalContas, valor: '', erro: '' };
      render();
    } else {
      S.folha = null;
      avisar('Ponto de partida salvo. A contagem começou');
      carregar();
    }
  },
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
// Valor digitado na divisão: atualiza o "livre" na hora, sem redesenhar
// (redesenhar fecharia o teclado). Ao sair do campo, aí sim redesenha.
document.addEventListener('input', (e) => {
  const i = e.target.dataset && e.target.dataset.div;
  if (i === undefined || !S.folha || !S.folha.div) return;
  const f = S.folha;
  f.div[i].real = Math.max(0, parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0);
  const total = parseFloat((f.valor || '0').replace(',', '.')) || 0;
  const el = document.getElementById('livre-div');
  if (el) el.textContent = brl(Math.max(0, total - f.div.reduce((s, l) => s + l.real, 0)));
});
document.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.div !== undefined) render(); });
document.addEventListener('input', (e) => {
  const a = e.target.dataset && e.target.dataset.acerto;
  if (!a || !S.folha || S.folha.tipo !== 'acertar') return;
  const [tipo, nome] = a.split('|');
  S.folha[tipo === 'conta' ? 'contas' : 'envs'][nome] = e.target.value;
  const el = document.getElementById('acerto-livre');
  if (el) el.innerHTML = resumoAcerto(S.folha);
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
