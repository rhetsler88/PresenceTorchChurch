import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { isPlatformAdmin } from "@/lib/userUtils";
import { Button } from "@/components/ui/button";
import { Radio, Check, ArrowRight, ArrowLeft, LogOut, MailCheck, Bell } from "lucide-react";
import AppLogo from "@/components/branding/AppLogo";
import { toast } from "@/lib/toast";
import { addUserChannelMembership } from "@/lib/channelMembership";

export default function Onboarding() {
  const { user, checkUserAuth, logout } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [requestMode, setRequestMode] = useState("channels");
  const [organizations, setOrganizations] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organization, setOrganization] = useState("");
  const [done, setDone] = useState(false);
  const [doneStaffAlerts, setDoneStaffAlerts] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const orgs = await api.organizations.list();
        setOrganizations(orgs);
      } catch (e) {
        toast.error("Couldn't load organizations");
      }
      try {
        const chans = await api.entities.Channel.list("-created_date", 100);
        setChannels(chans);
      } catch (e) {
        toast.error("Couldn't load channels");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const normalizeOrg = (value) => (value || "").trim().toLowerCase();

  const orgChannels = organization
    ? channels.filter((ch) => normalizeOrg(ch.organization) === normalizeOrg(organization))
    : [];

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.full_name ||
    user?.email ||
    "there";

  const toggleChannel = (id) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOrgSubmit = (e) => {
    e.preventDefault();
    if (!organization) {
      toast.error("Please select an organization");
      return;
    }
    setSelectedChannels(new Set());
    setRequestMode("channels");
    setStep(2);
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const userId = user?.id;
      const autoApprove = isPlatformAdmin(user);

      if (requestMode === "staff_alerts") {
        await api.auth.updateMe({
          first_name: user?.first_name || displayName.split(" ")[0] || "",
          last_name: user?.last_name || displayName.split(" ").slice(1).join(" ") || "",
          organization,
          onboarded: true,
          pending_staff_alerts: true,
        });

        if (autoApprove && userId) {
          await api.entities.User.update(userId, {
            receives_staff_alerts: true,
            pending_staff_alerts: false,
          });
        }

        await checkUserAuth();
        setDoneStaffAlerts(true);
        setDone(true);
        toast.success(
          autoApprove ? "Staff alerts enabled!" : "Staff alert request sent!"
        );
        return;
      }

      if (selectedChannels.size === 0) {
        toast.error("Please select at least one channel");
        setSaving(false);
        return;
      }

      await api.auth.updateMe({
        first_name: user?.first_name || displayName.split(" ")[0] || "",
        last_name: user?.last_name || displayName.split(" ").slice(1).join(" ") || "",
        organization,
        onboarded: true,
      });

      if (userId) {
        await Promise.all(
          [...selectedChannels]
            .map((cid) => {
              const ch = channels.find((c) => c.id === cid);
              if (!ch) return null;
              const pending = (ch.pending_members || []).filter((id) => id !== userId);
              const approved = ch.members || [];

              if (approved.includes(userId) || approved.includes(user?.email)) {
                return null;
              }
              if (autoApprove) {
                return api.entities.Channel.update(cid, {
                  members: [...approved, userId],
                  pending_members: pending,
                }).then(() => addUserChannelMembership(userId, cid));
              }
              if (!pending.includes(userId) && !ch.pending_members?.includes(userId)) {
                return api.entities.Channel.update(cid, {
                  pending_members: [...(ch.pending_members || []), userId],
                });
              }
              return null;
            })
            .filter(Boolean)
        );
      }

      await checkUserAuth();
      setDoneStaffAlerts(false);
      setDone(true);
      toast.success(autoApprove ? "Setup complete!" : "Access requests sent!");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't complete setup. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="page-adaptive bg-background safe-top safe-bottom">
        <div className="page-adaptive-inner w-full max-w-md mx-auto px-4 py-6">
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-green-100 dark:bg-green-900/30">
            <MailCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">Request Sent!</h1>
          {doneStaffAlerts ? (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                Your request for staff Code Red alerts at{" "}
                <span className="font-semibold text-foreground">{organization}</span> has been
                submitted.
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                An admin will approve your alert access. You will not be added to any PTT channel.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                Your request to join{" "}
                <span className="font-semibold text-foreground">
                  {selectedChannels.size} channel{selectedChannels.size !== 1 ? "s" : ""}
                </span>{" "}
                at <span className="font-semibold text-foreground">{organization}</span> has been
                submitted.
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                An admin will review and approve your access. You&apos;ll be able to talk once approved.
              </p>
            </>
          )}
          <Button onClick={() => navigate("/channels")} className="w-full">
            Continue
          </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-adaptive bg-background safe-top safe-bottom">
      <div className="page-adaptive-inner w-full max-w-md mx-auto px-4 py-6">
        <button
          onClick={() => logout(true)}
          className="mb-4 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <LogOut className="w-3 h-3" />
          Use a different account
        </button>

        <div className="flex flex-col items-center mb-4">
          <AppLogo className="w-14 h-14 mb-2" />
        </div>

        <div className="flex items-center gap-2 mb-6">
          <div className={`flex-1 h-1 rounded-full ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
          <div className={`flex-1 h-1 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <p className="text-xs text-muted-foreground mb-4">
            Signed in as <span className="font-medium text-foreground">{displayName}</span>
          </p>

          {step === 1 ? (
            <>
              <h1 className="text-xl font-bold text-foreground mb-1">Select your organization</h1>
              <p className="text-sm text-muted-foreground mb-5">
                Choose the organization or event you belong to.
              </p>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : organizations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No organizations available yet. Contact your administrator.
                </p>
              ) : (
                <form onSubmit={handleOrgSubmit} className="space-y-3">
                  {organizations.map((org) => {
                    const orgName = org.name;
                    const selected = organization === orgName;
                    return (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => setOrganization(orgName)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                          selected
                            ? "bg-primary/10 border-primary/30"
                            : "bg-muted/30 border-border hover:bg-muted/60"
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10">
                          <Radio className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-semibold text-foreground flex-1">{orgName}</span>
                        {selected && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    );
                  })}
                  <Button type="submit" className="w-full gap-1.5" disabled={!organization}>
                    Continue <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              )}
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground mb-1">What do you need?</h1>
              <p className="text-sm text-muted-foreground mb-4">
                At <span className="font-semibold text-foreground">{organization}</span>
              </p>

              <div className="grid grid-cols-2 gap-2 mb-5">
                <button
                  type="button"
                  onClick={() => setRequestMode("channels")}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-colors ${
                    requestMode === "channels"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="font-semibold block">Channel access</span>
                  Talk & listen on PTT
                </button>
                <button
                  type="button"
                  onClick={() => setRequestMode("staff_alerts")}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-colors ${
                    requestMode === "staff_alerts"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="font-semibold flex items-center gap-1">
                    <Bell className="w-3 h-3" /> Staff alerts
                  </span>
                  Code Red only, no channel
                </button>
              </div>

              {requestMode === "staff_alerts" ? (
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-2">Staff notification access</p>
                  <p>
                    For church staff who need Code Red alerts on <strong>any</strong> channel but
                    do not need PTT access. You will not be added to a talk channel.
                  </p>
                </div>
              ) : loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : orgChannels.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No channels available for this organization yet. Contact your administrator.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {orgChannels.map((ch) => {
                    const selected = selectedChannels.has(ch.id);
                    const alreadyMember =
                      ch.members?.includes(user?.id) || ch.members?.includes(user?.email);
                    const alreadyPending = ch.pending_members?.includes(user?.id);
                    const disabled = alreadyMember || alreadyPending;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => !disabled && toggleChannel(ch.id)}
                        disabled={disabled}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                          disabled
                            ? "opacity-50 cursor-not-allowed bg-muted/20 border-border"
                            : selected
                              ? "bg-primary/10 border-primary/30"
                              : "bg-muted/30 border-border hover:bg-muted/60"
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: (ch.color || "#f59e0b") + "20" }}
                        >
                          <Radio className="w-4 h-4" style={{ color: ch.color || "#f59e0b" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{ch.name}</p>
                          {disabled && (
                            <p className="text-xs text-muted-foreground">
                              {alreadyMember ? "Already a member" : "Request pending"}
                            </p>
                          )}
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                            selected ? "bg-primary border-primary" : "border-border"
                          }`}
                        >
                          {selected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  onClick={handleFinish}
                  disabled={
                    saving ||
                    loading ||
                    (requestMode === "channels" && selectedChannels.size === 0)
                  }
                  className="flex-1"
                >
                  {saving
                    ? "Sending..."
                    : requestMode === "staff_alerts"
                      ? "Request staff alerts"
                      : `Request access to ${selectedChannels.size} channel${selectedChannels.size !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
