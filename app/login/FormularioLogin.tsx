"use client";

import Link from "next/link";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarCliente, temCredenciais } from "@/lib/supabase/cliente";
import estilo from "./login.module.css";

type ErroCru = { code?: string; message?: string; status?: number } | null | undefined;

/**
 * O Supabase responde em inglês e com código de máquina. Quem está às 8h com
 * o café na mão precisa ler uma frase, não `invalid_credentials`. O texto cru
 * fica só como `detalhe`, e só quando a gente não reconheceu o erro — aí ele
 * vira pista de depuração em vez de enigma.
 */
function traduzir(erro: ErroCru): { texto: string; detalhe?: string } {
  const codigo = erro?.code ?? "";
  const cru = erro?.message ?? "";

  // O Supabase devolve `invalid_credentials` tanto para senha errada quanto
  // para e-mail inexistente, de propósito: não conta a estranhos quem tem
  // conta. A nossa mensagem mantém essa discrição.
  if (codigo === "invalid_credentials" || /invalid login credentials/i.test(cru))
    return { texto: "E-mail ou senha incorretos." };

  if (codigo === "email_not_confirmed" || /email not confirmed/i.test(cru))
    return {
      texto:
        "Este e-mail ainda não foi confirmado. Abra o link que o Supabase enviou, ou peça para quem administra confirmar o usuário no painel.",
    };

  if (codigo === "user_banned")
    return { texto: "Este acesso está suspenso. Fale com quem administra." };

  if (
    codigo === "over_request_rate_limit" ||
    codigo === "over_email_send_rate_limit" ||
    erro?.status === 429
  )
    return { texto: "Muitas tentativas seguidas. Espere um minuto e tente de novo." };

  if (codigo === "validation_failed") return { texto: "Preencha e-mail e senha." };

  // Erro de rede não vem com código: chega como TypeError do fetch.
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(cru))
    return {
      texto: "Não deu para falar com o Supabase. Confira a conexão e a URL do projeto.",
    };

  return {
    texto: "Não foi possível entrar agora. Tente de novo.",
    detalhe: codigo || cru || undefined,
  };
}

export default function FormularioLogin({
  destino,
  temChaves,
}: {
  /** Para onde voltar depois de entrar — o `?de=` que o proxy carimbou. */
  destino: string | null;
  /** Calculado no servidor: existem NEXT_PUBLIC_SUPABASE_* no ambiente? */
  temChaves: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [vendoSenha, setVendoSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);

  // Rede de segurança do botão: ver o comentário no enviar().
  const relogio = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (relogio.current) window.clearTimeout(relogio.current);
    };
  }, []);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setDetalhe(null);

    // Sem chaves, `criarCliente()` montaria um cliente com URL `undefined` e o
    // erro que apareceria seria de rede — mentiroso. Paramos antes.
    if (!temChaves || !temCredenciais()) {
      setErro("Sem as credenciais do Supabase não existe login. Veja o aviso acima.");
      return;
    }

    const emailLimpo = email.trim();
    if (!emailLimpo || !senha) {
      setErro("Preencha e-mail e senha.");
      return;
    }

    setEnviando(true);
    try {
      const supabase = criarCliente();
      const { error } = await supabase.auth.signInWithPassword({
        email: emailLimpo,
        password: senha,
      });

      if (error) {
        const { texto, detalhe: pista } = traduzir(error);
        setErro(texto);
        setDetalhe(pista ?? null);
        setEnviando(false); // todo caminho de erro devolve o botão
        return;
      }

      // Deu certo. O cliente do navegador já gravou os cookies de sessão, e é
      // justamente esses cookies que o proxy e os Server Components vão ler na
      // próxima requisição.
      setSenha("");
      router.replace(destino ?? "/leads");
      // O HTML que está na tela foi renderizado sem sessão; sem o refresh o
      // cache do roteador poderia devolvê-lo de volta já logado.
      router.refresh();

      // Se a navegação não acontecer (rota com erro, por exemplo), o botão
      // volta ao normal em vez de girar para sempre.
      relogio.current = window.setTimeout(() => {
        setEnviando(false);
        setErro("Você entrou, mas a tela não trocou. Recarregue a página.");
      }, 8000);
    } catch (falha) {
      const { texto, detalhe: pista } = traduzir({
        message: falha instanceof Error ? falha.message : String(falha),
      });
      setErro(texto);
      setDetalhe(pista ?? null);
      setEnviando(false);
    }
  }

  return (
    <div className={estilo.bloco}>
      <span className="rotulo">identificação</span>

      {!temChaves && (
        <div className={estilo.aviso} role="status">
          <strong>Este CRM ainda não tem Supabase.</strong>
          <p>
            Faltam <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Elas precisam estar em{" "}
            <code>Vistra/crm/.env.local</code> (o modelo é o <code>.env.example</code>). As
            variáveis <code>NEXT_PUBLIC_*</code> são embutidas no build.
            Depois de criar o arquivo, reinicie o <code>next dev</code>.
          </p>
        </div>
      )}

      {destino && temChaves && (
        <div className={estilo.nota} role="status">
          Sua sessão não estava válida em <code>{destino}</code>. Entre e você volta para lá.
        </div>
      )}

      <form className={estilo.forma} onSubmit={enviar} noValidate>
        <div className={estilo.linha}>
          <label className="rotulo" htmlFor="email">
            e-mail
          </label>
          <input
            id="email"
            className="campo"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="email"
            placeholder="voce@empresa.com.br"
            disabled={enviando}
            autoFocus
          />
        </div>

        <div className={estilo.linha}>
          <label className="rotulo" htmlFor="senha">
            senha
          </label>
          <div className={estilo.senha}>
            <input
              id="senha"
              className="campo"
              type={vendoSenha ? "text" : "password"}
              name="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={enviando}
            />
            <button
              type="button"
              className={estilo.olho}
              onClick={() => setVendoSenha((v) => !v)}
              disabled={enviando}
              aria-pressed={vendoSenha}
            >
              {vendoSenha ? "ocultar" : "mostrar"}
            </button>
          </div>
        </div>

        {erro && (
          <div className={estilo.erro} role="alert">
            <span>{erro}</span>
            {detalhe && <code className={estilo.pista}>{detalhe}</code>}
          </div>
        )}

        <button
          type="submit"
          className={`btn btn-forte ${estilo.entrar}`}
          disabled={enviando || !temChaves}
        >
          {enviando ? "entrando…" : "Entrar"}
        </button>
      </form>

      <p className={estilo.rodape}>
        Não tem conta? <Link href="/cadastro">Criar conta</Link>. O perfil nasce sozinho no
        banco assim que o usuário é criado.
      </p>
    </div>
  );
}
