import { useId } from "react";
import { cn } from "@/lib/utils";

export interface TextInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextInput({ label, error, className, id, ...props }: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-caption text-muted">
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "h-14 rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink",
          "placeholder:text-muted focus:border-2 focus:border-ink focus:outline-none",
          error && "border-error",
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <span className="text-body-sm text-error">{error}</span>}
    </div>
  );
}
