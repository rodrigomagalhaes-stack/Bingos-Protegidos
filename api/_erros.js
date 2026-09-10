// O erro que não é culpa de quem está na tela.

export function falhaInesperada(res, e, onde, mensagem) {
  // Deploy antigo, publicado antes de as variáveis existirem. Cada deploy da
  // Vercel guarda um endereço próprio para sempre, então um link velho continua
  // respondendo — e sem configuração ele nunca vai funcionar. Dizer "tente de
  // novo" aqui manda a pessoa repetir uma coisa que não pode dar certo.
  if (e?.configuracao) {
    return res.status(500).json({
      erro: 'Este endereço está sem configuração — provavelmente é o link de um deploy antigo. Use https://bingos-protegidos.vercel.app',
    })
  }

  console.error(`${onde}:`, e?.message)
  return res.status(500).json({ erro: mensagem })
}
