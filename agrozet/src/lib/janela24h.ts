// Janela de atendimento de 24h da API oficial do WhatsApp: conta a partir do
// created_at da última mensagem recebida do lead (inbound). Sem inbound nas
// últimas 24h, a janela está fechada e só template (disparo) pode sair.
export const WINDOW_MS = 24 * 60 * 60 * 1000
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

export type WindowStatus = {
  isOpen: boolean
  timeLeft: string
  statusColor: 'green' | 'yellow' | 'red'
}

type MensagemJanela = { direction: string; created_at: string }

export function getWindowStatus(messages: MensagemJanela[], now: Date): WindowStatus {
  let lastInboundTime = 0
  for (const m of messages) {
    if (m.direction === 'inbound') {
      const t = new Date(m.created_at).getTime()
      if (t > lastInboundTime) lastInboundTime = t
    }
  }
  if (lastInboundTime === 0) return { isOpen: false, timeLeft: '', statusColor: 'red' }

  const remaining = WINDOW_MS - (now.getTime() - lastInboundTime)
  if (remaining <= 0) return { isOpen: false, timeLeft: '', statusColor: 'red' }

  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  const timeLeft = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  const statusColor: WindowStatus['statusColor'] = remaining > TWO_HOURS_MS ? 'green' : 'yellow'
  return { isOpen: true, timeLeft, statusColor }
}

export const WINDOW_COLORS: Record<WindowStatus['statusColor'], string> = {
  green: 'oklch(0.60 0.15 160)',
  yellow: 'oklch(0.75 0.16 75)',
  red: 'oklch(0.577 0.245 27.325)',
}

export const WINDOW_DOTS: Record<WindowStatus['statusColor'], string> = {
  green: '🟢',
  yellow: '🟡',
  red: '🔴',
}

// Sinal de "esta conversa já foi reativada e o lead ainda não respondeu": existe um
// disparo enviado DEPOIS do último inbound. Derivar do histórico (em vez de guardar
// estado no componente) faz o bloqueio sobreviver a troca de conversa e a reload.
// Casa só o TEMPLATE DE REATIVAÇÃO (content === corpoReativacao) — disparo de
// campanha (Disparos.tsx, SendDisparoDialog.tsx, worker do cron) grava o mesmo
// message_type 'disparo' e não pode travar o botão sem que a reativação exista.
// Custo dessa escolha: a comparação é por igualdade EXATA de string. Se o corpo
// aprovado do template mudar na Meta e a constante CORPO_REATIVACAO (em
// useReativarConversa.ts) acompanhar a edição, as reativações antigas — gravadas
// com o corpo anterior — deixam de casar: o botão destrava e a operadora pode
// reenviar o template para um lead que já o recebeu.
type MensagemDisparo = {
  direction: string
  created_at: string
  message_type: string
  content: string | null
}

export function reativacaoJaEnviada(messages: MensagemDisparo[], corpoReativacao: string): boolean {
  let lastInboundTime = 0
  let lastDisparoTime = 0
  for (const m of messages) {
    const t = new Date(m.created_at).getTime()
    if (m.direction === 'inbound' && t > lastInboundTime) lastInboundTime = t
    if (
      m.direction === 'outbound' &&
      m.message_type === 'disparo' &&
      m.content === corpoReativacao &&
      t > lastDisparoTime
    ) {
      lastDisparoTime = t
    }
  }
  return lastDisparoTime > lastInboundTime
}

// Caso novo: lead que nunca mandou inbound. O template de reativação fala de
// "continuar de onde paramos" — não faz sentido para quem nunca conversou.
type MensagemInbound = { direction: string }

export function nuncaRespondeu(messages: MensagemInbound[]): boolean {
  return !messages.some((m) => m.direction === 'inbound')
}
