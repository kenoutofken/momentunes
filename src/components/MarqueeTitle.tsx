import { useEffect, useRef, useState } from "react";

type MarqueeTitleProps = { text: string; className?: string };

// Keeps the title to one predictable line: it only scrolls when the text
// actually overflows its box, pausing at each end before reversing.
const MarqueeTitle = ({ text, className }: MarqueeTitleProps) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLHeadingElement | null>(null);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const textEl = textRef.current;
    if (!viewport || !textEl) return;

    const measure = () => {
      const overflow = textEl.scrollWidth - viewport.clientWidth;
      setDistance(overflow > 4 ? overflow + 8 : 0);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(textEl);
    return () => observer.disconnect();
  }, [text]);

  const duration = Math.min(22, Math.max(8, distance / 14));

  return (
    <div ref={viewportRef} className={`marquee-title-viewport ${className ?? ""}`}>
      <h1
        ref={textRef}
        className="marquee-title-text"
        style={distance > 0 ? { "--marquee-distance": `-${distance}px`, "--marquee-duration": `${duration}s` } as React.CSSProperties : undefined}
        data-scrolling={distance > 0}
      >
        {text}
      </h1>
    </div>
  );
};

export default MarqueeTitle;
