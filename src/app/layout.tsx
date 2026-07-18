import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "auscult — diagnostico espectral de maquinas rotativas",
  description:
    "Analise de vibracao no navegador: FFT, demodulacao por envelope (Hilbert), frequencias de defeito de rolamento e diagnostico explicavel com severidade ISO 20816.",
  keywords: ["vibracao", "FFT", "envelope", "rolamento", "BPFO", "ISO 20816", "manutencao preditiva"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
