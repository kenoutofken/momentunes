import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            // pointer-events-none stops touch taps from registering as a hover, which on touch
            // devices sets sonner's "expanded" state permanently (there's no mouseleave to clear
            // it) and blocks the auto-dismiss timer from ever starting — the toast then never goes away.
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg pointer-events-none",
          error:
            "group-[.toaster]:border-[var(--danger-border)] group-[.toaster]:bg-[var(--danger-surface)] group-[.toaster]:text-[var(--danger)]",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
