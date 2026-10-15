"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { criarCliente, temCredenciais } from "@/lib/supabase/cliente";
import estilo from "../login/login.module.css";

// Reusa o CSS do login de propósito: são a mesma porta, vista de dois
// ângulos. Duas folhas de estilo quase iguais divergiriam na primeira
// mudança de cor.

// O Supabase devolve erro em inglês e com código. Quem está criando conta
// não quer ler "User already registered" — quer saber o que fazer agora.
function traduzir(codigo: string | undefined, mensagem: string): string {
  const c = (codigo ?? "").toLowerCase();
  const m = (mensagem ?? "").toLowerCase();

  if (c === "user_already_exists" || m.includes("already registered"))
    return "Esse e-mail já tem conta. Entre em vez de cadastrar.";
  if (c === "weak_password" || m.includes("password should be"))
    return "Senha fraca demais. Use ao menos 6 caracteres.";
  if (c === "over_email_send_rate_limit" || m.includes("rate limit"))
    return "Muitas tentativas seguidas. Espere um minuto.";
  if (c === "validation_failed" || m.includes("invalid email"))
    return "Esse e-mail não parece válido.";
  if (c === "signup_disabled" || m.includes("signups not allowed"))
    return "O cadastro está desligado no painel: Authentication → Providers → Email.";
  return mensagem || "Não consegui criar a conta.";
}

export default function FormularioCadastro() {
  const router = useRouter();
  const temChaves = temCredenciais();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [vendoSenha, setVendoSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);

    if (!temChaves) {
      setErro("Sem as credenciais do Supabase não há onde criar conta. Veja o aviso acima.");
      return;
    }

    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim();

    if (!nomeLimpo) {
      setErro("Diga seu nome: é ele que a equipe vê nos leads que você pegar.");
      return;
    }
    if (!emailLimpo || !senha) {
      setErro("Preencha e-mail e senha.");
      return;
    }
    if (senha.length < 6) {
      setErro("A senha precisa de ao menos 6 caracteres.");
      return;
    }

    setEnviando(true);
    try {
      const supabase = criarCliente();
      const { data, error } = await supabase.auth.signUp({
        email: emailLimpo,
        password: senha,
        // O trigger `ao_criar_usuario` lê daqui para preencher perfis.nome.
        // Sem isto, todo vendedor viraria o pedaço do e-mail antes do @, e a
        // coluna "quem está com ele" na lista ficaria ilegível.
        options: { data: { nome: nomeLimpo } },
      });

      if (error) {
        setErro(traduzir(error.code, error.message));
        setEnviando(false); // o que foi digitado continua na tela
        return;
      }

      // Com confirmação de e-mail ligada no painel, o Supabase cria o usuário
      // mas NÃO devolve sessão: a conta existe e ainda não dá para entrar.
      if (!data.session) {
        setConfirmar(true);
        setEnviando(false);
        return;
      }

      // Sem confirmação, já entra direto. O refresh é o que faz os Server
      // Components relerem o cookie de sessão recém-gravado.
      setSenha("");
      router.replace("/lista");
      router.refresh();
    } catch (falha) {
      setErro(
        "Não consegui falar com o Supabase: " +
          (falha instanceof Error ? falha.message : String(falha))
      );
      setEnviando(false);
    }
  }

  if (confirmar) {
    return (
      <div className={estilo.bloco}>
        <span className="rotulo">quase lá</span>
        <div className={estilo.nota} role="status">
          <p>
            Conta criada para <code>{email.trim()}</code>. O Supabase está com confirmação de
            e-mail ligada, então falta clicar no link que ele mandou.
          </p>
          <p>
            Para desligar isso: <strong>Authentication → Providers → Email → Confirm email</strong>.
          </p>
        </div>
        <Link href="/login" className="btn btn-forte">
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <div className={estilo.bloco}>
      <span className="rotulo">nova conta</span>

      {!temChaves && (
        <div className={estilo.aviso} role="status">
          <strong>Este CRM ainda não tem Supabase.</strong>
          <p>
            Faltam <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no <code>.env.local</code> do CRM. Sem elas
            não há onde criar conta.
          </p>
        </div>
      )}

      <form className={estilo.forma} onSubmit={enviar} noValidate>
        <div className={estilo.linha}>
          <label className="rotulo" htmlFor="nome">
            nome
          </label>
          <input
            id="nome"
            className="campo"
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            placeholder="como a equipe vê você"
            disabled={enviando}
            autoFocus
          />
        </div>

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
              autoComplete="new-password"
              placeholder="ao menos 6 caracteres"
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
            {erro}
          </div>
        )}

        <button type="submit" className={`btn btn-forte ${estilo.entrar}`} disabled={enviando}>
          {enviando ? "Criando…" : "Criar conta"}
        </button>
      </form>

      <p className={estilo.rodape}>
        Já tem conta? <Link href="/login">Entrar</Link>. Seu nome aparece em cada lead que você
        pegar — é assim que a equipe sabe quem está em cima de quê.
      </p>
    </div>
  );
}
