import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight } from 'lucide-react';
import { DissolutionScene, isWebGLAvailable } from '../three/DissolutionScene';
import { computeHeroOverlayState, getAdaptiveBudgets } from '../three/dissolutionMath';
import type { LocalizedCopy } from '../theme/themeConfig';

gsap.registerPlugin(ScrollTrigger);

interface HeroDissolutionProps {
  copy: LocalizedCopy['hero'];
  onOpenOperator: () => void;
  onOpenSupervisor: () => void;
}

export function HeroDissolution({
  copy,
  onOpenOperator,
  onOpenSupervisor,
}: HeroDissolutionProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const headlineRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<DissolutionScene | null>(null);
  const [webglFallback, setWebglFallback] = useState(false);
  const [scrollDistanceVh, setScrollDistanceVh] = useState<number>(() => {
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
    return getAdaptiveBudgets({
      isMobile,
      isSoftwareGl: false,
      reducedMotion: false,
    }).scrollDistanceVh;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const prefersReduced = mq.matches;

    let sceneInstance: DissolutionScene | null = null;
    if (canvasMountRef.current && isWebGLAvailable()) {
      try {
        sceneInstance = new DissolutionScene({
          container: canvasMountRef.current,
          reducedMotion: prefersReduced,
          initialTheme: 'obsidian',
          initialRtl: false,
          onContextLost: () => setWebglFallback(true),
          onContextRestored: () => setWebglFallback(false),
        });
        sceneRef.current = sceneInstance;
      } catch {
        setWebglFallback(true);
      }
    } else {
      setWebglFallback(true);
    }

    const applyProgress = (progress: number, immediate = false) => {
      sceneRef.current?.setProgress(progress, immediate);
      if (triggerRef.current) {
        triggerRef.current.dataset.scrollProgress = progress.toFixed(3);
      }
      if (headlineRef.current) {
        const overlay = computeHeroOverlayState(progress);
        headlineRef.current.style.opacity = String(overlay.headlineOpacity);
        headlineRef.current.style.transform = `translate3d(0, ${overlay.headlineTranslateY}px, 0)`;
        headlineRef.current.style.pointerEvents =
          overlay.headlineOpacity > 0.1 ? 'auto' : 'none';
      }
    };

    // Pinned full-sequence scroll dissolution while staying in the hero section
    const triggerEl = triggerRef.current;
    let st: ScrollTrigger | null = null;
    if (triggerEl) {
      st = ScrollTrigger.create({
        trigger: triggerEl,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          applyProgress(self.progress, false);
        },
      });
      applyProgress(st.progress, true);
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (prefersReduced || !sceneRef.current) return;
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -((e.clientY / window.innerHeight) * 2 - 1);
      sceneRef.current.setPointer(nx, ny);
    };

    const handleResize = () => {
      const nextBudgets = getAdaptiveBudgets({
        isMobile: window.innerWidth < 768,
        isSoftwareGl: false,
        reducedMotion: prefersReduced,
      });
      setScrollDistanceVh(nextBudgets.scrollDistanceVh);
      sceneRef.current?.resize();
      ScrollTrigger.refresh();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      st?.kill(true);
      sceneInstance?.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <section
      id="hero"
      ref={triggerRef}
      data-testid="hero-dissolution"
      data-scroll-progress="0.000"
      className="relative w-full bg-[#0A0C10]"
      style={{ height: `${100 + scrollDistanceVh}svh` }}
    >
      {/* Sticky Full-Viewport Hero Stage: stays pinned while rock transforms through scroll */}
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden bg-[#0A0C10]">
        {/* Dedicated WebGL Mount Container */}
        <div
          ref={canvasMountRef}
          data-testid="webgl-canvas-mount"
          aria-hidden="true"
          className="absolute inset-0 z-0 h-full w-full"
        />

        {webglFallback && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_72%_44%,rgba(37,99,235,0.22)_0%,rgba(15,41,74,0.45)_36%,rgba(10,12,16,1)_72%)]"
          />
        )}

        {/* Measured Contrast Scrim for Crisp Typography */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-full bg-gradient-to-r from-[#0A0C10]/94 via-[#0A0C10]/65 to-transparent md:w-[60%]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-[#0A0C10] via-[#0A0C10]/45 to-transparent"
        />

        {/* Editorial Hero Content */}
        <div className="relative z-20 mx-auto flex h-full max-w-[1440px] flex-col justify-center px-6 pt-16 pb-10 lg:px-12">
          <div className="grid grid-cols-1 items-center lg:grid-cols-12">
            <div
              ref={headlineRef}
              className="relative lg:col-span-7 xl:col-span-6 will-change-transform"
            >
              <p className="mb-5 font-mono text-[11px] font-medium tracking-[0.2em] uppercase text-[#60A5FA]">
                {copy.eyebrowLeft}
              </p>

              <h1 className="font-display text-[clamp(2.3rem,3.9vw,3.75rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-white [text-wrap:balance]">
                {copy.headlineLine1}
                <br />
                {copy.headlineLine2}
              </h1>

              <p className="mt-6 max-w-[48ch] text-[15px] leading-[1.7] text-[#CBD5E1] sm:text-base">
                {copy.subtitle}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={onOpenOperator}
                  className="group inline-flex min-h-[46px] items-center gap-2.5 rounded-sm bg-[#2563EB] px-6 py-3 text-xs font-semibold tracking-[0.06em] uppercase text-white whitespace-nowrap transition-colors duration-200 hover:bg-white hover:text-[#0A0C10] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60A5FA] cursor-pointer"
                >
                  <span>{copy.primaryCta}</span>
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  onClick={onOpenSupervisor}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-sm border border-white/25 bg-[#0A0C10]/60 px-6 py-3 text-xs font-semibold tracking-[0.06em] uppercase text-white whitespace-nowrap transition-colors duration-200 hover:border-[#60A5FA] hover:text-[#93C5FD] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60A5FA] cursor-pointer"
                >
                  {copy.secondaryCta}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
