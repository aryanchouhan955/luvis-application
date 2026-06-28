import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";

export function AppShell() {
  return (
    <div className="flex min-h-safe-screen flex-col bg-background safe-pb">
      <Navbar />
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
