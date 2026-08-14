import { Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  markOnly?: boolean;
};

const BrandMark = ({ className, markOnly = false }: BrandMarkProps) => (
  <span
    className={cn(
      "inline-flex items-center gap-0 text-2xl font-black leading-none tracking-[0.04em] text-foreground [font-family:'Courier_New',Courier,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace]",
      className,
    )}
    aria-label="Momentunes"
  >
    {markOnly ? (
      <Music2 size={21} strokeWidth={3} className="shrink-0 -translate-y-px text-primary" aria-hidden="true" />
    ) : (
      <>
        <Music2 size={21} strokeWidth={3} className="mr-2 shrink-0 -translate-y-px text-primary" aria-hidden="true" />
        <span>Momentunes</span>
      </>
    )}
  </span>
);

export default BrandMark;
