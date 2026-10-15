"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import estilo from "./MenuLateral.module.css";

// A ordem é a do dia de trabalho: a lista da equipe, os seus leads e o
// funil, onde o que deu certo continua.
const PORTAS = [
  { href: "/lista", nome: "Lista de leads", desc: "a equipe toda", glifo: "▦" },
  { href: "/leads", nome: "Meus leads", desc: "na sua mão", glifo: "▪" },
  { href: "/funil", nome: "Funil", desc: "seus qualificados", glifo: "▤" },
];

export default function MenuLateral() {
  const caminho = usePathname();

  return (
    <nav className={estilo.menu}>
      <Link href="/lista" className={estilo.marca} aria-label="Vistra CRM">
        <svg className={estilo.simbolo} viewBox="0 0 200 200" aria-hidden>
          <circle cx="100" cy="100" r="100" fill="#39FF14" />
          <path d="M52 56 H82 L94 122 L128 56 H158 L104 150 H76 Z" fill="#000" />
        </svg>
        <span className={estilo.nomeMarca}>
          vistra<b>.ia</b>
          <small>CRM</small>
        </span>
      </Link>

      <ul className={estilo.portas}>
        {PORTAS.map((p) => {
          const aqui = caminho === p.href || caminho.startsWith(p.href + "/");
          return (
            <li key={p.href}>
              <Link href={p.href} className={`${estilo.porta} ${aqui ? estilo.aqui : ""}`}>
                <span className={estilo.glifo} aria-hidden>
                  {p.glifo}
                </span>
                <span className={estilo.texto}>
                  <strong>{p.nome}</strong>
                  <em>{p.desc}</em>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* O rodapé do menu é preenchido pelo SessaoMenu (quem está logado + sair). */}
      <div className={estilo.pe} id="menu-sessao" />
    </nav>
  );
}
