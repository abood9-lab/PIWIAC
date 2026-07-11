import { useState, useEffect, useRef } from "react";
import { X, Users, Plus, Camera, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

async function apiGet(path: string) {
  const token = localStorage.getItem("pixlr_token") ?? "";
  const r = await fetch(`${BASE_URL}api/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

interface UserResult {
  id: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

interface Props {
  onClose: () => void;
  onCreate: (groupData: {
    name: string;
    description: string;
    memberUsernames: string[];
    avatarData?: string;
  }) => Promise<void>;
  /** When set, the modal skips group-details and adds selected members to this existing group instead of creating a new one. */
  addToGroupId?: string;
  /** User IDs already in the group, excluded from search results (add-members mode). */
  existingMemberIds?: string[];
  /** Called with selected usernames when adding members to an existing group. */
  onAddMembers?: (memberUsernames: string[]) => Promise<void>;
}

export function CreateGroupModal({ onClose, onCreate, addToGroupId, existingMemberIds, onAddMembers }: Props) {
  const isAddMode = !!addToGroupId;
  const [step, setStep] = useState<"members" | "info">("members");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(() => {
      apiGet(`groups/user-search?q=${encodeURIComponent(searchQuery)}`)
        .then((results: UserResult[]) =>
          setSearchResults(results.filter(u =>
            !selectedUsers.some(s => s.id === u.id) &&
            !(existingMemberIds ?? []).includes(u.id)
          ))
        )
        .catch(() => {})
        .finally(() => setIsSearching(false));
    }, 250);
  }, [searchQuery, selectedUsers, existingMemberIds]);

  const handleAddMembers = async () => {
    if (selectedUsers.length === 0 || !onAddMembers) return;
    setIsCreating(true); setError(null);
    try {
      await onAddMembers(selectedUsers.map(u => u.username));
    } catch (err: any) {
      setError(err?.message ?? "Failed to add members");
      setIsCreating(false);
    }
  };

  const addUser = (u: UserResult) => {
    if (!selectedUsers.some(s => s.id === u.id)) setSelectedUsers(p => [...p, u]);
    setSearchQuery(""); setSearchResults([]);
  };

  const removeUser = (id: string) => setSelectedUsers(p => p.filter(u => u.id !== id));

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatarPreview(result);
      setAvatarData(result.split(",")[1] ?? null);
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!groupName.trim()) { setError("Group name is required"); return; }
    if (selectedUsers.length === 0) { setError("Add at least one member"); return; }
    setIsCreating(true); setError(null);
    try {
      await onCreate({
        name: groupName.trim(),
        description: groupDescription.trim(),
        memberUsernames: selectedUsers.map(u => u.username),
        avatarData: avatarData ?? undefined,
      });
    } catch (err: any) {
      setError(err?.message ?? "Failed to create group");
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md flex flex-col border border-border overflow-hidden"
        style={{ maxHeight: "min(90vh, 640px)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {step === "info" && (
              <button
                onClick={() => setStep("members")}
                className="p-1 rounded-full hover:bg-secondary transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="font-bold text-base">
              {isAddMode ? "Add Members" : step === "members" ? "New Group" : "Group Details"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step 1: Select members ──────────────────────────────────── */}
        {step === "members" && (
          <>
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className={cn(
                "flex flex-wrap gap-1.5 p-2.5 border rounded-xl bg-secondary/20 min-h-[44px]",
                "focus-within:border-primary transition-colors"
              )}>
                {selectedUsers.map(u => (
                  <span
                    key={u.id}
                    className="flex items-center gap-1 bg-primary/15 text-primary rounded-full px-2.5 py-0.5 text-sm font-medium"
                  >
                    {u.username}
                    <button onClick={() => removeUser(u.id)} className="hover:text-destructive ml-0.5 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5"
                  placeholder={selectedUsers.length === 0 ? "Search by username…" : "Add more…"}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              {isSearching && (
                <div className="text-center py-6 text-sm text-muted-foreground">Searching…</div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <div className="px-2 pb-2">
                  {searchResults.map(u => (
                    <button
                      key={u.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-left"
                      onClick={() => addUser(u)}
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={u.avatarUrl || undefined} />
                        <AvatarFallback className="text-sm font-bold">{u.username[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{u.username}</div>
                        {u.fullName && <div className="text-xs text-muted-foreground truncate">{u.fullName}</div>}
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                        <Plus className="w-3 h-3 text-primary" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!isSearching && !searchQuery && selectedUsers.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">
                    Selected · {selectedUsers.length}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {selectedUsers.map(u => (
                      <div
                        key={u.id}
                        className="flex flex-col items-center gap-1 cursor-pointer"
                        onClick={() => removeUser(u.id)}
                        title={`Remove ${u.username}`}
                      >
                        <div className="relative">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={u.avatarUrl || undefined} />
                            <AvatarFallback className="font-bold">{u.username[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive rounded-full flex items-center justify-center shadow-sm">
                            <X className="w-3 h-3 text-white" />
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[56px] text-center">
                          {u.username}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isSearching && !searchQuery && selectedUsers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                  <Users className="w-10 h-10 mb-3 opacity-25" />
                  <p className="text-sm font-medium">Search for people to add</p>
                  <p className="text-xs mt-1 opacity-70">You can add up to 255 members</p>
                </div>
              )}
            </ScrollArea>

            {error && (
              <div className="px-4 pb-2">
                <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2.5 border border-destructive/20">
                  {error}
                </div>
              </div>
            )}

            <div className="px-4 py-3 border-t border-border shrink-0">
              <Button
                className="w-full rounded-full"
                disabled={selectedUsers.length === 0 || isCreating}
                onClick={() => isAddMode ? handleAddMembers() : setStep("info")}
              >
                {isAddMode
                  ? (isCreating ? "Adding…" : `Add ${selectedUsers.length || ""} member${selectedUsers.length === 1 ? "" : "s"}`)
                  : `Next — ${selectedUsers.length} selected`}
              </Button>
            </div>
          </>
        )}

        {/* ── Step 2: Group info ──────────────────────────────────────── */}
        {step === "info" && (
          <>
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-5 py-4 space-y-5">
                {/* Avatar */}
                <div className="flex justify-center pt-1">
                  <div
                    className="relative cursor-pointer group"
                    onClick={() => fileInputRef.current?.click()}
                    title="Change group photo"
                  >
                    <div className={cn(
                      "h-24 w-24 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-border",
                      !avatarPreview && "bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500"
                    )}>
                      {avatarPreview
                        ? <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                        : <Users className="w-10 h-10 text-white" />
                      }
                    </div>
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                    <div className="absolute bottom-0.5 right-0.5 w-7 h-7 bg-primary rounded-full flex items-center justify-center border-2 border-card">
                      <Camera className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Group Name <span className="text-destructive">*</span></label>
                  <Input
                    autoFocus
                    placeholder="e.g. Study Group, Work Team…"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    maxLength={60}
                    className="rounded-xl"
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                  />
                  <div className="text-right text-[11px] text-muted-foreground">{groupName.length}/60</div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">
                    Description <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <textarea
                    placeholder="What's this group about?"
                    value={groupDescription}
                    onChange={e => setGroupDescription(e.target.value)}
                    maxLength={200}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground transition-shadow"
                  />
                  <div className="text-right text-[11px] text-muted-foreground">{groupDescription.length}/200</div>
                </div>

                {/* Members summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold">Members</label>
                    <span className="text-xs text-muted-foreground">{selectedUsers.length} people</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedUsers.map(u => (
                      <span key={u.id} className="flex items-center gap-1.5 bg-secondary rounded-full px-2.5 py-1 text-xs font-medium">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={u.avatarUrl || undefined} />
                          <AvatarFallback className="text-[8px]">{u.username[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {u.username}
                      </span>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2.5 border border-destructive/20">
                    {error}
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="px-4 py-3 border-t border-border shrink-0">
              <Button
                className="w-full rounded-full"
                onClick={handleCreate}
                disabled={isCreating || !groupName.trim()}
              >
                {isCreating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Creating…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Create Group
                  </span>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
