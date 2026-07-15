import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export default function AccessRequests() {
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["accessRequests"],
    queryFn: () => api.entities.AccessRequest.list("-created_date", 200),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }) => api.entities.AccessRequest.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accessRequests"] });
      toast.success("Request updated");
    },
    onError: () => toast.error("Couldn't update request"),
  });

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-foreground mb-1">Access Requests</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Review users who requested access before signing in
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Pending ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests</p>
            ) : (
              <div className="space-y-3">
                {pending.map((req) => (
                  <RequestRow
                    key={req.id}
                    request={req}
                    onApprove={() => updateMutation.mutate({ id: req.id, status: "approved" })}
                    onReject={() => updateMutation.mutate({ id: req.id, status: "rejected" })}
                  />
                ))}
              </div>
            )}
          </section>

          {resolved.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Resolved ({resolved.length})
              </h2>
              <div className="space-y-3">
                {resolved.map((req) => (
                  <RequestRow key={req.id} request={req} resolved />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RequestRow({ request, onApprove, onReject, resolved }) {
  const name = [request.first_name, request.last_name].filter(Boolean).join(" ") || "Unknown";

  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
      <div>
        <p className="font-semibold text-foreground">{name}</p>
        <p className="text-sm text-muted-foreground">{request.email}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {request.organization}
          {resolved && ` · ${request.status}`}
        </p>
      </div>
      {!resolved && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onReject}>
            <X className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={onApprove}>
            <Check className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
