import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { rest } from './_supabase.js'

// A conta do tipster: senha e sessão.
//
// NÃO É O LOGIN DO SUPABASE, de propósito. Todo usuário do Supabase Auth vira o
// papel `authenticated`, e as políticas do BI liberam tudo para esse papel — um
// tipster com conta lá leria o BI inteiro. Aqui a conta é uma linha de
// `protegidos_contas`, que só estas funções leem, com a chave de serviço.
//
// A SESSÃO é um cookie assinado: o id da conta e a validade, com um HMAC por
// cima. Não há tabela de sessões — a assinatura é a prova, e quem não tem
// SESSAO_SEGREDO não consegue fabricar uma. O cookie é HttpOnly (o JavaScript
// da página não o lê, então um script injetado não o leva embora) e SameSite=Lax
// (outro site não consegue fazer o navegador enviá-lo num POST para cá).

const scrypt = promisify(scryptCallback)

const COOKIE = 'bp_sessao'
const DURACAO = 30 * 24 * 60 * 60 // segundos

/** O segredo que assina o cookie. Sem ele não há como abrir sessão nenhuma. */
export function exigirSegredo() {
  const segredo = process.env.SESSAO_SEGREDO
  // Segredo curto é segredo adivinhável, e adivinhar o segredo é assinar o
  // cookie de qualquer conta.
  if (!segredo || segredo.length < 32) {
    const erro = new Error('SESSAO_SEGREDO ausente ou curto demais (mínimo 32 caracteres).')
    erro.configuracao = true
    throw erro
  }
  return segredo
}

// ── senha ────────────────────────────────────────────────────────────────────
// scrypt vem no próprio Node, sem dependência, e é lento de propósito: é isso
// que torna caro testar senhas contra os hashes se a tabela um dia vazar.

export async function gerarHash(senha) {
  const sal = randomBytes(16)
  const hash = await scrypt(String(senha), sal, 64)
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`
}

export async function conferirSenha(senha, guardado) {
  const [tipo, sal, hash] = String(guardado ?? '').split('$')
  if (tipo !== 'scrypt' || !sal || !hash) return false
  const esperado = Buffer.from(hash, 'base64')
  const calculado = await scrypt(String(senha), Buffer.from(sal, 'base64'), esperado.length)
  return timingSafeEqual(calculado, esperado)
}

// ── sessão ───────────────────────────────────────────────────────────────────

const assinar = (corpo) => createHmac('sha256', exigirSegredo()).update(corpo).digest('base64url')

export function abrirSessao(req, res, contaId) {
  const exp = Math.floor(Date.now() / 1000) + DURACAO
  const corpo = Buffer.from(JSON.stringify({ id: contaId, exp })).toString('base64url')
  res.setHeader('Set-Cookie', cookie(req, `${corpo}.${assinar(corpo)}`, DURACAO))
}

export function fecharSessao(req, res) {
  res.setHeader('Set-Cookie', cookie(req, '', 0))
}

/** O id da conta no cookie — nulo sem cookie, com assinatura que não bate ou vencido. */
export function lerSessao(req) {
  const valor = lerCookie(req, COOKIE)
  if (!valor) return null

  const [corpo, assinatura] = valor.split('.')
  if (!corpo || !assinatura) return null

  // Tempo constante: uma comparação comum para no primeiro caractere
  // diferente, e medir o tempo da resposta ensinaria a assinatura aos poucos.
  const esperada = Buffer.from(assinar(corpo))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null

  try {
    const { id, exp } = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf-8'))
    if (typeof id !== 'string' || !(exp > Date.now() / 1000)) return null
    return id
  } catch {
    return null
  }
}

/** A conta logada, lida do banco. Nula sem sessão válida, ou se a conta não existe mais. */
export async function contaLogada(req, campos = 'id,nome,email') {
  const id = lerSessao(req)
  if (!id) return null
  const [conta] = await rest(`protegidos_contas?id=eq.${encodeURIComponent(id)}&select=${campos}`)
  return conta ?? null
}

// `Secure` só fora de localhost: o servidor local é http, e há navegador que
// descarta cookie Secure vindo de http — o login daria certo e ninguém ficaria
// logado.
function cookie(req, valor, maxAge) {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers?.host ?? ''))
  return [
    `${COOKIE}=${valor}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(local ? [] : ['Secure']),
  ].join('; ')
}

function lerCookie(req, nome) {
  for (const parte of String(req.headers?.cookie ?? '').split(';')) {
    const i = parte.indexOf('=')
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim()
  }
  return null
}
