import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LogOut, Menu, Home, Video, PlusSquare, Trophy, Target } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setMobileOpen(false);
    navigate("/");
  };

  const navLinks = user
    ? [
        { to: "/dashboard", label: "Dashboard", icon: Home },
        { to: "/create-room", label: "Create Room", icon: PlusSquare },
        { to: "/join-room", label: "Join Room", icon: Video },
        { to: "/create-challenge", label: "Create Challenge", icon: Target },
        { to: "/join-challenge", label: "Join Challenge", icon: Trophy },
      ]
    : [];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl safe-pt">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg luvis-gradient">
            <span className="text-sm font-bold text-white">L</span>
          </div>
          <span className="text-xl font-bold tracking-tight">LUVIS</span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link key={link.to} to={link.to}>
              <Button 
                variant={location.pathname === link.to ? "secondary" : "ghost"} 
                size="sm"
              >
                {link.label}
              </Button>
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {user ? (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-1 h-4 w-4" /> Logout
            </Button>
          ) : (
            <>
              <Link to="/login"><Button variant="ghost" size="sm">Login</Button></Link>
              <Link to="/signup"><Button size="sm" className="luvis-gradient text-white">Sign Up</Button></Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[350px] flex flex-col p-6 safe-pt">
              <SheetHeader className="text-left mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg luvis-gradient">
                    <span className="text-sm font-bold text-white">L</span>
                  </div>
                  LUVIS
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 flex-1 mt-4">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = location.pathname === link.to;
                  return (
                    <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}>
                      <Button 
                        variant={isActive ? "secondary" : "ghost"} 
                        className={`w-full justify-start h-12 text-base ${isActive ? 'font-semibold' : ''}`}
                      >
                        <Icon className="mr-3 h-5 w-5" />
                        {link.label}
                      </Button>
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 pt-6 border-t border-border mt-auto mb-safe-pb">
                {user ? (
                  <Button variant="destructive" className="w-full h-12 text-base" onClick={handleSignOut}>
                    <LogOut className="mr-2 h-5 w-5" /> Logout
                  </Button>
                ) : (
                  <>
                    <Link to="/login" onClick={() => setMobileOpen(false)}>
                      <Button variant="outline" className="w-full h-12 text-base">Login</Button>
                    </Link>
                    <Link to="/signup" onClick={() => setMobileOpen(false)}>
                      <Button className="w-full h-12 text-base luvis-gradient text-white">Sign Up</Button>
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
