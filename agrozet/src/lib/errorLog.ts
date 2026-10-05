import { getAdminSupabase } from './supabaseAdmin'

/**
 * Erro operacional: falha não-fatal num caminho que não pode abortar (webhook,
 * cron). NUNCA lança — um erro ao registrar erro não pode derrubar o chamador,
 * senão o webhook devolve 500 e a Meta reentrega em loop.
 */
export async function logOperationalError(
  origem: string,
  mensagem: string,
  contexto?: unknown
): Promise<void> {
  try {
    await getAdminSupabase().from('operational_errors').insert({
      origem,
      mensagem: mensagem.slice(0, 2000),
      contexto: contexto === undefined ? null : JSON.parse(JSON.stringify(contexto)),
    })
  } catch (e) {
    console.error('[errorLog] falhou ao registrar', origem, mensagem, e)
  }
}
