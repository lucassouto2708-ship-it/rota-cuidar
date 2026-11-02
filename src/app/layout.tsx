import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rota Cuidar",
  description: "Transporte de pacientes das secretarias de saúde",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#f6f8f7", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
