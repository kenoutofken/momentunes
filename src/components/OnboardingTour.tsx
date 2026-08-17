import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type TourStep = { selector: string; title: string; description: string };

type OnboardingTourProps = { steps: TourStep[]; onFinish: () => void };

const SPOTLIGHT_PADDING = 10;
const TOOLTIP_WIDTH = 300;
const TOOLTIP_GAP = 16;
const VIEWPORT_MARGIN = 16;

// Picks the first matching element that's actually rendered on screen right
// now, since mobile and desktop each render their own copy of these controls
// and hide the other one with CSS rather than unmounting it.
const findVisibleTarget = (selector: string): HTMLElement | null => {
  const candidates = document.querySelectorAll<HTMLElement>(selector);
  for (const candidate of candidates) {
    if (candidate.offsetParent !== null) return candidate;
  }
  return null;
};

const OnboardingTour = ({ steps, onFinish }: OnboardingTourProps) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[stepIndex];

  useEffect(() => {
    const measure = () => {
      const target = step ? findVisibleTarget(step.selector) : null;
      setRect(target ? target.getBoundingClientRect() : null);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { window.cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, [step]);

  if (!step) return null;

  const spotlightRect = rect ? {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  } : null;

  const placeBelow = spotlightRect ? spotlightRect.top + spotlightRect.height + TOOLTIP_GAP + 160 < window.innerHeight : true;
  const tooltipLeft = spotlightRect
    ? Math.min(Math.max(spotlightRect.left, VIEWPORT_MARGIN), window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN)
    : window.innerWidth / 2 - TOOLTIP_WIDTH / 2;

  const isLastStep = stepIndex === steps.length - 1;

  return (
    <div className="onboarding-tour" role="dialog" aria-label={`Tour: ${step.title}`}>
      {spotlightRect && (
        <div
          className="onboarding-tour-spotlight"
          style={{ top: spotlightRect.top, left: spotlightRect.left, width: spotlightRect.width, height: spotlightRect.height }}
        />
      )}
      <div
        className="onboarding-tour-tooltip"
        style={spotlightRect ? {
          left: tooltipLeft,
          width: TOOLTIP_WIDTH,
          ...(placeBelow
            ? { top: spotlightRect.top + spotlightRect.height + TOOLTIP_GAP }
            : { bottom: window.innerHeight - spotlightRect.top + TOOLTIP_GAP }),
        } : { left: "50%", top: "50%", width: TOOLTIP_WIDTH, transform: "translate(-50%,-50%)" }}
      >
        <button type="button" className="onboarding-tour-close" onClick={onFinish} aria-label="Skip tour"><X size={16} /></button>
        <span className="onboarding-tour-step">{stepIndex + 1} of {steps.length}</span>
        <h2>{step.title}</h2>
        <p>{step.description}</p>
        <div className="onboarding-tour-actions">
          <button type="button" className="onboarding-tour-skip" onClick={onFinish}>Skip</button>
          <button
            type="button"
            className="onboarding-tour-next"
            onClick={() => (isLastStep ? onFinish() : setStepIndex((current) => current + 1))}
          >
            {isLastStep ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
