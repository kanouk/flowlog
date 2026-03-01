import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const selectableControlVariants = cva(
  "inline-flex items-center justify-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      appearance: {
        card: "rounded-2xl border text-center active:scale-[0.97]",
        pill: "rounded-full border",
      },
      size: {
        card: "gap-2 p-2",
        pill: "gap-1.5 px-3 py-1.5",
      },
      selected: {
        true: "",
        false: "",
      },
    },
    defaultVariants: {
      appearance: "pill",
      size: "pill",
      selected: false,
    },
  }
);

export interface SelectableControlProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof selectableControlVariants> {}

const SelectableControl = React.forwardRef<HTMLButtonElement, SelectableControlProps>(
  ({ className, appearance, size, selected, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-state={selected ? "on" : "off"}
      aria-pressed={selected}
      className={cn(selectableControlVariants({ appearance, size, selected }), className)}
      {...props}
    />
  )
);
SelectableControl.displayName = "SelectableControl";

export { SelectableControl };
