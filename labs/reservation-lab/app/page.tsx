"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { BookingInput, Workshop, WorkshopId } from "../lib/contracts";
import { submitBookingAttempt } from "../lib/booking-request";

type WorkshopResponse = { workshops: Workshop[]; mode: string };

export default function HomePage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [selected, setSelected] = useState<WorkshopId>("typescript-clinic");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingAttempt, setPendingAttempt] = useState<BookingInput | null>(null);
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

  async function performAttempt(attempt: BookingInput) {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await submitBookingAttempt(attempt, payload =>
        fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      );
      if (outcome.kind === "uncertain") {
        // Preserve the EXACT payload and key even if the server already sold its last place.
        setPendingAttempt(attempt);
        setNotice({ kind: "error", message: outcome.message });
        return;
      }
      // A validated receipt or a definitive 4xx lets the user start a fresh request.
      setPendingAttempt(null);
      if (outcome.kind === "confirmed") {
        setNotice({
          kind: "success",
          message: `Réservation ${outcome.booking.reservationId} confirmée : ${outcome.booking.quantity} place(s).`
        });
      } else {
        setNotice({ kind: "error", message: outcome.error.message });
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onReserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || pendingAttempt || !active || active.remaining < quantity) return;
    const attempt: BookingInput = { workshopId: selected, quantity, requestId: crypto.randomUUID() };
    setPendingAttempt(attempt);
    await performAttempt(attempt);
  }

  async function onRetry() {
    if (busy || !pendingAttempt) return;
    await performAttempt(pendingAttempt);
  }

  function onAbandon() {
    if (busy || !pendingAttempt) return;
    if (!window.confirm("La réservation a peut-être été enregistrée. Abandonner son suivi pourrait entraîner un doublon si tu crées une nouvelle demande. Continuer ?")) return;
    setPendingAttempt(null);
    setNotice({ kind: "error", message: "Suivi abandonné. Cette action n'annule aucune réservation éventuellement enregistrée." });
    void refresh();
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
        <div className="section-heading">
          <div><p className="eyebrow">01 / LES ATELIERS</p><h2>Choisissez votre session</h2></div>
          <button type="button" className="refresh" onClick={() => void refresh()}>Actualiser les places ↻</button>
        </div>
        <div className="workshop-grid">
          {loading && <p>Chargement des disponibilités…</p>}
          {workshops.map((workshop, i) => {
            const isActive = selected === workshop.id;
            return <button key={workshop.id} type="button" className={`workshop ${isActive ? "selected" : ""}`} disabled={busy || !!pendingAttempt}
              onClick={() => { setSelected(workshop.id); setNotice(null); setQuantity(1); }} aria-pressed={isActive}>
              <div className="workshop-number">0{i + 1} <span>{workshop.duration}</span></div>
              <h3>{workshop.title}</h3><p>{workshop.subtitle}</p>
              <div className="workshop-bottom"><span className={workshop.remaining > 0 ? "places" : "soldout"}>{workshop.remaining} / {workshop.capacity} places disponibles</span><span className="arrow">↗</span></div>
            </button>;
          })}
        </div>
        <section className="checkout" aria-label="Finaliser la réservation">
          <div><p className="eyebrow">02 / VOTRE RÉSERVATION</p><h2>Une place pour créer.</h2><p className="muted">{active?.title ?? "Choisissez un atelier"} · Sans paiement ni données personnelles</p></div>
          <form className="form" onSubmit={onReserve}>
            <label htmlFor="quantity">Nombre de places</label>
            <select id="quantity" value={quantity} onChange={e => setQuantity(Number(e.target.value))}
              disabled={busy || !!pendingAttempt || !active || active.remaining < 1}>
              {[1, 2, 3, 4].filter(n => n <= (active?.remaining ?? 0)).map(n => <option key={n} value={n}>{n} place{n > 1 ? "s" : ""}</option>)}
            </select>
            <button className="submit" disabled={busy || !!pendingAttempt || !active || active.remaining < quantity || loading}>
              {busy ? "Réservation…" : active?.remaining === 0 ? "Complet" : "Réserver maintenant"}
            </button>
          </form>
        </section>
        {notice && <p className={`notice ${notice.kind}`} role="status" aria-live="polite">{notice.message}</p>}
        {pendingAttempt && !busy && <section className="retry-panel" aria-label="Suivi de la réservation incertaine">
          <p><strong>Demande en attente :</strong> {pendingAttempt.quantity} place(s) pour {workshops.find(w => w.id === pendingAttempt.workshopId)?.title ?? pendingAttempt.workshopId}.</p>
          <div className="retry-actions">
            <button type="button" className="submit" onClick={() => void onRetry()}>Réessayer la même demande</button>
            <button type="button" className="refresh" onClick={onAbandon}>Abandonner le suivi</button>
          </div>
          <p className="muted">Cette reprise utilise le même identifiant. Elle reste possible même si les places affichées sont épuisées. L'état en attente est perdu si vous rechargez cette page.</p>
        </section>}
      </section>
      <footer><span>LOUVRE ENGINEERING LAB</span><p>Démo locale : places en mémoire, remises à zéro au redémarrage. Pas de compte ni de réservation réelle.</p></footer>
    </main>
  );
}