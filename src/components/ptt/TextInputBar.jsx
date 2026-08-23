import React, { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TextInputBar({ onSend, disabled }) {
  const [text, setText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md">
      <div className="flex items-center gap-2 bg-card border border-border rounded-full pr-1.5 pl-4 py-1">
        <Input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message to channel..."
          className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-8"
          disabled={disabled}
        />
        <Button
          type="submit"
          size="icon"
          className="w-8 h-8 rounded-full flex-shrink-0"
          disabled={!text.trim() || disabled}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </form>
  );
}