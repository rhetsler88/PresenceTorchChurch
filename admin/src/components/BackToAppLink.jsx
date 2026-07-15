import React from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WEB_APP_URL } from "@/lib/appLinks";

export default function BackToAppLink({ className = "", variant = "outline" }) {
  return (
    <Button variant={variant} className={`gap-2 ${className}`} asChild>
      <a href={WEB_APP_URL}>
        <ExternalLink className="w-4 h-4" />
        Back to app
      </a>
    </Button>
  );
}
