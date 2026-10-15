import MenuLateral from "@/components/MenuLateral";
import SessaoMenu from "@/components/SessaoMenu";
import estilo from "./crm.module.css";

// Casco do CRM: menu fixo à esquerda, conteúdo à direita.
export default function LayoutCrm({ children }: { children: React.ReactNode }) {
  return (
    <div className={estilo.casco}>
      <MenuLateral />
      {/* Monta-se por portal dentro da #menu-sessao do MenuLateral, entao
          nao vira um no na grade do casco. */}
      <SessaoMenu />
      <main className={estilo.conteudo}>{children}</main>
    </div>
  );
}
