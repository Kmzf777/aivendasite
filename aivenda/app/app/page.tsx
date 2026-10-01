import { redirect } from "next/navigation";

// A raiz nao tem tela propria: o dia de trabalho comeca no poco de leads.
export default function Raiz() {
  redirect("/leads");
}
