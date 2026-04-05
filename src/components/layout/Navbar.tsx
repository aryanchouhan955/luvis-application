import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const navLinks = user
    ? [
        { to: "/dashboard", label: "Dashboard" },
        { to: "/create-room", label: "Create Room" },
        { to: "/join-room", label: "Join Room" },
        { to: "/create-challenge", label: "Create Challenge" },
        { to: "/join-challenge", label: "Join Challenge" },
      ]
    : [];

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
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
              <Button variant="ghost" size="sm">{link.label}</Button>
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
        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-background p-4 md:hidden">
          <div className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start">{link.label}</Button>
              </Link>
            ))}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <ThemeToggle />
              {user ? (
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="mr-1 h-4 w-4" /> Logout
                </Button>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileOpen(false)}><Button variant="ghost" size="sm">Login</Button></Link>
                  <Link to="/signup" onClick={() => setMobileOpen(false)}><Button size="sm" className="luvis-gradient text-white">Sign Up</Button></Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
