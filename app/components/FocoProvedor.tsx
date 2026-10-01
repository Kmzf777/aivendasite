"use client";

import { createContext, useContext, useState } from "react";

// Quem liga o modo foco é a /coldcall; quem reage é o menu lateral.
const Ctx = createContext<{ foco: boolean; pedirFoco: (v: boolean) => void }>({
  foco: false,
  pedirFoco: () => {},
});

export const useFoco = () => useContext(Ctx);

export default function FocoProvedor({ children }: { children: React.ReactNode }) {
  const [foco, pedirFoco] = useState(false);
  return <Ctx.Provider value={{ foco, pedirFoco }}>{children}</Ctx.Provider>;
}
