import React, { useState } from "react";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Search, Users } from "lucide-react";
import ContactCard from "../components/contacts/ContactCard";
import AddContactDialog from "../components/contacts/AddContactDialog";

export default function Contacts() {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api.entities.Contact.list("-created_date", 200),
  });

  const addMutation = useMutation({
    mutationFn: (data) => api.entities.Contact.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (/** @type {any} */ contact) => api.entities.Contact.delete(contact.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });

  const filtered = contacts.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone_number?.includes(search)
  );

  return (
    <div className="min-h-screen safe-top">
      <div className="px-4 pt-4 pb-3 sm:px-5 sm:pt-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Contacts</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{contacts.length} people</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
            <UserPlus className="w-4 h-4" />
            Add
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            className="pl-9 bg-card border-border"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="px-2 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-1">
            {filtered.map(contact => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onDelete={(c) => deleteMutation.mutate(c)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No contacts yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {search ? "Try a different search" : "Add your first contact"}
            </p>
          </div>
        )}
      </div>

      <AddContactDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onAdd={(data) => addMutation.mutateAsync(data)}
      />
    </div>
  );
}