import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Radio, Check, ArrowRight, ArrowLeft, MailCheck, LogOut } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/AuthContext';

const ORGANIZATIONS_FALLBACK = ["Potter's House - Columbus"];

export default function UserNotRegisteredError() {
  const { logout } = useAuth();
  const [step, setStep] = useState(1);
  const [organization, setOrganization] = useState("");
  const [organizations, setOrganizations] = useState(ORGANIZATIONS_FALLBACK);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.organizations.list().then((orgs) => {
      if (orgs.length > 0) {
        setOrganizations(orgs.map((org) => org.name));
      }
    });
  }, []);

  const handleOrgSubmit = (e) => {
    e.preventDefault();
    if (!organization) {
      toast.error("Please select an organization");
      return;
    }
    setStep(2);
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !email.trim()) {
      toast.error("First name and email are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.functions.invoke("requestAccess", {
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        organization,
      });
      setStep(3);
    } catch (err) {
      toast.error("Couldn't send request. Please contact your administrator.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background safe-top p-4">
      <div className="max-w-md w-full">
        {step !== 3 && (
          <button
            onClick={() => logout(true)}
            className="mb-4 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <LogOut className="w-3 h-3" />
            Use a different account
          </button>
        )}
        {step === 1 && (
          <div className="bg-card rounded-2xl shadow-lg border border-border p-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 mb-4 rounded-full bg-primary/10">
                <Radio className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Request Access</h1>
              <p className="text-sm text-muted-foreground">
                You're not registered yet. Choose your organization to request access.
              </p>
            </div>
            <form onSubmit={handleOrgSubmit} className="space-y-3">
              {organizations.map(org => {
                const selected = organization === org;
                return (
                  <button
                    key={org}
                    type="button"
                    onClick={() => setOrganization(org)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                      selected ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border hover:bg-muted/60"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10">
                      <Radio className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-semibold text-foreground flex-1">{org}</span>
                    {selected && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
              <Button type="submit" className="w-full gap-1.5 mt-2">
                Continue <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </div>
        )}

        {step === 2 && (
          <div className="bg-card rounded-2xl shadow-lg border border-border p-6">
            <h1 className="text-xl font-bold text-foreground mb-1">Your Details</h1>
            <p className="text-sm text-muted-foreground mb-5">
              An admin will review your request and send an invite.
            </p>
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <Label htmlFor="reqFirstName">First name <span className="text-destructive">*</span></Label>
                <Input id="reqFirstName" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" required autoFocus />
              </div>
              <div>
                <Label htmlFor="reqLastName">Last name or initial</Label>
                <Input id="reqLastName" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="D or Doe" />
              </div>
              <div>
                <Label htmlFor="reqEmail">Email <span className="text-destructive">*</span></Label>
                <Input id="reqEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="gap-1.5">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button type="submit" disabled={submitting || !firstName.trim() || !email.trim()} className="flex-1">
                  {submitting ? "Sending..." : "Request Access"}
                </Button>
              </div>
            </form>
          </div>
        )}

        {step === 3 && (
          <div className="bg-card rounded-2xl shadow-lg border border-border p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-green-100">
              <MailCheck className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3">Request Sent!</h1>
            <p className="text-sm text-muted-foreground mb-2">
              Your access request for <span className="font-semibold text-foreground">{organization}</span> has been sent to the administrators.
            </p>
            <p className="text-sm text-muted-foreground">
              Once approved, you'll receive an email invite to join. Then you can sign in and start using the app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}