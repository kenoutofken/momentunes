import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  insetForHandle?: boolean;
}

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
};

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = "right", insetForHandle = true, className, children, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, ...props }, ref) => {
    const contentRef = React.useRef<React.ElementRef<typeof SheetPrimitive.Content> | null>(null);
    const closeRef = React.useRef<HTMLButtonElement | null>(null);
    const dragRef = React.useRef<DragState | null>(null);

    const setRefs = React.useCallback((node: React.ElementRef<typeof SheetPrimitive.Content> | null) => {
      contentRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }, [ref]);

    const resetDrag = React.useCallback(() => {
      if (contentRef.current) {
        contentRef.current.style.transform = "";
        contentRef.current.style.transition = "";
      }
      dragRef.current = null;
    }, []);

    const getCloseOffset = React.useCallback((clientX: number, clientY: number) => {
      const state = dragRef.current;
      if (!state) return 0;

      switch (side) {
        case "left":
          return Math.max(0, state.startX - clientX);
        case "right":
          return Math.max(0, clientX - state.startX);
        case "top":
          return Math.max(0, state.startY - clientY);
        case "bottom":
        default:
          return Math.max(0, clientY - state.startY);
      }
    }, [side]);

    const setCloseTransform = React.useCallback((offset: number) => {
      if (!contentRef.current) return;
      contentRef.current.style.transition = "none";

      if (side === "left") {
        contentRef.current.style.transform = `translateX(-${offset}px)`;
      } else if (side === "right") {
        contentRef.current.style.transform = `translateX(${offset}px)`;
      } else if (side === "top") {
        contentRef.current.style.transform = `translateY(-${offset}px)`;
      } else {
        contentRef.current.style.transform = `translateY(${offset}px)`;
      }
    }, [side]);

    const canStartDrag = React.useCallback((event: React.PointerEvent<React.ElementRef<typeof SheetPrimitive.Content>>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-sheet-close]")) return false;

      const rect = event.currentTarget.getBoundingClientRect();

      if (side === "left") return event.clientX >= rect.right - 72;
      if (side === "right") return event.clientX <= rect.left + 72;
      if (side === "top") return event.clientY >= rect.bottom - 96;
      return event.clientY <= rect.top + 96;
    }, [side]);

    const finishDrag = React.useCallback((event: React.PointerEvent<React.ElementRef<typeof SheetPrimitive.Content>>) => {
      const state = dragRef.current;
      if (!state) return;

      const offset = getCloseOffset(event.clientX, event.clientY);
      const content = contentRef.current;
      const closeThreshold = Math.min(
        160,
        side === "left" || side === "right"
          ? (content?.offsetWidth ?? 320) * 0.33
          : (content?.offsetHeight ?? 320) * 0.22,
      );

      event.currentTarget.releasePointerCapture(state.pointerId);
      resetDrag();

      if (state.active && offset > closeThreshold) {
        closeRef.current?.click();
      }
    }, [getCloseOffset, resetDrag, side]);

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={setRefs}
          className={cn(
            sheetVariants({ side }),
            insetForHandle && side === "right" && "[&>*:not([data-sheet-handle]):not([data-sheet-close])]:!pl-12",
            insetForHandle && side === "left" && "[&>*:not([data-sheet-handle]):not([data-sheet-close])]:!pr-12",
            className,
          )}
          onPointerDown={(event) => {
            onPointerDown?.(event);
            if (event.defaultPrevented || event.button !== 0) return;
            if (!canStartDrag(event)) return;

            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              active: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            onPointerMove?.(event);
            const state = dragRef.current;
            if (!state) return;

            const closeOffset = getCloseOffset(event.clientX, event.clientY);
            const crossOffset = side === "left" || side === "right"
              ? Math.abs(event.clientY - state.startY)
              : Math.abs(event.clientX - state.startX);

            if (!state.active && closeOffset > 12 && closeOffset > crossOffset) {
              state.active = true;
            }

            if (state.active) {
              event.preventDefault();
              setCloseTransform(closeOffset);
            }
          }}
          onPointerUp={(event) => {
            onPointerUp?.(event);
            finishDrag(event);
          }}
          onPointerCancel={(event) => {
            onPointerCancel?.(event);
            resetDrag();
          }}
          {...props}
        >
          <div
            data-sheet-handle
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute rounded-full bg-muted-foreground/30",
              side === "bottom" && "left-1/2 top-3 h-1.5 w-12 -translate-x-1/2",
              side === "top" && "bottom-3 left-1/2 h-1.5 w-12 -translate-x-1/2",
              side === "right" && "left-3 top-1/2 h-12 w-1.5 -translate-y-1/2",
              side === "left" && "right-3 top-1/2 h-12 w-1.5 -translate-y-1/2",
            )}
          />
          {children}
          <SheetPrimitive.Close
            data-sheet-close
            ref={closeRef}
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-foreground/70 bg-white text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
