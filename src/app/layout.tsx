import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Auscult — Diagnostico espectral de maquinas rotativas",
  description:
    "Analise de vibracao no navegador: FFT, demodulacao por envelope (Hilbert), frequencias de defeito de rolamento e diagnostico explicavel com severidade ISO 20816.",
  keywords: ["vibracao", "FFT", "envelope", "rolamento", "BPFO", "ISO 20816", "manutencao preditiva"],
};

// Applies the saved theme before first paint so there is no flash of the wrong one.
// Light is the default when nothing is stored.
const themeScript = `try{var t=localStorage.getItem('auscult-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
