import { Toaster } from "sonner";

/** Single app toast surface — all notifications go through `@/lib/toast` (Sonner). */
export default function AppToaster() {
  return <Toaster richColors closeButton />;
}
