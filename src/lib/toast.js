import { toast as sonnerToast } from "sonner";
import { isPwaInstalled } from "@/lib/pushDevice";

/** Installed PWA: suppress all toast pop-ups. */
function suppressToasts() {
  return isPwaInstalled();
}

function wrapToast(method) {
  return (...args) => {
    if (suppressToasts()) return;
    return method(...args);
  };
}

export const toast = {
  success: wrapToast(sonnerToast.success),
  info: wrapToast(sonnerToast.info),
  message: wrapToast(sonnerToast.message),
  warning: wrapToast(sonnerToast.warning),
  error: wrapToast(sonnerToast.error),
  dismiss: sonnerToast.dismiss,
  promise: (...args) => {
    if (suppressToasts()) {
      const promise = args[0];
      return promise instanceof Promise ? promise : Promise.resolve(promise);
    }
    return sonnerToast.promise(...args);
  },
};
