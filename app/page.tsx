import { redirect } from "next/navigation";

// O dia comeca na lista universal: e ela que mostra quanta coisa ainda
// esta sem dono, que e o convite a contatar.
export default function Raiz() {
  redirect("/lista");
}
