import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "pill";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const base =
  "inline-flex items-center justify-center text-button-md transition-colors disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "h-12 px-6 rounded-sm bg-rausch-text-bg text-on-primary hover:bg-rausch-text-bg-hover disabled:bg-rausch-disabled",
  secondary:
    "h-12 px-6 rounded-sm bg-canvas text-ink border border-ink hover:bg-surface-soft",
  tertiary: "text-ink underline-offset-2 hover:underline bg-transparent",
  pill: "px-5 py-2.5 rounded-full bg-rausch-text-bg text-on-primary text-button-sm hover:bg-rausch-text-bg-hover",
};

export function buttonClassName(variant: ButtonVariant = "primary"): string {
  return cn(base, variants[variant]);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(buttonClassName(variant), className)} {...props} />
  );
}
