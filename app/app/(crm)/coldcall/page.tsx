"use client";

import { useRef, useState } from "react";
import CardHistorico from "@/components/CardHistorico";
import CardObjecao from "@/components/CardObjecao";
import FimDaLigacao from "@/components/FimDaLigacao";
import ModalConfig from "@/components/ModalConfig";
import PainelDicas from "@/components/PainelDicas";
import PttFaixa from "@/components/PttFaixa";
import { useCatalogo } from "@/hooks/useCatalogo";
import { useCopiloto } from "@/hooks/useCopiloto";
import { useDispositivos } from "@/hooks/useDispositivos";
import type { FluxoListado } from "@/hooks/useFluxos";
import type { ItemColhido, Modo, MotorCopiloto } from "@/hooks/motorCopiloto";
import estilo from "./coldcall.module.css";

// O motor não exporta a forma do que `fim()` devolve. Derivar daqui em vez de
// redigitar a forma: redigitada, ela envelheceria sozinha no dia em que a
// colheita ganhar um campo novo, e o erro apareceria só na tela de conferência.
type ResultadoFim = NonNullable<ReturnType<MotorCopiloto["fim"]>>;

// ==================================================================
// /coldcall — o modo foco.
//
// Três faixas: quem está falando (com a curva de voz), o palco, e o
// rastro da call. A transcrição NÃO aparece: em foco se lê o palco.
//
// No palco convivem duas coisas diferentes, e a diferença é o desenho
// todo: o CARD é para falar (frase inteira, serifada, grande), a DICA é
// ordem curta para fazer — o vendedor lê, raciocina e fala com as
// palavras dele. Por isso a dica fica embaixo e menor: ela não pode
// disputar o lugar da frase que vai sair da boca dele.
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

  // A lista de fluxos NÃO é buscada aqui, e a escolha não é duplicada: a
  // verdade é estado.fluxoId, do motor. Quem tem a lista é o ModalConfig,
  // que é onde se escolhe, e é ele que manda o objeto do fluxo junto com o
  // Ligar (ver `ligar`). Dois donos para a seleção divergiriam, e o sintoma
  // seria o pior possível — fluxo certo na tela, outro na decisão.

  const noAr = estado.situacao === "ouvindo";

  // O resultado de fim() tem que sobreviver ao desligamento: depois de
  // motor.desligar() a situação volta para "parado" e a tela voltaria ao
  // modal de configuração. É este estado que segura a conferência na
  // frente do vendedor até ele resolver o que fazer com ela.
  const [resultado, setResultado] = useState<ResultadoFim | null>(null);

  const palco = useRef<HTMLDivElement>(null);

  const ligar = async (op: {
    idV: string;
    idC: string;
    modo: Modo;
    fluxo: FluxoListado | null;
  }) => {
    // definirFluxo DE NOVO, a cada ligação, mesmo com o fluxo já escolhido:
    // é ele que zera etapa, colheita e o que já foi feito, e motor.ligar()
    // não mexe nisso. O seletor só chama na troca de seleção, então a segunda
    // ligação do dia no mesmo fluxo abriria na etapa em que a primeira
    // terminou — com a colheita do lead anterior esperando confirmação.
    if (op.fluxo) motor.definirFluxo(op.fluxo);
    await motor.ligar(op);
    // O foco volta para a tela: o botão "Ligar" desaparece e o espaço
    // tem que chegar ao documento, não a um controle esquecido.
    palco.current?.focus();
  };

  const desligar = () => {
    // fim() ANTES de desligar(): desligar() é quem para o microfone e baixa
    // a call, e ler a colheita depois dele é correr atrás de um estado que
    // já pode não estar mais lá. A ordem destas duas linhas é o recurso.
    setResultado(motor.fim());
    motor.desligar();
  };

  const confirmar = (itens: ItemColhido[]) => {
    // Gravar na ficha do lead é outra rodada. Até ela existir o console é o
    // destino honesto: melhor um registro que o vendedor consegue achar que
    // uma chamada de API inventada que engole a colheita em silêncio.
    console.log("[coldcall] colhido confirmado", itens);
    setResultado(null);
  };

  // Sem card e sem dica o palco está mesmo vazio — e só aí cabe explicar o
  // que vai aparecer nele.
  const palcoVazio = !estado.card && estado.dicas.length === 0;

  return (
    <main className={estilo.tela}>
      {!noAr && !resultado && (
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
          // definirFluxo já no clique, não só no Ligar: é ele que faz o
          // motor publicar fluxoId, e é fluxoId que acende o botão escolhido
          // no seletor. Esperar o Ligar deixaria o clique sem resposta.
          aoEscolherFluxo={(f) => motor.definirFluxo(f)}
        />
      )}

      {/* Sem `key`, e o componente pede uma para remontar entre ligações:
          aqui ele já remonta sozinho porque `resultado` passa por null antes
          de haver outro. Fechar a conferência é a ÚNICA porta de volta para o
          modal (veja o `!resultado` acima), e sem o modal não se liga de novo.
          Quem tirar essa guarda tem que trazer a key junto, ou a segunda
          ligação abre com os campos digitados na primeira. */}
      {resultado && (
        <FimDaLigacao
          resultado={resultado}
          aoConfirmar={confirmar}
          aoDescartar={() => setResultado(null)}
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
            aoDesligar={desligar}
          />

          <div className={estilo.palco} ref={palco} tabIndex={-1}>
            {/* Card e dicas num bloco só, para o palco centralizar os dois
                JUNTOS. Soltos no grid do palco cada um ganharia uma linha
                própria e abriria um vão no meio da tela. */}
            <div className={estilo.pilha}>
              {estado.card && (
                // A `key` fica AQUI, não dentro do componente: é ela que remonta
                // o card a cada decisão e faz a animação de acender renascer.
                // Chave dentro do próprio componente não remonta coisa nenhuma.
                <CardObjecao key={estado.card.chave} card={estado.card} />
              )}

              {palcoVazio && (
                <div className={estilo.espera}>
                  <span className="rotulo">ouvindo</span>
                  {/* A etapa aparece AQUI também, não só no PainelDicas. O
                      painel some junto com a última dica, e está certo nisso
                      — caixa vazia não paga a visita do olho. Mas então, sem
                      dica nenhuma, o texto abaixo prometia "a dica, quando
                      faltar algo da etapa" sem nunca dizer em que etapa o
                      vendedor está. Aqui o olho já está: a linha é de graça. */}
                  {estado.etapa && (
                    <p className={estilo.etapaVazio}>
                      {estado.etapa}
                      {estado.etapaPos && (
                        <span className="telemetria"> · {estado.etapaPos}</span>
                      )}
                    </p>
                  )}
                  {/* Promete a dica só quando existe fluxo para gerá-la. Sem
                      fluxo escolhido nenhuma lacuna é calculada, e um aviso de
                      algo que nunca vai chegar ensina o vendedor a desconfiar
                      do resto da tela — inclusive do card. */}
                  <p>
                    {estado.fluxoId
                      ? "O card aparece aqui quando o cliente objetar; a dica, quando faltar algo da etapa."
                      : "O card aparece aqui quando o cliente objetar."}
                  </p>
                  {estado.modo === "tecla" && (
                    <p className={estilo.dica}>
                      Segure <kbd>espaço</kbd> enquanto você fala. Solto, o que entrar é do cliente.
                    </p>
                  )}
                </div>
              )}

              {/* Sem condição de propósito: o painel já se cala quando não há
                  dica. Repetir a regra aqui daria dois donos para ela, e no
                  dia em que uma das duas cópias mudar o palco some ou aparece
                  vazio — sem ninguém saber de qual lado veio. */}
              <PainelDicas dicas={estado.dicas} etapa={estado.etapa} etapaPos={estado.etapaPos} />
            </div>
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
