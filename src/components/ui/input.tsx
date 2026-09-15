import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-[#cbd5e1] bg-[#f8fafc] px-3 py-2 text-sm text-[#0f172a] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] outline-none placeholder:text-[#94a3b8] focus-visible:border-[#0B2463] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#0B2463]/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[#f1f5f9] disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-4 aria-invalid:ring-red-500/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }