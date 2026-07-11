import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { FloatingChat } from "./FloatingChat";
import {
  Home,
  Search,
  PlusSquare,
  MessageCircle,
  Heart,
  User,
  Settings,
  LogOut,
  Moon,
  Sun,
  Clapperboard,
  Ghost,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { useTheme } from "./theme-provider";
import { useEffect } from "react";
import { initSocket, disconnectSocket } from "@/lib/socket";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, token, logout } = useAuth();
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (token) {
      initSocket(token);
    } else {
      disconnectSocket();
    }
    return () => {
      disconnectSocket();
    };
  }, [token]);

  if (!user) return <>{children}</>;

  const navItems = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Search, label: "Explore", href: "/explore" },
    { icon: Clapperboard, label: "Reels", href: "/reels" },
    { icon: Ghost, label: "Snap", href: "/snap" },
    { icon: PlusSquare, label: "Create", href: "/create" },
    { icon: Brain, label: "AI Studio", href: "/ai" },
    { icon: MessageCircle, label: "Messages", href: "/messages" },
    { icon: Heart, label: "Notifications", href: "/notifications" },
    { icon: User, label: "Profile", href: `/profile/${user.username}` },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border fixed h-full p-4 gap-4 bg-card z-50">
        <div className="px-4 py-6 font-serif text-3xl font-bold italic tracking-tighter">
          Pixlr
        </div>
        <nav className="flex-1 flex flex-col gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-all hover:bg-secondary",
                location === item.href || (item.href !== "/" && location.startsWith(item.href))
                  ? "font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("w-6 h-6", location === item.href && "fill-foreground")} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 pt-4 border-t border-border">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-all hover:bg-secondary text-muted-foreground hover:text-foreground",
              location === "/settings" && "font-bold text-foreground"
            )}
          >
            <Settings className="w-6 h-6" />
            <span>Settings</span>
          </Link>
          <Button
            variant="ghost"
            className="justify-start gap-4 px-4 py-3 h-auto text-base font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            <span>Theme</span>
          </Button>
          <Button
            variant="ghost"
            className="justify-start gap-4 px-4 py-3 h-auto text-base font-medium text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={logout}
          >
            <LogOut className="w-6 h-6" />
            <span>Logout</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 min-h-[100dvh]">
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card sticky top-0 z-50">
          <div className="font-serif text-xl font-bold italic tracking-tighter">Pixlr</div>
          <div className="flex items-center gap-2">
             <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
          </div>
        </div>
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className={cn("md:hidden fixed bottom-0 w-full bg-card border-t border-border flex items-center justify-around p-2 z-50", location === "/snap" && "hidden")} style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "p-3 rounded-xl transition-colors",
              location === item.href || (item.href !== "/" && location.startsWith(item.href))
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <item.icon className={cn("w-6 h-6", location === item.href && "fill-foreground")} />
          </Link>
        ))}
      </nav>

      {/* Floating chat bubble — shown on all pages except /messages and /snap */}
      <FloatingChat />
    </div>
  );
}
