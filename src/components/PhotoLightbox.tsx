import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type PhotoLightboxProps = {
  images: string[];
  index: number;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
};

const PhotoLightbox = ({ images, index, title, open, onOpenChange, onIndexChange }: PhotoLightboxProps) => {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const move = (direction: -1 | 1) => onIndexChange((index + direction + images.length) % images.length);

  useEffect(() => {
    if (!open || images.length < 2) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") onIndexChange((index + 1) % images.length);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, images.length, index, onIndexChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="detail-image-lightbox">
        <DialogTitle className="sr-only">{title} photo {index + 1} of {images.length}</DialogTitle>
        <div
          className="detail-lightbox-stage"
          onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
          onTouchEnd={(event) => {
            if (touchStartX === null) return;
            const distance = event.changedTouches[0].clientX - touchStartX;
            if (Math.abs(distance) > 45 && images.length > 1) move(distance > 0 ? -1 : 1);
            setTouchStartX(null);
          }}
        >
          <img src={images[index] || images[0]} alt={`${title}, photo ${index + 1}`} />
          {images.length > 1 && <>
            <button className="detail-lightbox-arrow previous" onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft /></button>
            <button className="detail-lightbox-arrow next" onClick={() => move(1)} aria-label="Next photo"><ChevronRight /></button>
            <span className="detail-lightbox-count" aria-live="polite">{index + 1} of {images.length}</span>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoLightbox;
