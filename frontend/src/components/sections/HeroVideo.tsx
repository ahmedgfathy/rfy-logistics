import { useEffect, useRef, useState } from 'react';

/**
 * Background video for the home hero.
 * Footage: "A cargo ship loaded with containers at port" by Cyriac von Czapiewski,
 * Pexels (free license, no attribution required — credited here for the client).
 * Phones show the still frame instead, so the clip is never downloaded over mobile data.
 */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const sync = () => setShowVideo(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      if (reduced.matches) {
        video.pause();
        video.currentTime = 0;
      } else {
        void video.play().catch(() => undefined);
      }
    };
    apply();
    reduced.addEventListener('change', apply);
    return () => reduced.removeEventListener('change', apply);
  }, [showVideo]);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <img
        src="/images/hero-terminal.jpg"
        alt=""
        className="h-full w-full object-cover"
        width={1392}
        height={752}
      />

      {showVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          poster="/images/hero-terminal.jpg"
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

      {/* Light veil so the copy stays readable and the site keeps its white theme. */}
      <div className="absolute inset-0 bg-white/60 sm:bg-white/55" />
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white/80 to-white/40 sm:bg-gradient-to-r sm:from-white sm:via-white/75 sm:to-white/10 rtl:sm:bg-gradient-to-l" />
      <div className="absolute inset-0 bg-grid opacity-40" />
    </div>
  );
}
