import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Key, Copy, Check } from "lucide-react";
import { getDailyCode, getCodeRolloverLabel } from "@/lib/dailyCode";

export default function DailyCodeCard() {
  const code = getDailyCode();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-4 mb-4 bg-primary/5 border border-primary/20 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Today's Access Code
            </p>
            <p className="text-2xl font-bold tracking-[0.2em] text-primary font-mono leading-tight">
              {code}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Resets at {getCodeRolloverLabel()}
            </p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={copy} className="flex-shrink-0">
          {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}