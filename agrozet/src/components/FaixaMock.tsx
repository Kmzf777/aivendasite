'use client'

import { FlaskConical, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reiniciar } from '@/lib/mock/store'

/**
 * Faixa de modo demonstração.
 *
 * Só é renderizada pelo layout de `(app)` quando `MODO_MOCK` — este componente
 * não reconfere a flag, porque quem decide é o layout (Server Component), e
 * assim o texto nunca pisca numa hidratação em produção.
 *
 * O texto é deliberadamente explícito nos quatro pontos que alguém olhando a
 * tela pela primeira vez poderia confundir com produção: os dados são
 * fictícios, nada sai para o WhatsApp de verdade, nada é gravado em banco e o
 * login está desligado. Discreta na altura (uma linha), inequívoca no conteúdo.
 *
 * Cor: amarelo da marca como PREENCHIMENTO e tinta marrom-escura como texto —
 * `--brand-amarelo` é realce e nunca recebe texto claro (nota 15 do CLAUDE.md).
 */
export default function FaixaMock() {
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-amarelo bg-amarelo/35 px-4 py-1.5 text-[11px] leading-4 text-secondary-foreground"
    >
      <FlaskConical aria-hidden className="size-3.5 shrink-0" />
      <strong className="font-semibold">Modo demonstração</strong>
      <span className="min-w-0 flex-1">
        Dados fictícios, em memória. Nenhuma mensagem é enviada de verdade e nada é
        gravado em banco. Login desativado.
      </span>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => reiniciar()}
        title="Devolve os dados de demonstração ao estado inicial"
      >
        <RotateCcw aria-hidden />
        Recomeçar
      </Button>
    </div>
  )
}
