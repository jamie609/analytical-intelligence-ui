"use client"
import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PanelLeftIcon } from "lucide-react"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider.")
  return context
}

function SidebarProvider({ defaultOpen = true, open: openProp, onOpenChange: setOpenProp, className, style, children, ...props }: React.ComponentProps<"div"> & { defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void; }) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open

  const setOpen = React.useCallback((value: boolean | ((value: boolean) => boolean)) => {
    const openState = typeof value === "function" ? value(open) : value
    if (setOpenProp) setOpenProp(openState)
    else _setOpen(openState)
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
  }, [setOpenProp, open])

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const state = open ? "expanded" : "collapsed"
  const contextValue = React.useMemo<SidebarContextProps>(() => ({ state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }), [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar])

  return (
    <SidebarContext.Provider value={contextValue}>
      <div data-slot="sidebar-wrapper" style={{ "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON, ...style } as React.CSSProperties} className={cn("group/sidebar-wrapper flex min-h-svh w-full bg-[#f8fafc]", className)} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({ side = "left", variant = "sidebar", collapsible = "offcanvas", className, children, dir, ...props }: React.ComponentProps<"div"> & { side?: "left" | "right"; variant?: "sidebar" | "floating" | "inset"; collapsible?: "offcanvas" | "icon" | "none" }) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return <div data-slot="sidebar" className={cn("flex h-full w-(--sidebar-width) flex-col bg-white text-[#0f172a] border-r border-[#e2e8f0]", className)} {...props}>{children}</div>
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent dir={dir} data-sidebar="sidebar" data-slot="sidebar" data-mobile="true" className="w-(--sidebar-width) bg-white p-0 text-[#0f172a] [&>button]:hidden" style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties} side={side}>
          <SheetHeader className="sr-only"><SheetTitle>Sidebar</SheetTitle><SheetDescription>Displays the mobile sidebar.</SheetDescription></SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div className="group peer hidden text-[#0f172a] md:block" data-state={state} data-collapsible={state === "collapsed" ? collapsible : ""} data-variant={variant} data-side={side} data-slot="sidebar">
      <div data-slot="sidebar-gap" className={cn("relative w-(--sidebar-width) bg-transparent transition-[width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]", "group-data-[collapsible=offcanvas]:w-0", "group-data-[side=right]:rotate-180", variant === "floating" || variant === "inset" ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]" : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)")} />
      <div data-slot="sidebar-container" data-side={side} className={cn("fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex", variant === "floating" || variant === "inset" ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]" : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=left]:border-[#e2e8f0] group-data-[side=right]:border-l group-data-[side=right]:border-[#e2e8f0]", className)} {...props}>
        <div data-sidebar="sidebar" data-slot="sidebar-inner" className="flex size-full flex-col bg-white group-data-[variant=floating]:rounded-xl group-data-[variant=floating]:shadow-[0_8px_30px_rgba(0,0,0,0.08)] group-data-[variant=floating]:border group-data-[variant=floating]:border-[#e2e8f0]">
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()
  return (
    <Button data-sidebar="trigger" data-slot="sidebar-trigger" variant="ghost" size="icon-sm" className={cn("text-[#64748b] hover:text-[#0B2463]", className)} onClick={(event) => { onClick?.(event); toggleSidebar() }} {...props}>
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()
  return (
    <button data-sidebar="rail" data-slot="sidebar-rail" aria-label="Toggle Sidebar" tabIndex={-1} onClick={toggleSidebar} title="Toggle Sidebar" className={cn("absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-[#cbd5e1] sm:flex", className)} {...props} />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main data-slot="sidebar-inset" className={cn("relative flex w-full flex-1 flex-col bg-[#ffffff] md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-[0_8px_30px_rgba(0,0,0,0.04)] md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-[#e2e8f0] md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]", className)} {...props} />
  )
}

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input data-slot="sidebar-input" data-sidebar="input" className={cn("h-9 w-full bg-[#f8fafc] border-[#e2e8f0] shadow-none", className)} {...props} />
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" data-sidebar="header" className={cn("flex flex-col gap-2 p-4 border-b border-[#e2e8f0]", className)} {...props} />
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" data-sidebar="footer" className={cn("flex flex-col gap-2 p-4 border-t border-[#e2e8f0] bg-[#f8fafc]", className)} {...props} />
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return <Separator data-slot="sidebar-separator" data-sidebar="separator" className={cn("mx-4 w-auto bg-[#e2e8f0]", className)} {...props} />
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" data-sidebar="content" className={cn("no-scrollbar flex min-h-0 flex-1 flex-col gap-2 p-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden", className)} {...props} />
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group" data-sidebar="group" className={cn("relative flex w-full min-w-0 flex-col px-2", className)} {...props} />
}

function SidebarGroupLabel({ className, render, ...props }: useRender.ComponentProps<"div"> & React.ComponentProps<"div">) {
  return useRender({ defaultTagName: "div", props: mergeProps<"div">({ className: cn("flex h-8 shrink-0 items-center rounded-md px-3 text-xs font-bold uppercase tracking-wider text-[#94a3b8] outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0", className), }, props), render, state: { slot: "sidebar-group-label", sidebar: "group-label", }, })
}

function SidebarGroupAction({ className, render, ...props }: useRender.ComponentProps<"button"> & React.ComponentProps<"button">) {
  return useRender({ defaultTagName: "button", props: mergeProps<"button">({ className: cn("absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-[#64748b] transition-transform hover:bg-[#f1f5f9] hover:text-[#0B2463]", className), }, props), render, state: { slot: "sidebar-group-action", sidebar: "group-action", }, })
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group-content" data-sidebar="group-content" className={cn("w-full text-sm", className)} {...props} />
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" data-sidebar="menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" data-sidebar="menu-item" className={cn("group/menu-item relative", className)} {...props} />
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-3 overflow-hidden rounded-lg p-2.5 text-left text-sm font-medium text-[#475569] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[#f8fafc] hover:text-[#0B2463] focus-visible:ring-2 active:scale-[0.98] data-active:bg-[#eef2f8] data-active:text-[#0B2463] data-active:font-semibold [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "",
        outline: "bg-white border border-[#e2e8f0] shadow-sm hover:shadow-md",
      },
      size: {
        default: "h-10 text-sm",
        sm: "h-8 text-xs",
        lg: "h-12 text-base group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function SidebarMenuButton({ render, isActive = false, variant = "default", size = "default", tooltip, className, ...props }: useRender.ComponentProps<"button"> & React.ComponentProps<"button"> & { isActive?: boolean; tooltip?: string | React.ComponentProps<typeof TooltipContent> } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar()
  const comp = useRender({ defaultTagName: "button", props: mergeProps<"button">({ className: cn(sidebarMenuButtonVariants({ variant, size }), className), }, props), render: !tooltip ? render : <TooltipTrigger render={render} />, state: { slot: "sidebar-menu-button", sidebar: "menu-button", size, active: isActive, }, })
  if (!tooltip) return comp
  if (typeof tooltip === "string") tooltip = { children: tooltip }
  return <Tooltip>{comp}<TooltipContent side="right" align="center" hidden={state !== "collapsed" || isMobile} {...tooltip} /></Tooltip>
}

function SidebarMenuAction({ className, render, showOnHover = false, ...props }: useRender.ComponentProps<"button"> & React.ComponentProps<"button"> & { showOnHover?: boolean }) {
  return useRender({ defaultTagName: "button", props: mergeProps<"button">({ className: cn("absolute top-2 right-2 flex aspect-square w-6 items-center justify-center rounded-md p-0 text-[#94a3b8] transition-all hover:bg-[#f1f5f9] hover:text-[#0B2463]", showOnHover && "opacity-0 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-[#0B2463]", className), }, props), render, state: { slot: "sidebar-menu-action", sidebar: "menu-action", }, })
}

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-menu-badge" data-sidebar="menu-badge" className={cn("pointer-events-none absolute right-2 flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-xs font-semibold text-[#0B2463] bg-[#e2e8f0]", className)} {...props} />
}

function SidebarMenuSkeleton({ className, showIcon = false, ...props }: React.ComponentProps<"div"> & { showIcon?: boolean }) {
  const [width] = React.useState(() => `${Math.floor(Math.random() * 40) + 50}%`)
  return (
    <div data-slot="sidebar-menu-skeleton" data-sidebar="menu-skeleton" className={cn("flex h-10 items-center gap-3 rounded-md px-2", className)} {...props}>
      {showIcon && <Skeleton className="size-4 rounded-md" />}
      <Skeleton className="h-4 max-w-(--skeleton-width) flex-1" style={{ "--skeleton-width": width } as React.CSSProperties} />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" className={cn("mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-[#e2e8f0] px-2.5 py-1", className)} {...props} />
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" className={cn("group/menu-sub-item relative", className)} {...props} />
}

function SidebarMenuSubButton({ render, size = "md", isActive = false, className, ...props }: useRender.ComponentProps<"a"> & React.ComponentProps<"a"> & { size?: "sm" | "md"; isActive?: boolean }) {
  return useRender({ defaultTagName: "a", props: mergeProps<"a">({ className: cn("flex h-8 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-[#64748b] transition-all hover:bg-[#f8fafc] hover:text-[#0B2463] data-active:bg-[#eef2f8] data-active:text-[#0B2463] data-active:font-medium", className), }, props), render, state: { slot: "sidebar-menu-sub-button", sidebar: "menu-sub-button", size, active: isActive, }, })
}

export { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarInset, SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger, useSidebar }