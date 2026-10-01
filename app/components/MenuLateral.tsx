"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFoco } from "./FocoProvedor";
import estilo from "./MenuLateral.module.css";

// As quatro portas. A ordem é a do dia de trabalho: você olha os leads,
// pega um, liga (cold call), e o funil é onde o que deu certo continua.
// Objeções fica por último porque é configuração, não operação.
const PORTAS = [
  { href: "/leads", nome: "Leads", desc: "o poço", glifo: "▦" },
  { href: "/coldcall", nome: "Cold call", desc: "modo foco", glifo: "◉" },
  { href: "/funil", nome: "Funil", desc: "seus qualificados", glifo: "▤" },
  { href: "/objecoes", nome: "Objeções", desc: "configuração", glifo: "⚙" },
];

export default function MenuLateral() {
  const caminho = usePathname();
  const { foco } = useFoco();

  // data-foco é lido pelo :has() do casco, que tira a coluna da grade.
  return (
    <nav className={estilo.menu} data-foco={foco ? "sim" : "nao"} aria-hidden={foco}>
      <Link href="/leads" className={estilo.marca}>
        Copiloto
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

      {/* O rodapé do menu é preenchido pelo agente da sessão (quem está
          logado + sair). Fica aqui para o lugar já existir. */}
      <div className={estilo.pe} id="menu-sessao" />
    </nav>
  );
}
