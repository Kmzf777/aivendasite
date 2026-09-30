"use client";

import { useRef, useState } from "react";
import CardHistorico from "@/components/CardHistorico";
import CardObjecao from "@/components/CardObjecao";
import ModalConfig from "@/components/ModalConfig";
import PttFaixa from "@/components/PttFaixa";
import { useCatalogo } from "@/hooks/useCatalogo";
import { useCopiloto } from "@/hooks/useCopiloto";
import { useDispositivos } from "@/hooks/useDispositivos";
import { useSegurar } from "@/hooks/useSegurar";
import type { Modo } from "@/hooks/motorCopiloto";
import estilo from "./coldcall.module.css";

// ==================================================================
// /coldcall — o modo foco.
//
// Três faixas: quem está falando (com a curva de voz), o card, e o
// rastro da call. A transcrição NÃO aparece: em foco se lê o card.
//
// Toda a lógica de áudio, reconhecimento e decisão está no motor
// (hooks/motorCopiloto.ts), FORA do React. Esta página só desenha o
// estado dele e chama ações a partir de cliques e teclas.
//
// POR QUE NADA É LIGADO NUM EFEITO (a armadilha que vai morder quem
// mexer aqui): o StrictMode do Next monta e desmonta todo efeito duas
// vezes em desenvolvimento, e o Chrome permite UM SpeechRecognition por
// processo — a segunda montagem abortaria o reconhecedor da primeira e
// o reconhecimento morreria em silêncio, com a tela parecendo certa.
// Então ligar só acontece no clique em "Ligar", que é gesto do usuário e
// não é duplicado. Detalhes na trava de motorCopiloto.ts.
// ==================================================================
export default function ColdCall() {
  const { estado, motor } = useCopiloto();
  const { objecoes, erro: erroCatalogo } = useCatalogo();
  const { entradas, erro: erroEntradas, pronto } = useDispositivos();

  const noAr = estado.situacao === "ouvindo";
  const temArgumento = !!estado.card?.argumento;

  // A seta ↓ mostra o argumento completo enquanto estiver presa. NUNCA o
  // espaço: o espaço é o push-to-talk e pertence ao motor.
  const porTecla = useSegurar("ArrowDown", noAr && temArgumento);
  const [porDedo, setPorDedo] = useState(false);
  const aberto = porTecla || porDedo;

  const palco = useRef<HTMLDivElement>(null);

  const ligar = async (op: { idV: string; idC: string; modo: Modo }) => {
    await motor.ligar(op);
    // O foco volta para a tela: o botão "Ligar" desaparece e o espaço
    // tem que chegar ao documento, não a um controle esquecido.
    palco.current?.focus();
  };

  return (
    <main className={estilo.tela}>
      {!noAr && (
        <ModalConfig
          entradas={entradas}
          erroEntradas={erroEntradas}
          prontoEntradas={pronto}
          estado={estado}
          quantasObjecoes={objecoes.length}
          erroCatalogo={erroCatalogo}
          lerNiveis={motor.lerNiveis}
          aoTestar={(op) => void motor.testar(op)}
          aoPararTeste={() => motor.pararTeste()}
          aoLigar={(op) => void ligar(op)}
        />
      )}

      {noAr && (
        <>
          <PttFaixa
            modo={estado.modo}
            apertado={estado.apertado}
            ouvindo={noAr}
            ouvindoVoz={estado.ouvindoVoz}
            decidindo={estado.decidindo}
            esperando={estado.ultimaAcao === "esperar"}
            faseCall={estado.faseCall}
            ler={motor.lerCurva}
            escala={motor.escala}
            aoDesligar={motor.desligar}
          />

          <div className={estilo.palco} ref={palco} tabIndex={-1}>
            {estado.card ? (
              // A `key` fica AQUI, não dentro do componente: é ela que remonta
              // o card a cada decisão e faz a animação de acender renascer.
              // Chave dentro do próprio componente não remonta coisa nenhuma.
              <CardObjecao
                key={estado.card.chave}
                card={estado.card}
                aberto={aberto}
                aoSegurar={setPorDedo}
              />
            ) : (
              <div className={estilo.espera}>
                <span className="rotulo">ouvindo</span>
                <p>O card aparece aqui quando o cliente objetar.</p>
                {estado.modo === "tecla" && (
                  <p className={estilo.dica}>
                    Segure <kbd>espaço</kbd> enquanto você fala. Solto, o que entrar é do cliente.
                  </p>
                )}
              </div>
            )}
          </div>

          {(estado.aviso || estado.erro) && (
            <p className={`${estilo.recado} ${estado.erro ? estilo.recadoRuim : ""}`}>
              {estado.erro || estado.aviso}
            </p>
          )}

          <CardHistorico
            itens={estado.historico}
            decisoes={estado.decisoes}
            latencia={estado.latencia}
            custo={estado.custo}
            modelo={estado.modelo}
          />
        </>
      )}
    </main>
  );
}
