import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] outline-none select-none focus-visible:ring-4 focus-visible:ring-[#0B2463]/20 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#43A047] text-white hover:bg-[#388E3C] hover:shadow-[0_4px_12px_rgba(67,160,71,0.25)]",
        secondary: "bg-[#0B2463] text-white hover:bg-[#1e3a8a] hover:shadow-[0_4px_12px_rgba(11,36,99,0.25)]",
        outline: "border-[#cbd5e1] bg-white text-[#475569] hover:border-[#0B2463] hover:text-[#0B2463] hover:bg-[#f8fafc] hover:shadow-[0_2px_8px_rgba(11,36,99,0.05)]",
        ghost: "text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0B2463] aria-expanded:bg-[#f1f5f9] aria-expanded:text-[#0B2463]",
        destructive: "bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2] focus-visible:ring-[#ef4444]/20",
        link: "text-[#0B2463] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
        lg: "h-12 gap-2 rounded-xl px-6 text-base",
        icon: "size-10 rounded-lg",
        "icon-xs": "size-6 rounded-md",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }