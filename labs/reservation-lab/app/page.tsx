"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Booking, Workshop, WorkshopId } from "../lib/contracts";

type WorkshopResponse = { workshops: Workshop[]; mode: string };

type BookingResponse = Booking | { code: string; message: string };

export default function HomePage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [selected, setSelected] = useState<WorkshopId>("typescript-clinic");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/workshops", { cache: "no-store" });
      if (!response.ok) throw new Error("Chargement impossible.");
      const data = (await response.json()) as WorkshopResponse;
      setWorkshops(data.workshops);
    } catch {
      setNotice({ kind: "error", message: "Impossible de charger les places. Réessayez." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const active = workshops.find(w => w.id === selected);

  async function onReserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !active || active.remaining < quantity) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshopId: selected, quantity, requestId: crypto.randomUUID() })
      });
      const payload = (await response.json()) as BookingResponse;
      if (!response.ok) {
        const err = payload as { message?: string };
        setNotice({ kind: "error", message: err.message ?? "Réservation impossible." });
      } else {
        const booking = payload as Booking;
        setNotice({ kind: "success", message: `Réservation ${booking.reservationId} confirmée : ${booking.quantity} place(s).` });
      }
      await refresh();
    } catch {
      setNotice({ kind: "error", message: "Erreur réseau. Vérifiez la disponibilité avant de réessayer." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div className="wordmark"><span className="mark">L</span><span>LOUVRE <strong>LAB</strong></span></div>
        <span className="top-label">Prototype · Engineering Lab 01</span>
      </header>
      <section className="hero">
        <p className="eyebrow">EXPÉRIENCE D’INGÉNIERIE LOGICIELLE</p>
        <h1>Apprendre. Construire.<br/><em>Réserver.</em></h1>
        <p className="lead">Une mini-application qui assemble TypeScript, Next.js et tests CI. Choisissez votre atelier et observez les places évoluer.</p>
        <div className="hero-details"><span>3 ateliers pratiques</span><span aria-hidden="true">·</span><span>Accès de démonstration</span></div>
      </section>
      <section className="workspace" aria-label="Réserver un atelier">
        <div className="section-heading"><div><p className="eyebrow">01 / LES ATELIERS</p><h2>Choisissez votre session</h2></div><button type="button" className="refresh" onClick={() => void refresh()}>Actualiser les places ↻</button></div>
        <div className="workshop-grid">
          {loading && <p>Chargement des disponibilités…</p>}
          {workshops.map((workshop, i) => {
            const isActive = selected === workshop.id;
            return <button key={workshop.id} type="button" className={`workshop ${isActive ? "selected" : ""}`} onClick={() => { setSelected(workshop.id); setNotice(null); setQuantity(1); }} aria-pressed={isActive}>
              <div className="workshop-number">0{i + 1} <span>{workshop.duration}</span></div>
              <h3>{workshop.title}</h3><p>{workshop.subtitle}</p>
              <div className="workshop-bottom"><span className={workshop.remaining > 0 ? "places" : "soldout"}>{workshop.remaining} / {workshop.capacity} places disponibles</span><span className="arrow">↗</span></div>
            </button>;
          })}
        </div>
        <section className="checkout" aria-label="Finaliser la réservation">
          <div><p className="eyebrow">02 / VOTRE RÉSERVATION</p><h2>Une place pour créer.</h2><p className="muted">{active?.title ?? "Choisissez un atelier"} · Sans paiement ni données personnelles</p></div>
          <form className="form" onSubmit={onReserve}><label htmlFor="quantity">Nombre de places</label><select id="quantity" value={quantity} onChange={e => setQuantity(Number(e.target.value))} disabled={busy || !active || active.remaining < 1}>{[1,2,3,4].filter(n => n <= (active?.remaining ?? 0)).map(n => <option key={n} value={n}>{n} place{n>1?"s":""}</option>)}</select><button className="submit" disabled={busy || !active || active.remaining < quantity || loading}>{busy ? "Réservation…" : active?.remaining === 0 ? "Complet" : "Réserver maintenant"}</button></form>
        </section>
        {notice && <p className={`notice ${notice.kind}`} role="status" aria-live="polite">{notice.message}</p>}
      </section>
      <footer><span>LOUVRE ENGINEERING LAB</span><p>Démo locale : places en mémoire, remises à zéro au redémarrage. Pas de compte ni de réservation réelle.</p></footer>
    </main>
  );
}