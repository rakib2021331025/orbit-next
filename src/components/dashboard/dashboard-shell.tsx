import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut, User as UserIcon } from "lucide-react";
import type { Session } from "next-auth";

import { DashboardSidebar } from "./dashboard-sidebar";
import { ROLE_LABEL } from "@/lib/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

/**
 * Chrome shared by all three dashboards. The sidebar contents vary by role;
 * everything else — header, theme toggle, account menu — is identical.
 */
export function DashboardShell({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const { user } = session;
  const displayName = user.name ?? user.email ?? "Account";

  return (
    <SidebarProvider>
      <DashboardSidebar role={user.role} />

      <SidebarInset>
        <header className="bg-background/80 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />

          <div className="flex-1" />

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative size-9 rounded-full">
                <Avatar className="size-9">
                  {user.image && <AvatarImage src={user.image} alt="" />}
                  <AvatarFallback>{initials(displayName)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="grid gap-0.5">
                  <span className="truncate text-sm font-medium">{displayName}</span>
                  <span className="text-muted-foreground truncate text-xs font-normal">
                    {ROLE_LABEL[user.role]}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user.role === "STUDENT" && (
                <DropdownMenuItem asChild>
                  <Link href="/student/settings">
                    <UserIcon className="size-4" />
                    Account settings
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild variant="destructive">
                {/* Sign-out is POST-only so a cross-site GET can't trigger it. */}
                <form action="/logout" method="post" className="w-full">
                  <button type="submit" className="flex w-full items-center gap-2">
                    <LogOut className="size-4" />
                    Sign out
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
