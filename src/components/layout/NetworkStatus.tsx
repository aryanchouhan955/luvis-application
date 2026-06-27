import { useEffect } from "react";
import { toast } from "sonner";

export function NetworkStatus() {
  useEffect(() => {
    let offlineToastId: string | number;

    const handleOnline = () => {
      if (offlineToastId) toast.dismiss(offlineToastId);
      toast.success("You are back online!", {
        description: "Network connection restored.",
      });
    };

    const handleOffline = () => {
      offlineToastId = toast.error("You are offline", {
        description: "Please check your internet connection.",
        duration: Infinity,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return null;
}
