export default function AppLoadingScreen({ message = "Connecting..." }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background dark">
      <div
        className="flex flex-col items-center gap-3"
        role="status"
        aria-live="polite"
        aria-label={message}
      >
        <div
          className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"
          aria-hidden="true"
        />
        <span className="text-sm text-muted-foreground font-medium">{message}</span>
      </div>
    </div>
  );
}
