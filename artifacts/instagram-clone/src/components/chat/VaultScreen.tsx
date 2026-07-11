import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, LockOpen, X, ShieldCheck, Vault, Eye, EyeOff, Trash2, ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

async function vaultRequest(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("pixlr_token") ?? "";
  const r = await fetch(`${BASE_URL}api/vault${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error ?? msg; } catch {}
    throw new Error(msg);
  }
  return path === "" && opts.method === "DELETE" ? null : r.json().catch(() => null);
}

function formatTime(d: string | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

interface VaultedConv {
  conversationId: string;
  otherUser: { id: string; username: string; fullName?: string; avatarUrl?: string | null };
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

type Phase =
  | "lock1"         // Enter vault master PIN
  | "list"          // Show vaulted conversations
  | "lock2"         // Enter per-conversation PIN
  | "chat"          // Unlocked conversation (hand off to parent)
  | "setup_pin"     // First time: set vault master PIN
  | "add_to_vault"  // Add conversation to vault
  | "change_pin";   // Change vault master PIN

interface Props {
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
  addConversationId?: string | null;
  addConversationUser?: string | null;
  onAddComplete?: () => void;
}

export function VaultScreen({ onClose, onOpenConversation, addConversationId, addConversationUser, onAddComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("lock1");
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [conversations, setConversations] = useState<VaultedConv[]>([]);
  const [selectedConv, setSelectedConv] = useState<VaultedConv | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    vaultRequest("/status").then((r: any) => {
      setHasPin(r.hasPin);
      if (!r.hasPin) setPhase("setup_pin");
      else if (addConversationId) setPhase("lock1");
      else setPhase(r.hasPin ? "lock1" : "setup_pin");
    }).catch(() => setHasPin(false));
  }, []);

  useEffect(() => {
    setPin("");
    setPin2("");
    setError("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [phase]);

  const handleUnlockVault = useCallback(async () => {
    if (pin.length < 4) { setError("PIN must be at least 4 digits"); return; }
    setLoading(true); setError("");
    try {
      if (addConversationId) {
        setPhase("add_to_vault");
        setLoading(false);
        return;
      }
      const convs: VaultedConv[] = await vaultRequest("/unlock", { method: "POST", body: JSON.stringify({ pin }) });
      setConversations(convs);
      setPhase("list");
    } catch (e: any) {
      setError(e.message === "Wrong PIN" ? "Wrong PIN. Try again." : e.message);
    } finally { setLoading(false); }
  }, [pin, addConversationId]);

  const handleSetPin = useCallback(async () => {
    if (pin.length < 4) { setError("PIN must be at least 4 digits"); return; }
    if (pin !== pin2) { setError("PINs don't match"); return; }
    setLoading(true); setError("");
    try {
      await vaultRequest("/pin", { method: "POST", body: JSON.stringify({ pin }) });
      setHasPin(true);
      if (addConversationId) {
        setPhase("add_to_vault");
      } else {
        setConversations([]);
        setPhase("list");
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [pin, pin2, addConversationId]);

  const handleAddToVault = useCallback(async (convPin: string) => {
    if (!addConversationId) return;
    if (convPin.length < 4) { setError("PIN must be at least 4 digits"); return; }
    setLoading(true); setError("");
    try {
      await vaultRequest("/add", { method: "POST", body: JSON.stringify({ conversationId: addConversationId, pin: convPin }) });
      onAddComplete?.();
      onClose();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [addConversationId, onAddComplete, onClose]);

  const handleSelectConv = (conv: VaultedConv) => {
    setSelectedConv(conv);
    setPhase("lock2");
  };

  const handleUnlockConv = useCallback(async () => {
    if (!selectedConv) return;
    if (pin.length < 4) { setError("PIN must be at least 4 digits"); return; }
    setLoading(true); setError("");
    try {
      await vaultRequest(`/${selectedConv.conversationId}/unlock`, { method: "POST", body: JSON.stringify({ pin }) });
      onOpenConversation(selectedConv.conversationId);
      onClose();
    } catch (e: any) {
      setError(e.message === "Wrong PIN" ? "Wrong PIN. Try again." : e.message);
    } finally { setLoading(false); }
  }, [selectedConv, pin, onOpenConversation, onClose]);

  const handleRemoveFromVault = useCallback(async (convId: string) => {
    if (!confirm("Remove this conversation from the vault? It will reappear in your main chat list.")) return;
    try {
      await vaultRequest(`/${convId}`, { method: "DELETE" });
      setConversations(prev => prev.filter(c => c.conversationId !== convId));
    } catch {}
  }, []);

  const PinInput = ({ label, value, onChange, onSubmit, placeholder = "Enter PIN" }: {
    label: string; value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder?: string;
  }) => (
    <div className="flex flex-col items-center gap-4 w-full max-w-xs">
      <p className="text-sm text-muted-foreground text-center">{label}</p>
      <div className="relative w-full">
        <input
          ref={inputRef}
          type={showPin ? "text" : "password"}
          inputMode="numeric"
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
          onKeyDown={e => e.key === "Enter" && onSubmit()}
          placeholder={placeholder}
          className="w-full text-center text-2xl tracking-[0.5em] font-mono border border-border rounded-xl px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShowPin(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {(phase === "lock2" || phase === "change_pin") && (
            <button onClick={() => setPhase(phase === "lock2" ? "list" : "lock1")} className="mr-1 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="font-semibold">
              {phase === "setup_pin" && (addConversationId ? "Set Vault PIN" : "Set Up Secret Vault")}
              {phase === "lock1" && (addConversationId ? "Confirm Vault PIN" : "Secret Vault")}
              {phase === "list" && "Secret Vault"}
              {phase === "lock2" && "Open Conversation"}
              {phase === "add_to_vault" && "Lock Conversation"}
              {phase === "change_pin" && "Change Vault PIN"}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {/* Lock 1: vault master PIN */}
        {(phase === "lock1") && (
          <motion.div
            key="lock1"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-10 h-10 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                {addConversationId
                  ? <>Enter your vault PIN to add <strong>{addConversationUser}</strong>'s chat to the vault</>
                  : "Enter your vault master PIN to access hidden conversations"}
              </p>
            </div>
            <PinInput
              label="Vault Master PIN (Lock 1)"
              value={pin}
              onChange={setPin}
              onSubmit={handleUnlockVault}
            />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button onClick={handleUnlockVault} disabled={loading || pin.length < 4} className="w-full max-w-xs">
              {loading ? "Verifying..." : addConversationId ? "Continue" : "Unlock Vault"}
            </Button>
          </motion.div>
        )}

        {/* Setup PIN: first time */}
        {phase === "setup_pin" && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-10 h-10 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Create Your Secret Vault</h3>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Set a master PIN (Lock 1) to protect your hidden conversations. You'll also set a separate PIN per conversation (Lock 2) when adding them.
              </p>
            </div>
            <div className="flex flex-col items-center gap-4 w-full max-w-xs">
              <PinInput label="Create Vault PIN" value={pin} onChange={setPin} onSubmit={() => inputRef.current?.blur()} />
              <PinInput label="Confirm PIN" value={pin2} onChange={setPin2} onSubmit={handleSetPin} placeholder="Repeat PIN" />
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button onClick={handleSetPin} disabled={loading || pin.length < 4} className="w-full max-w-xs">
              {loading ? "Creating..." : "Create Vault"}
            </Button>
          </motion.div>
        )}

        {/* List: unlocked conversations */}
        {phase === "list" && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
              <span className="text-sm text-muted-foreground">{conversations.length} hidden conversation{conversations.length !== 1 ? "s" : ""}</span>
              <button
                onClick={() => setPhase("change_pin")}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <LockOpen className="w-3 h-3" /> Change PIN
              </button>
            </div>

            {conversations.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                  <Lock className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-center">No conversations in the vault yet.<br />Use the 🔒 button on any chat to hide it here.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {conversations.map(conv => (
                  <div
                    key={conv.conversationId}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors group relative cursor-pointer"
                    onClick={() => handleSelectConv(conv)}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={conv.otherUser.avatarUrl || undefined} />
                        <AvatarFallback className="text-base font-semibold">
                          {conv.otherUser.username[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-background">
                        <Lock className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={cn("text-sm truncate", conv.unreadCount > 0 ? "font-bold" : "font-semibold")}>
                          {conv.otherUser.fullName || conv.otherUser.username}
                        </span>
                        <span className="text-[11px] text-muted-foreground ml-1 shrink-0">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.lastMessage ?? "Start a conversation"}
                      </p>
                    </div>

                    {conv.unreadCount > 0 && (
                      <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center shrink-0">
                        <span className="text-[9px] text-primary-foreground font-bold">
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </span>
                      </div>
                    )}

                    {/* Remove from vault on hover */}
                    <button
                      onClick={e => { e.stopPropagation(); handleRemoveFromVault(conv.conversationId); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 hidden group-hover:flex p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Remove from vault"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Lock 2: per-conversation PIN */}
        {phase === "lock2" && selectedConv && (
          <motion.div
            key="lock2"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={selectedConv.otherUser.avatarUrl || undefined} />
                  <AvatarFallback className="text-2xl font-semibold">
                    {selectedConv.otherUser.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center border-2 border-background">
                  <Lock className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-semibold">{selectedConv.otherUser.fullName || selectedConv.otherUser.username}</p>
                <p className="text-sm text-muted-foreground">@{selectedConv.otherUser.username}</p>
              </div>
            </div>
            <PinInput
              label="Conversation PIN (Lock 2)"
              value={pin}
              onChange={setPin}
              onSubmit={handleUnlockConv}
            />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button onClick={handleUnlockConv} disabled={loading || pin.length < 4} className="w-full max-w-xs">
              {loading ? "Unlocking..." : "Open Conversation"}
            </Button>
          </motion.div>
        )}

        {/* Add to vault: set conversation PIN */}
        {phase === "add_to_vault" && (
          <motion.div
            key="add_vault"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-10 h-10 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">Set Conversation Lock</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Set a unique PIN (Lock 2) for <strong>{addConversationUser}</strong>'s chat. You'll need this PIN every time you open it from the vault.
                </p>
              </div>
            </div>
            <PinInput
              label="Conversation PIN (Lock 2)"
              value={pin}
              onChange={setPin}
              onSubmit={() => handleAddToVault(pin)}
            />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button onClick={() => handleAddToVault(pin)} disabled={loading || pin.length < 4} className="w-full max-w-xs">
              {loading ? "Hiding..." : "Hide in Vault"}
            </Button>
          </motion.div>
        )}

        {/* Change PIN */}
        {phase === "change_pin" && (
          <motion.div
            key="change_pin"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <LockOpen className="w-10 h-10 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Change Vault PIN</h3>
            </div>
            <div className="flex flex-col items-center gap-4 w-full max-w-xs">
              <PinInput label="Current Vault PIN" value={pin} onChange={setPin} onSubmit={() => inputRef.current?.blur()} />
              <PinInput label="New PIN" value={pin2} onChange={setPin2} onSubmit={() => {
                vaultRequest("/pin", { method: "POST", body: JSON.stringify({ pin: pin2, currentPin: pin }) })
                  .then(() => setPhase("list"))
                  .catch((e: any) => setError(e.message));
              }} placeholder="New PIN" />
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button
              onClick={() => {
                setLoading(true); setError("");
                vaultRequest("/pin", { method: "POST", body: JSON.stringify({ pin: pin2, currentPin: pin }) })
                  .then(() => { setPhase("list"); })
                  .catch((e: any) => setError(e.message))
                  .finally(() => setLoading(false));
              }}
              disabled={loading || pin.length < 4 || pin2.length < 4}
              className="w-full max-w-xs"
            >
              {loading ? "Saving..." : "Save New PIN"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
