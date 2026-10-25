import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Louvre Lab | Réservation",
  description: "Démonstrateur de réservations développé à partir de la bibliothèque Louvre."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}