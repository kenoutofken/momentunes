import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Memory } from "@/types/memory";

type MemoryPhotoGalleryProps = {
  memory: Memory;
  fallbackImage?: string;
};

const MemoryPhotoGallery = ({ memory, fallbackImage = "/landing/landing_02.png" }: MemoryPhotoGalleryProps) => {
  const images = memory.imageUrls?.length ? memory.imageUrls : [memory.imageUrl || fallbackImage];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + images.length) % images.length);
  };

  useEffect(() => {
    setOpen(false);
    setActiveIndex(0);
  }, [memory.id]);

  useEffect(() => {
    if (!open || images.length < 2) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setActiveIndex((current) => (current - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") setActiveIndex((current) => (current + 1) % images.length);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images.length, open]);

  return <>
    <div className={`desktop-photo-grid desktop-photo-grid-${Math.min(images.length, 4)}`} aria-label={`${images.length} memory ${images.length === 1 ? "photo" : "photos"}`}>
      {images.slice(0, 4).map((image, index) => <button key={`${image}-${index}`} type="button" onClick={() => { setActiveIndex(index); setOpen(true); }} aria-label={`View photo ${index + 1} of ${images.length} full size`}>
        <img src={image} alt="" style={{ objectPosition: `${memory.imageFocusPoints?.[index]?.x ?? 50}% ${memory.imageFocusPoints?.[index]?.y ?? 50}%` }} />
        {index === 3 && images.length > 4 && <span className="desktop-photo-more">+{images.length - 4}<small>more</small></span>}
      </button>)}
    </div>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="detail-image-lightbox"><DialogTitle className="sr-only">{memory.title} photo {activeIndex + 1} of {images.length}</DialogTitle><div className="detail-lightbox-stage" onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)} onTouchEnd={(event) => { if (touchStartX === null) return; const distance = event.changedTouches[0].clientX - touchStartX; if (Math.abs(distance) > 45 && images.length > 1) move(distance > 0 ? -1 : 1); setTouchStartX(null); }}>
      <img src={images[activeIndex] || images[0]} alt={`${memory.title}, photo ${activeIndex + 1}`} />
      {images.length > 1 && <><button className="detail-lightbox-arrow previous" onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft /></button><button className="detail-lightbox-arrow next" onClick={() => move(1)} aria-label="Next photo"><ChevronRight /></button><span className="detail-lightbox-count" aria-live="polite">{activeIndex + 1} of {images.length}</span></>}
    </div></DialogContent></Dialog>
  </>;
};

export default MemoryPhotoGallery;
