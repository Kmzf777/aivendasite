"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarCliente, temCredenciais } from "@/lib/supabase/cliente";
import estilo from "./SessaoMenu.module.css";

// Rodapé do menu lateral: quem está logado e a porta de saída.
//
// Ele se monta por PORTAL dentro da <div id="menu-sessao" /> que o
// MenuLateral já reserva — assim o MenuLateral não precisa ser editado e
// continua sendo o dono do layout do menu. Em troca, este componente precisa
// ser renderizado em algum lugar dentro do casco do CRM: basta uma linha em
// app/(crm)/layout.tsx, ao lado do <MenuLateral />. Ele não gera nó próprio
// ali (portal não deixa placeholder), então a grade do casco não muda.
//
// É componente de cliente porque o portal precisa do DOM. O nome vem da
// tabela `perfis` com a anon key: quem autoriza a leitura é o RLS
// (`perfis_leitura`), não o sigilo da chave.

type Quem = { nome: string; email: string };

/** "rafael@x.com.br" → "rafael". Último recurso quando o perfil está vazio. */
function nomeDoEmail(email: string | null | undefined): string {
  if (!email) return "você";
  return email.split("@")[0] || "você";
}

export default function SessaoMenu() {
  const router = useRouter();

  // Sem credenciais nem criamos o cliente: `createBrowserClient` com URL
  // `undefined` quebraria aqui dentro e derrubaria o menu inteiro.
  const supabase = useMemo(() => (temCredenciais() ? criarCliente() : null), []);

  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const [quem, setQuem] = useState<Quem | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ---- achar o buraco reservado no menu ----
  // Na hidratação o <div id="menu-sessao" /> já existe no HTML. A tentativa
  // repetida (com teto) cobre o caso de o menu montar depois — e o teto
  // existe para não girar para sempre se este componente for usado fora do
  // casco do CRM.
  useEffect(() => {
    let vivo = true;
    let quadro = 0;
    let tentativas = 0;

    const procurar = () => {
      if (!vivo) return;
      const no = document.getElementById("menu-sessao");
      if (no) {
        setAlvo(no);
        return;
      }
      if (++tentativas > 30) return;
      quadro = requestAnimationFrame(procurar);
    };

    procurar();
    return () => {
      vivo = false;
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);

  // ---- quem está logado ----
  const vivoRef = useRef(true);
  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
    };
  }, []);

  const carregar = useCallback(async () => {
    if (!supabase) {
      setCarregando(false);
      return;
    }
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!vivoRef.current) return;
      if (error || !data.user) {
        setQuem(null);
        return;
      }

      const usuario = data.user;
      const reserva: Quem = {
        nome:
          (typeof usuario.user_metadata?.nome === "string" && usuario.user_metadata.nome.trim()) ||
          nomeDoEmail(usuario.email),
        email: usuario.email ?? "",
      };

      // O nome "de verdade" mora em `perfis`, criado pelo trigger do schema.
      const { data: linha } = await supabase
        .from("perfis")
        .select("nome, email")
        .eq("id", usuario.id)
        .maybeSingle();

      if (!vivoRef.current) return;
      setQuem({
        nome: linha?.nome?.trim() || reserva.nome,
        email: linha?.email?.trim() || reserva.email,
      });
    } catch {
      // Rede fora. Mostrar "Entrar" é mentira menor do que mostrar um nome
      // que a gente não conseguiu confirmar.
      if (vivoRef.current) setQuem(null);
    } finally {
      if (vivoRef.current) setCarregando(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      setCarregando(false);
      return;
    }
    carregar();

    // Se a sessão cair, expirar ou trocar em outra aba, o rodapé acompanha.
    const { data: assinatura } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") {
        setQuem(null);
        setCarregando(false);
        return;
      }
      if (evento === "SIGNED_IN" || evento === "USER_UPDATED" || evento === "TOKEN_REFRESHED") {
        // Fora do callback de propósito: chamar o supabase de dentro dele
        // pode travar o cliente esperando o próprio lock de sessão.
        setTimeout(() => void carregar(), 0);
      }
    });

    return () => assinatura.subscription.unsubscribe();
  }, [supabase, carregar]);

  // ---- sair ----
  async function sair() {
    if (!supabase || saindo) return;
    setSaindo(true);
    setErro(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        // O signOut normal revoga a sessão no servidor e precisa de rede. Se
        // ela falhou, ao menos apagamos a sessão DESTA máquina — é isso que a
        // pessoa quer quando clica em sair num notebook compartilhado.
        const { error: local } = await supabase.auth.signOut({ scope: "local" });
        if (local) {
          setErro("Não deu para sair. Tente de novo.");
          return;
        }
      }
      setQuem(null);
      router.replace("/login");
      router.refresh();
    } catch {
      setErro("Não deu para sair. Tente de novo.");
    } finally {
      // O botão volta ao normal em qualquer caminho, inclusive no de sucesso:
      // se a navegação demorar, ninguém fica olhando um botão travado.
      setSaindo(false);
    }
  }

  // ---- o que aparece no rodapé ----
  let conteudo: React.ReactNode;

  if (!supabase) {
    // Honestidade: o CRM está rodando sem banco. Não finge que há sessão.
    conteudo = (
      <p className={estilo.off} title="Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY">
        sem supabase
      </p>
    );
  } else if (carregando) {
    conteudo = <p className={estilo.off}>verificando…</p>;
  } else if (!quem) {
    conteudo = (
      <Link href="/login" className={estilo.entrar}>
        Entrar →
      </Link>
    );
  } else {
    conteudo = (
      <div className={estilo.sessao}>
        <span className={estilo.inicial} aria-hidden>
          {quem.nome.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className={estilo.quem}>
          <strong title={quem.nome}>{quem.nome}</strong>
          <em title={quem.email}>{quem.email}</em>
        </span>
        <button
          type="button"
          className={estilo.sair}
          onClick={sair}
          disabled={saindo}
          title={saindo ? "Saindo…" : "Sair"}
          aria-label="Sair"
        >
          <span aria-hidden>{saindo ? "·" : "⏻"}</span>
        </button>
      </div>
    );
  }

  // Antes de achar o alvo não renderiza nada — no servidor não existe DOM, e
  // um fallback renderizado fora do menu apareceria solto na grade do casco.
  if (!alvo) return null;

  return createPortal(
    <>
      {conteudo}
      {erro && (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      )}
    </>,
    alvo
  );
}
