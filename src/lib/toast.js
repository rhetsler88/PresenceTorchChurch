import { toast as sonnerToast } from "sonner";
import { isPwaInstalled } from "@/lib/pushDevice";

/** Installed PWA: skip success/info toasts for routine actions. Errors still surface. */
function suppressActionToasts() {
  return isPwaInstalled();
}

function wrapActionToast(method) {
  return (...args) => {
    if (suppressActionToasts()) return;
    return method(...args);
  };
}

export const toast = {
  success: wrapActionToast(sonnerToast.success),
  info: wrapActionToast(sonnerToast.info),
  message: wrapActionToast(sonnerToast.message),
  warning: wrapActionToast(sonnerToast.warning),
  error: sonnerToast.error,
  dismiss: sonnerToast.dismiss,
  promise: sonnerToast.promise,
};
