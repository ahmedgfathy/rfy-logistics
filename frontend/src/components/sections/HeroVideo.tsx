import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

/** Full-bleed hero background: a slow image slider with a muted video layer on desktop.
 * Footage: "A cargo ship loaded with containers at port" by Cyriac von Czapiewski,
 * Pexels (free license, no attribution required — credited here for the client).
 */
const slides = [
  { image: '/images/hero-terminal.jpg', caption: 'Container terminal' },
  { image: '/images/hero-air.jpg', caption: 'Air cargo' },
  { image: '/images/hero-road.jpg', caption: 'Road freight' },
];

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const sync = () => setShowVideo(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo || active !== 0) return;
    if (reducedMotion) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    void video.play().catch(() => undefined);
  }, [active, reducedMotion, showVideo]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--navy-950)]" aria-hidden="true">
      {slides.map((slide, index) => (
        <div
          key={slide.image}
          className={cn(
            'absolute inset-0 transition-opacity duration-1000 ease-out',
            index === active ? 'opacity-100' : 'opacity-0',
          )}
        >
          <img
            src={slide.image}
            alt=""
            className="hero-media h-full w-full object-cover"
            width={1392}
            height={752}
          />
          {index === 0 && showVideo ? (
            <video
              ref={videoRef}
              className="hero-media absolute inset-0 h-full w-full object-cover"
              poster={slide.image}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              tabIndex={-1}
            >
              <source src="/videos/hero-bg.mp4" type="video/mp4" />
            </video>
          ) : null}
        </div>
      ))}

      {/* Cinematic veil keeps white copy readable on every slide. */}
      <div className="hero-shade absolute inset-0" />
      <div className="hero-fade absolute inset-0" />
      <div className="absolute inset-0 bg-grid opacity-20" />
    </div>
  );
}
