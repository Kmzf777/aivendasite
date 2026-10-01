import MenuLateral from "@/components/MenuLateral";
import SessaoMenu from "@/components/SessaoMenu";
import FocoProvedor from "@/components/FocoProvedor";
import estilo from "./crm.module.css";

// Casco do CRM: menu fixo à esquerda, conteúdo à direita.
//
// O FocoProvedor existe por uma razão só: a /coldcall, depois do "Ligar",
// vira tela de leitura em milissegundos com um cliente falando no ouvido.
// Uma barra lateral ali é ruído. Ela pede foco, o menu some, e volta
// quando desliga.
export default function LayoutCrm({ children }: { children: React.ReactNode }) {
  return (
    <FocoProvedor>
      <div className={estilo.casco}>
        <MenuLateral />
        {/* Monta-se por portal dentro da #menu-sessao do MenuLateral, entao
            nao vira um no na grade do casco. */}
        <SessaoMenu />
        <main className={estilo.conteudo}>{children}</main>
      </div>
    </FocoProvedor>
  );
}
