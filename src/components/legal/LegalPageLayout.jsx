import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function LegalPageLayout({ title, lastUpdated, children }) {
  return (
    <div className="min-h-screen bg-background dark safe-top">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <header className="mb-8 border-b border-border pb-6">
          <img
            src="/logo-full.png"
            alt="Presence Torch Church"
            className="h-10 w-auto object-contain mb-4"
            draggable={false}
          />
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground mt-2">Last updated: {lastUpdated}</p>
          )}
        </header>

        <article className="prose prose-sm prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-5 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-primary [&_a]:underline">
          {children}
        </article>

        <footer className="mt-10 pt-6 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
        </footer>
      </div>
    </div>
  );
}
