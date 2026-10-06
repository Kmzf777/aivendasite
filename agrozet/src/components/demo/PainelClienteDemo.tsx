'use client'

import { PawPrint, Phone, X } from 'lucide-react'
import ServicoChip from '@/components/conversations/ServicoChip'
import { formatarTelefoneBr } from '@/lib/listaConversas'
import { cn, toTitleCase } from '@/lib/utils'
import type { ConversaDemo } from '@/lib/demo/dados'

/**
 * Painel de contexto do cliente — FASE 2, mostrado no demo.
 *
 * HONESTIDADE ANTES DE IMPRESSIONAR: esta coluna NÃO existe na Fase 1 do
 * produto. A tela de clientes e o cadastro de pets são Fase 2. Mostrar o painel
 * sem rótulo faria a cliente comprar algo que ainda não está pronto e descobrir
 * depois — então o selo "Fase 2" fica no cabeçalho do painel, legível, e o pé
 * explica o que falta. O painel entra no demo porque é o PRÓXIMO passo e vale
 * mais mostrado que descrito.
 */
type Props = {
  phone: string
  nome: string | null
  ultimoServico: string | null
  pets: ConversaDemo['pets']
  /** Só no layout estreito, onde o painel vira sobreposição. */
  onFechar?: () => void
  className?: string
}

export default function PainelClienteDemo({
  phone,
  nome,
  ultimoServico,
  pets,
  onFechar,
  className,
}: Props) {
  return (
    <aside
      aria-label="Contexto do cliente (Fase 2)"
      className={cn('flex min-h-0 flex-col border-l border-border bg-card', className)}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate font-display text-base leading-tight">Cliente</h2>
        {/* Selo discreto mas inequívoco. Borda tracejada = "ainda não construído". */}
        <span className="shrink-0 rounded-full border border-dashed border-laranja-escuro/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-laranja-escuro uppercase">
          Fase 2
        </span>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar painel do cliente"
            className="rounded-md p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="scroll-soft min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div>
          <p className="font-display text-lg leading-tight">
            {nome ? toTitleCase(nome) : 'Sem cadastro'}
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Phone aria-hidden className="size-3.5" />
            {formatarTelefoneBr(phone)}
          </p>
          {!nome && (
            // O caso anônimo é o motivo de a tela de clientes existir: hoje o
            // nome só entra digitado por gente (regra 3 do CLAUDE.md).
            <p className="mt-2 text-xs text-muted-foreground">
              Este número ainda não tem nome no cadastro. Na Fase 2 o atendente digita o
              nome aqui — o bot nunca sobrescreve o que foi corrigido à mão.
            </p>
          )}
        </div>

        <div>
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Último serviço
          </h3>
          <div className="mt-1.5">
            {ultimoServico ? (
              <ServicoChip botaoId={ultimoServico} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum ainda — este cliente não escolheu opção no menu.
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Pets {pets.length > 0 && `(${pets.length})`}
          </h3>
          {pets.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Nenhum pet cadastrado para este número.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {pets.map((p) => (
                <li
                  key={p.nome}
                  className="rounded-xl border border-border bg-background px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <PawPrint aria-hidden className="size-4 shrink-0 text-laranja-escuro" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {p.nome}
                    </span>
                  </div>
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                    <dt className="text-muted-foreground">Espécie</dt>
                    <dd>{p.especie}</dd>
                    <dt className="text-muted-foreground">Porte</dt>
                    <dd>{p.porte}</dd>
                    <dt className="text-muted-foreground">Raça</dt>
                    <dd>{p.raca ?? 'não informada'}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="shrink-0 border-t border-border bg-muted px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Este painel é uma <strong className="font-semibold">prévia da Fase 2</strong>. Na Fase 1
        — a que está pronta — existem as conversas, o bot de triagem e o envio pelo atendente.
        Cadastro de clientes, pets e histórico de serviços vêm depois.
      </p>
    </aside>
  )
}
