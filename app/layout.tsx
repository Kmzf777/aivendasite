import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Inter é a fonte da marca Vistra: títulos em 800, texto em 400/500.
// --fonte-serif aponta para a mesma Inter: o CRM não usa serifa.
const ui = Inter({ subsets: ["latin"], variable: "--fonte-ui", display: "swap" });
const titulo = Inter({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--fonte-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--fonte-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Vistra CRM",
  description: "CRM da Vistra: leads, contatos e funil.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${ui.variable} ${titulo.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
