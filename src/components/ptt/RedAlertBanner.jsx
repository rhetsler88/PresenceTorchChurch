import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RedAlertBanner({ channelName, onDismiss }) {
  return (
    <AnimatePresence>
      {channelName && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[60] bg-red-600 text-white shadow-lg safe-top"
        >
          <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.4, repeat: Infinity }}
            >
              <AlertTriangle className="w-6 h-6" />
            </motion.div>
            <div className="flex-1">
              <p className="text-sm font-bold uppercase tracking-wide">Code Red, Code Red, Code Red — Secure Now</p>
              <p className="text-xs opacity-90">
                Protection Level Status now Red
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20 h-8 w-8 flex-shrink-0"
              onClick={onDismiss}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}