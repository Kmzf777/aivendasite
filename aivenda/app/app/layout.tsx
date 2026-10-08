import type { Metadata } from "next";
import { Instrument_Serif, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// A headline do card e a frase que voce vai FALAR. Uma serifa da voz e peso
// a ela, e a 40px+ e mais rapida de bater o olho do que qualquer sans.
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--fonte-serif", display: "swap" });
// Archivo tem cara de etiqueta de equipamento. Combina com painel.
const ui = Archivo({ subsets: ["latin"], variable: "--fonte-ui", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--fonte-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Copiloto",
  description: "O Jev decide qual objeção é. O argumento é seu.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${serif.variable} ${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
