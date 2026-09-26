import { cn } from "@/lib/utils";

type SkeletonRadius = "xs" | "sm" | "md" | "full";

const radii: Record<SkeletonRadius, string> = {
  xs: "rounded-xs",
  sm: "rounded-sm",
  md: "rounded-md",
  full: "rounded-full",
};

export interface SkeletonProps {
  className?: string;
  radius?: SkeletonRadius;
}

export function Skeleton({ className, radius = "sm" }: SkeletonProps) {
  return (
    <div
      data-testid="skeleton"
      className={cn("animate-pulse bg-surface-strong", radii[radius], className)}
    />
  );
}
