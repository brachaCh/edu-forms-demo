import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-[#2F3B67] text-white shadow-[0_10px_24px_-10px_rgba(47,59,103,0.65)] hover:bg-[#242C4F] hover:shadow-[0_14px_28px_-10px_rgba(47,59,103,0.75)]",
        outline:
          "border-2 border-[#10B7C6] bg-white text-[#10B7C6] shadow-sm hover:bg-[#E8FAFC]",
        ghost: "text-[#2F3B67] hover:bg-[#E4EAF3]/70",
        secondary:
          "bg-[#FF7A20] text-white shadow-[0_10px_24px_-10px_rgba(255,122,32,0.55)] hover:bg-[#E66A14]",
        link: "text-[#2F3B67] underline-offset-4 hover:underline",
        destructive:
          "bg-[#EB5757] text-white shadow-[0_10px_24px_-12px_rgba(235,87,87,0.7)] hover:brightness-110",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-14 px-8 text-base",
        xl: "h-16 px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
