import { useState, useCallback, useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { cn } from "@/lib/utils";
import { PressableButton } from "@/components/ui/pressable-button";
import BrandMark from "@/components/BrandMark";

const slides = [
  {
    scene: "map",
    title: "Your memories have a place",
    description:
      "Pin the moments you never want to lose and watch the map of your life take shape.",
  },
  {
    scene: "photo",
    title: "Keep the feeling close",
    description:
      "Bring together the photo, place, and date that make a memory feel vivid again.",
  },
  {
    scene: "music",
    title: "Give every memory a soundtrack",
    description:
      "Attach the song that takes you back—not as a playlist, but as an emotional cue.",
  },
];

const LandingIllustration = ({ scene }: { scene: string }) => (
  <svg className="landing-vector" viewBox="0 0 620 590" role="img" aria-label="A Momentunes memory illustration">
    <rect width="620" height="590" rx="48" fill="#fff0f6" />
    <path d="M-20 145c89-78 175 4 255-46s160-62 232-7 111 34 178-6" fill="none" stroke="#ffd0e2" strokeWidth="18" strokeLinecap="round" />
    <path d="M58-20c-15 116 71 151 32 251s15 180 105 226 169 42 225 148" fill="none" stroke="#f9a6c6" strokeWidth="7" strokeLinecap="round" />
    <path d="M334-20c27 107-35 161 19 242s31 159-37 245" fill="none" stroke="#f9a6c6" strokeWidth="7" strokeLinecap="round" />
    <path d="M-20 458c95-87 167-20 247-82s146-102 234-48 127 8 180-48" fill="none" stroke="#fff" strokeWidth="25" strokeLinecap="round" />
    {scene === "map" && <>
      <g transform="translate(210 105)"><path d="M100 0C45 0 0 44 0 99c0 78 100 181 100 181s100-103 100-181C200 44 155 0 100 0Z" fill="#f31e78" /><text x="100" y="127" fill="white" fontFamily="Georgia,serif" fontSize="104" fontWeight="700" textAnchor="middle">“</text></g>
      <g transform="translate(74 385)"><rect width="196" height="132" rx="25" fill="white" /><circle cx="48" cy="48" r="25" fill="#171717" /><path d="M30 91h134M30 110h90" stroke="#f31e78" strokeWidth="8" strokeLinecap="round" /></g>
      <circle cx="492" cy="425" r="70" fill="#171717" /><path d="m461 425 21 21 43-53" fill="none" stroke="white" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
    </>}
    {scene === "photo" && <>
      <g transform="translate(95 72)"><rect width="430" height="390" rx="36" fill="white" /><rect x="28" y="28" width="374" height="260" rx="25" fill="#f8a7c6" /><circle cx="131" cy="115" r="43" fill="#f31e78" /><path d="m44 272 116-119 68 70 63-86 94 135" fill="#fff" /><text x="38" y="360" fill="#f31e78" fontFamily="Georgia,serif" fontSize="87" fontWeight="700">“</text><path d="M105 328h250M105 355h176" stroke="#171717" strokeWidth="10" strokeLinecap="round" /></g>
      <circle cx="506" cy="472" r="61" fill="#f31e78" /><path d="M482 470h48M506 446v48" stroke="white" strokeWidth="11" strokeLinecap="round" />
    </>}
    {scene === "music" && <>
      <g transform="translate(105 66)"><rect width="410" height="438" rx="38" fill="white" /><rect x="31" y="31" width="348" height="274" rx="26" fill="#171717" /><circle cx="205" cy="168" r="98" fill="#f31e78" /><circle cx="205" cy="168" r="31" fill="white" /><path d="M46 350h318" stroke="#171717" strokeWidth="7" strokeLinecap="round" /><circle cx="157" cy="350" r="16" fill="#f31e78" /><path d="M51 397h135M51 420h86" stroke="#171717" strokeWidth="10" strokeLinecap="round" /><circle cx="333" cy="404" r="33" fill="#f31e78" /><path d="m326 388 22 16-22 16Z" fill="white" /></g>
    </>}
  </svg>
);

interface LandingProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

const Landing = ({ onGetStarted, onSignIn }: LandingProps) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedSlide = slides[selectedIndex] ?? slides[0];

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <main className="momentunes-landing">
      <header className="landing-brand"><BrandMark /></header>
      <div className="absolute inset-0 overflow-hidden" ref={emblaRef}>
        <div className="flex h-full">
          {slides.map((slide, i) => (
            <div key={i} className="landing-slide">
              <LandingIllustration scene={slide.scene} />
            </div>
          ))}
        </div>
      </div>

      <div className="landing-content">
        <div className="landing-copy">
          <p className="landing-eyebrow">Memories, mapped to music</p>
          <h1>
            {selectedSlide.title}
          </h1>
          <span>
            {selectedSlide.description}
          </span>

          <div className="landing-dots">
          {slides.map((_, i) => (
            <PressableButton
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                selectedIndex === i ? "active" : ""
              )}
            />
          ))}
          </div>

          <div className="landing-actions">
            <PressableButton
              onClick={onGetStarted}
              className="landing-primary-action"
            >
              Get Started
            </PressableButton>

            <p className="landing-signin">
              Already have an account?{" "}
              <PressableButton
                onClick={onSignIn}
                className="landing-signin-button"
              >
                Sign In
              </PressableButton>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Landing;
