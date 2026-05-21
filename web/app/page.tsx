"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const EVENTS_PREVIEW = [
  { id: 1, name: "Travis Scott – Utopia Tour", venue: "Foro Sol", date: "Jun 14", category: "Música", spots: 12, color: "#FF4D00" },
  { id: 2, name: "Chivas vs América – Clásico", venue: "Estadio Akron", date: "Jun 21", category: "Deporte", spots: 44, color: "#CC0000" },
  { id: 3, name: "Cirque du Soleil – Alegría", venue: "Arena CDMX", date: "Jul 3", category: "Teatro", spots: 87, color: "#7B2FBE" },
  { id: 4, name: "Bad Bunny – El Último Tour", venue: "Estadio GNP", date: "Jul 18", category: "Música", spots: 5, color: "#FF4D00" },
];

export default function Home() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(navRef.current, { y: -60, opacity: 0, duration: 0.8, ease: "power3.out" });

      const words = titleRef.current?.querySelectorAll(".word");
      if (words) {
        gsap.from(words, { y: 120, opacity: 0, rotateX: -60, duration: 1.1, stagger: 0.08, ease: "expo.out", delay: 0.3 });
      }

      gsap.from(subtitleRef.current, { y: 30, opacity: 0, duration: 0.9, delay: 0.9, ease: "power3.out" });
      gsap.from(ctaRef.current?.children ?? [], { y: 30, opacity: 0, duration: 0.7, stagger: 0.1, delay: 1.1, ease: "power3.out" });

      const ticker = tickerRef.current;
      if (ticker) {
        const clone = ticker.innerHTML;
        ticker.innerHTML += clone;
        gsap.to(ticker, { xPercent: -50, duration: 22, ease: "none", repeat: -1 });
      }

      gsap.from(".event-card", {
        scrollTrigger: { trigger: cardsRef.current, start: "top 80%" },
        y: 80, opacity: 0, duration: 0.8, stagger: 0.12, ease: "power3.out",
      });

      gsap.from(".stat-item", {
        scrollTrigger: { trigger: statsRef.current, start: "top 85%" },
        scale: 0.85, opacity: 0, duration: 0.7, stagger: 0.1, ease: "back.out(1.5)",
      });

      gsap.to(".hero-badge", { y: -40, scrollTrigger: { trigger: heroRef.current, scrub: 1.5 } });
      gsap.to(".hero-circle", { y: 60, scrollTrigger: { trigger: heroRef.current, scrub: 2 } });
    });

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const handleResize = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const heroTitle = ["Tus", "boletos,", "sin", "complicaciones."];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans overflow-x-hidden">

      {/* ─── Navbar ─── */}
      <nav
        ref={navRef}
        className="fixed top-0 left-0 right-0 z-50"
        style={{ backdropFilter: "blur(18px)", background: "rgba(10,10,10,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between px-5 md:px-8 py-4 md:py-5">
          <span className="text-xl font-bold tracking-tight">
            <span style={{ color: "#FF4D00" }}>ticket</span>flow
          </span>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
            <button onClick={() => router.push("/events")} className="hover:text-white transition-colors">Eventos</button>
            <button onClick={() => router.push("/dashboard")} className="hover:text-white transition-colors">Dashboard</button>
            <button onClick={() => router.push("/tickets/me")} className="hover:text-white transition-colors">Mis boletos</button>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => router.push("/login")}
              className="text-sm px-4 py-2 rounded-full border border-zinc-700 text-zinc-300 hover:border-zinc-400 hover:text-white transition-all"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => router.push("/register")}
              className="text-sm px-4 py-2 rounded-full text-black font-semibold transition-all hover:scale-105"
              style={{ background: "#FF4D00" }}
            >
              Registrarse
            </button>
          </div>

          {/* Mobile: login shortcut + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => router.push("/login")}
              className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-300"
            >
              Entrar
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900"
              aria-label="Menú"
            >
              <span
                className="block h-0.5 w-5 bg-white transition-all duration-300"
                style={{ transform: menuOpen ? "translateY(8px) rotate(45deg)" : "none" }}
              />
              <span
                className="block h-0.5 w-5 bg-white transition-all duration-300"
                style={{ opacity: menuOpen ? 0 : 1 }}
              />
              <span
                className="block h-0.5 w-5 bg-white transition-all duration-300"
                style={{ transform: menuOpen ? "translateY(-8px) rotate(-45deg)" : "none" }}
              />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <div
          className="md:hidden overflow-hidden transition-all duration-300"
          style={{
            maxHeight: menuOpen ? "280px" : "0",
            borderTop: menuOpen ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}
        >
          <div className="px-5 py-4 flex flex-col gap-1">
            {[
              { label: "Eventos", path: "/events" },
              { label: "Dashboard", path: "/dashboard" },
              { label: "Mis boletos", path: "/tickets/me" },
              { label: "Registrarse", path: "/register", accent: true },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => { router.push(item.path); setMenuOpen(false); }}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                style={{
                  color: item.accent ? "#FF4D00" : "#a1a1aa",
                  background: item.accent ? "rgba(255,77,0,0.08)" : "transparent",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex flex-col items-center justify-center px-5 md:px-6 pt-24 md:pt-28 pb-16 text-center overflow-hidden"
      >
        {/* Background effects */}
        <div
          className="hero-circle absolute top-[-120px] right-[-120px] md:top-[-180px] md:right-[-180px] w-[300px] h-[300px] md:w-[600px] md:h-[600px] rounded-full opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle, #FF4D00 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-[-100px] left-[-80px] md:bottom-[-200px] md:left-[-150px] w-[260px] h-[260px] md:w-[500px] md:h-[500px] rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, #7B2FBE 0%, transparent 70%)" }}
        />

        {/* Badge */}
        <div
          className="hero-badge inline-flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs font-medium mb-8 md:mb-10 border"
          style={{ background: "rgba(255,77,0,0.1)", borderColor: "rgba(255,77,0,0.3)", color: "#FF8A65" }}
        >
          <span className="w-2 h-2 rounded-full bg-[#FF4D00] animate-pulse flex-shrink-0" />
          <span className="hidden sm:inline">Disponible ahora — miles de eventos en México</span>
          <span className="sm:hidden">Miles de eventos en México</span>
        </div>

        {/* Title */}
        <h1
          ref={titleRef}
          className="max-w-[320px] sm:max-w-xl md:max-w-4xl text-[2.6rem] sm:text-6xl md:text-8xl font-black tracking-tighter leading-[1.05] mb-6 md:mb-8"
          style={{ perspective: "800px", fontFamily: "'DM Serif Display', Georgia, serif" }}
        >
          {heroTitle.map((word, i) => (
            <span key={i} className="word inline-block mr-2 md:mr-4" style={{ display: "inline-block" }}>
              {word}
            </span>
          ))}
        </h1>

        <p
          ref={subtitleRef}
          className="max-w-[300px] sm:max-w-sm md:max-w-lg text-sm sm:text-base md:text-xl text-zinc-400 leading-relaxed mb-9 md:mb-12"
        >
          Conciertos, deportes, teatro y más. Compra, transfiere y valida tus boletos en segundos.
        </p>

        {/* CTAs */}
        <div ref={ctaRef} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4 w-full max-w-[300px] sm:max-w-none sm:w-auto">
          <button
            onClick={() => router.push("/events")}
            className="group relative px-7 md:px-8 py-3.5 md:py-4 rounded-full font-bold text-sm md:text-base text-white overflow-hidden transition-all hover:scale-105 active:scale-95 text-center"
            style={{ background: "#FF4D00" }}
          >
            <span className="relative z-10">Explorar eventos →</span>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "#FF6B35" }} />
          </button>
          <button
            onClick={() => router.push("/tickets/me")}
            className="px-7 md:px-8 py-3.5 md:py-4 rounded-full font-medium text-sm md:text-base border border-zinc-700 text-zinc-300 hover:border-zinc-400 hover:text-white transition-all hover:bg-zinc-900 text-center"
          >
            Ver mis boletos
          </button>
        </div>

        {/* Floating stat badges — desktop only */}
        <div className="hidden md:flex absolute left-12 bottom-32 flex-col gap-2 text-left">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-2xl font-bold">+200k</p>
            <p className="text-xs text-zinc-500">boletos vendidos</p>
          </div>
        </div>
        <div className="hidden md:flex absolute right-12 bottom-40 flex-col gap-2 text-left">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-2xl font-bold">4.9 ★</p>
            <p className="text-xs text-zinc-500">calificación promedio</p>
          </div>
        </div>

        {/* Mobile mini stats */}
        <div className="flex md:hidden items-center gap-5 mt-10">
          <div className="text-center">
            <p className="text-lg font-bold">+200k</p>
            <p className="text-xs text-zinc-500">boletos vendidos</p>
          </div>
          <div className="w-px h-7 bg-zinc-800" />
          <div className="text-center">
            <p className="text-lg font-bold">4.9 ★</p>
            <p className="text-xs text-zinc-500">calificación</p>
          </div>
          <div className="w-px h-7 bg-zinc-800" />
          <div className="text-center">
            <p className="text-lg font-bold">500+</p>
            <p className="text-xs text-zinc-500">eventos</p>
          </div>
        </div>
      </section>

      {/* ─── Ticker ─── */}
      <div
        className="py-4 border-y overflow-hidden"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,77,0,0.04)" }}
      >
        <div ref={tickerRef} className="flex gap-10 whitespace-nowrap" style={{ width: "max-content" }}>
          {["🎵 Música", "⚽ Deportes", "🎭 Teatro", "🎪 Festivales", "🏀 Básquetbol", "🎬 Cine", "🎤 Stand-up", "🎻 Clásica", "🥊 Lucha libre", "🎡 Familia"].map((item, i) => (
            <span key={i} className="text-xs md:text-sm font-medium text-zinc-400 tracking-widest uppercase">{item}</span>
          ))}
        </div>
      </div>

      {/* ─── Events Preview ─── */}
      <section className="px-5 md:px-16 py-14 md:py-24">
        <div className="flex items-end justify-between mb-8 md:mb-12">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2 md:mb-3">Destacados</p>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
              Eventos que no te<br />puedes perder
            </h2>
          </div>
          <button
            onClick={() => router.push("/discover")}
            className="hidden md:block text-sm text-zinc-400 hover:text-white border border-zinc-700 px-5 py-2 rounded-full transition-all hover:border-zinc-400"
          >
            Ver todos →
          </button>
        </div>

        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {EVENTS_PREVIEW.map((event) => (
            <div
              key={event.id}
              className="event-card group relative rounded-2xl md:rounded-3xl overflow-hidden cursor-pointer border border-zinc-800 hover:border-zinc-600 transition-all duration-300 hover:-translate-y-1"
              style={{ background: "#111111" }}
              onClick={() => router.push(`/events/${event.id}`)}
            >
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: event.color }} />
              <div className="p-5 md:p-7">
                <div className="flex items-start justify-between mb-4 md:mb-6">
                  <span
                    className="text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                    style={{ background: `${event.color}20`, color: event.color }}
                  >
                    {event.category}
                  </span>
                  <span className="text-sm text-zinc-500">{event.date}</span>
                </div>
                <h3 className="text-base md:text-xl font-bold mb-1.5 group-hover:text-[#FF4D00] transition-colors">{event.name}</h3>
                <p className="text-sm text-zinc-500 mb-4 md:mb-6">{event.venue}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-600">{event.spots} lugares disponibles</span>
                  <span
                    className="text-sm font-semibold flex items-center gap-1 md:opacity-0 md:translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                    style={{ color: "#FF4D00" }}
                  >
                    Comprar →
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Ver todos — mobile only */}
        <div className="mt-5 flex md:hidden">
          <button
            onClick={() => router.push("/discover")}
            className="w-full text-sm text-zinc-400 border border-zinc-800 px-5 py-3 rounded-xl transition-all hover:border-zinc-600 hover:text-white"
          >
            Ver todos los eventos →
          </button>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section
        ref={statsRef}
        className="mx-5 md:mx-16 mb-14 md:mb-24 rounded-2xl md:rounded-3xl p-7 md:p-12 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8"
        style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        {[
          { value: "500+", label: "Eventos activos" },
          { value: "200k+", label: "Usuarios registrados" },
          { value: "98%", label: "Pagos exitosos" },
          { value: "24/7", label: "Soporte disponible" },
        ].map((stat, i) => (
          <div key={i} className="stat-item text-center">
            <p className="text-3xl md:text-5xl font-black mb-1" style={{ color: i === 0 ? "#FF4D00" : "white" }}>{stat.value}</p>
            <p className="text-xs md:text-sm text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </section>

      {/* ─── Navigation Grid ─── */}
      <section className="px-5 md:px-16 pb-14 md:pb-24">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3 md:mb-4">Accesos rápidos</p>
        <h2 className="text-2xl md:text-4xl font-black tracking-tight mb-7 md:mb-10" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
          Todo lo que necesitas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {[
            { label: "Dashboard", desc: "Tu panel de control", path: "/dashboard", icon: "⚡" },
            { label: "Eventos", desc: "Explorar el catálogo", path: "/events", icon: "🎟️" },
            { label: "Mis boletos", desc: "Ver y gestionar", path: "/tickets/me", icon: "📲" },
            { label: "Checkout", desc: "Finalizar compra", path: "/checkout", icon: "💳" },
            { label: "Registrarse", desc: "Crear cuenta nueva", path: "/register", icon: "✨" },
            { label: "Iniciar sesión", desc: "Acceder a tu cuenta", path: "/login", icon: "🔑" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className="group text-left p-4 md:p-6 rounded-xl md:rounded-2xl border border-zinc-800 hover:border-zinc-600 transition-all duration-200 hover:bg-zinc-900 active:scale-95"
            >
              <span className="text-xl md:text-2xl mb-2 md:mb-3 block">{item.icon}</span>
              <p className="font-bold text-sm md:text-base mb-0.5 group-hover:text-[#FF4D00] transition-colors">{item.label}</p>
              <p className="text-xs text-zinc-500 leading-tight">{item.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ─── CTA Final ─── */}
      <section
        className="mx-5 md:mx-16 mb-14 md:mb-24 rounded-2xl md:rounded-3xl p-8 md:p-16 text-center relative overflow-hidden"
        style={{ background: "#FF4D00" }}
      >
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 70% 30%, #FF8A65 0%, transparent 60%)" }} />
        <h2 className="relative text-3xl md:text-6xl font-black tracking-tight mb-4 md:mb-6 text-white" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
          Listo para vivir<br />la experiencia?
        </h2>
        <p className="relative text-orange-100 mb-7 md:mb-10 text-sm md:text-lg">Regístrate gratis y empieza a comprar boletos hoy mismo.</p>
        <button
          onClick={() => router.push("/register")}
          className="relative inline-block px-8 md:px-10 py-3.5 md:py-4 bg-black text-white font-bold rounded-full text-sm md:text-base hover:bg-zinc-900 transition-all hover:scale-105 active:scale-95"
        >
          Crear cuenta gratuita →
        </button>
      </section>

      {/* ─── Footer ─── */}
      <footer className="px-6 pb-10 text-center border-t border-zinc-900 pt-8">
        <p className="text-xl font-bold mb-1">
          <span style={{ color: "#FF4D00" }}>ticket</span>flow
        </p>
        <p className="text-xs text-zinc-600">© 2025 · Todos los derechos reservados</p>
      </footer>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap');
      `}</style>
    </div>
  );
}
