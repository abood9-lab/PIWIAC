import { useState, useRef } from "react";
import {
  X, Camera, Users, Shield, ShieldOff, UserMinus, Crown,
  BellOff, Bell, Archive, ArchiveRestore, Trash2, LogOut,
  ChevronDown, ChevronRight, Lock, Image, Pin, Star,
  Settings, UserPlus,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ChatMessage } from "./MessageBubble";

interface GroupMember {
  id: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

interface GroupConv {
  id: string;
  groupName: string;
  groupAvatarUrl?: string | null;
  groupDescription?: string | null;
  memberCount: number;
  members: GroupMember[];
  adminIds: string[];
  isAdmin: boolean;
  createdBy: string;
  onlyAdminsCanSend: boolean;
  disappearAfter?: string | null;
  isMuted: boolean;
  isArchived: boolean;
}

interface Props {
  group: GroupConv;
  myId: string;
  sharedMedia: ChatMessage[];
  pinnedMessages: ChatMessage[];
  starredMessages: ChatMessage[];
  onClose: () => void;
  onLeave: () => void;
  onDelete: () => void;
  onUpdateGroup: (updates: { name?: string; description?: string; avatarData?: string; onlyAdminsCanSend?: boolean }) => Promise<void>;
  onAddMembers: () => void;
  onRemoveMember: (userId: string) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onDisappearChange: (value: string | null) => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onViewMedia: (url: string, type: string) => void;
}

export function GroupInfoPanel({
  group, myId, sharedMedia, pinnedMessages, starredMessages,
  onClose, onLeave, onDelete, onUpdateGroup, onAddMembers,
  onRemoveMember, onPromote, onDemote, onDisappearChange,
  onToggleMute, onToggleArchive, onViewMedia,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameValue, setNameValue] = useState(group.groupName);
  const [descValue, setDescValue] = useState(group.groupDescription ?? "");
  const [showMembers, setShowMembers] = useState(true);
  const [showMedia, setShowMedia] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memberMenuId, setMemberMenuId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    setIsSaving(true);
    try { await onUpdateGroup({ name: nameValue.trim() }); setEditingName(false); }
    catch { /* keep editing */ }
    finally { setIsSaving(false); }
  };

  const handleSaveDesc = async () => {
    setIsSaving(true);
    try { await onUpdateGroup({ description: descValue }); setEditingDesc(false); }
    catch { /* keep editing */ }
    finally { setIsSaving(false); }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      const avatarData = result.split(",")[1] ?? "";
      try { await onUpdateGroup({ avatarData }); }
      catch { /* ignore */ }
    };
    reader.readAsDataURL(file);
  };

  const disappearLabel: Record<string, string> = {
    "1h": "1 hour", "24h": "24 hours", "7d": "7 days",
  };

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="font-bold text-sm">Group Info</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="pb-6">
          {/* Group avatar + name */}
          <div className="flex flex-col items-center px-5 pt-5 pb-4 gap-3">
            <div className="relative">
              <div className={cn(
                "h-20 w-20 rounded-full overflow-hidden ring-2 ring-border",
                !group.groupAvatarUrl && "bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 flex items-center justify-center"
              )}>
                {group.groupAvatarUrl
                  ? <img src={group.groupAvatarUrl} alt="" className="h-full w-full object-cover" />
                  : <Users className="w-9 h-9 text-white" />
                }
              </div>
              {group.isAdmin && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-card hover:opacity-80 transition-opacity"
                  title="Change photo"
                >
                  <Camera className="w-3 h-3 text-primary-foreground" />
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            {/* Name */}
            {editingName ? (
              <div className="flex items-center gap-2 w-full">
                <input
                  autoFocus
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  maxLength={60}
                  className="flex-1 text-center text-lg font-bold bg-secondary/40 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary/40"
                  onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                />
                <Button size="sm" className="rounded-full px-3 h-8" onClick={handleSaveName} disabled={isSaving}>Save</Button>
                <Button size="sm" variant="ghost" className="rounded-full px-3 h-8" onClick={() => setEditingName(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="text-center">
                <div
                  className={cn("text-lg font-bold leading-tight", group.isAdmin && "cursor-pointer hover:underline underline-offset-2")}
                  onClick={() => group.isAdmin && setEditingName(true)}
                  title={group.isAdmin ? "Edit group name" : undefined}
                >
                  {group.groupName}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{group.memberCount} members</div>
              </div>
            )}

            {/* Description */}
            {editingDesc ? (
              <div className="w-full space-y-2">
                <textarea
                  autoFocus
                  value={descValue}
                  onChange={e => setDescValue(e.target.value)}
                  maxLength={200}
                  rows={3}
                  className="w-full rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" className="rounded-full h-7 px-3 text-xs" onClick={() => setEditingDesc(false)}>Cancel</Button>
                  <Button size="sm" className="rounded-full h-7 px-3 text-xs" onClick={handleSaveDesc} disabled={isSaving}>Save</Button>
                </div>
              </div>
            ) : (
              group.groupDescription || group.isAdmin ? (
                <p
                  className={cn(
                    "text-sm text-center text-muted-foreground px-2 leading-snug",
                    group.isAdmin && "cursor-pointer hover:text-foreground transition-colors"
                  )}
                  onClick={() => group.isAdmin && setEditingDesc(true)}
                  title={group.isAdmin ? "Edit description" : undefined}
                >
                  {group.groupDescription || (group.isAdmin ? <span className="italic">Add a description…</span> : null)}
                </p>
              ) : null
            )}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2 px-4 mb-4">
            {group.isAdmin && (
              <button
                onClick={onAddMembers}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
              >
                <UserPlus className="w-5 h-5 text-primary" />
                <span className="text-[11px] font-medium">Add</span>
              </button>
            )}
            <button
              onClick={onToggleMute}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
            >
              {group.isMuted ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
              <span className="text-[11px] font-medium">{group.isMuted ? "Unmute" : "Mute"}</span>
            </button>
            <button
              onClick={onToggleArchive}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
            >
              {group.isArchived ? <ArchiveRestore className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
              <span className="text-[11px] font-medium">{group.isArchived ? "Unarchive" : "Archive"}</span>
            </button>
          </div>

          {/* Members */}
          <div className="px-3 mb-1">
            <button
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors"
              onClick={() => setShowMembers(v => !v)}
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Users className="w-4 h-4" />
                Members <span className="text-muted-foreground font-normal">· {group.memberCount}</span>
              </div>
              {showMembers ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showMembers && (
              <div className="mt-1 space-y-0.5 relative">
                {group.members.map(member => {
                  const isThisAdmin = group.adminIds.includes(member.id);
                  const isCreator = member.id === group.createdBy;
                  const isMe = member.id === myId;
                  const menuOpen = memberMenuId === member.id;

                  return (
                    <div key={member.id} className="relative">
                      <div
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-xl group",
                          group.isAdmin && !isMe && "hover:bg-secondary/50 cursor-pointer transition-colors"
                        )}
                        onClick={() => group.isAdmin && !isMe && setMemberMenuId(menuOpen ? null : member.id)}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={member.avatarUrl || undefined} />
                          <AvatarFallback className="text-sm font-bold">{member.username[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold truncate">{member.username}</span>
                            {isCreator && <Crown className="w-3 h-3 text-yellow-500 shrink-0" aria-label="Creator" />}
                            {isThisAdmin && !isCreator && <Shield className="w-3 h-3 text-primary shrink-0" aria-label="Admin" />}
                            {isMe && <span className="text-[10px] text-muted-foreground">(you)</span>}
                          </div>
                          {member.fullName && <div className="text-xs text-muted-foreground truncate">{member.fullName}</div>}
                        </div>
                        {isThisAdmin && (
                          <span className="text-[10px] font-medium text-primary/70 bg-primary/10 rounded-full px-2 py-0.5 shrink-0">
                            {isCreator ? "Owner" : "Admin"}
                          </span>
                        )}
                      </div>

                      {/* Member context menu */}
                      {menuOpen && group.isAdmin && !isMe && (
                        <div className="absolute right-3 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[180px]">
                          {!isThisAdmin ? (
                            <button
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors"
                              onClick={() => { onPromote(member.id); setMemberMenuId(null); }}
                            >
                              <Shield className="w-4 h-4 text-primary" /> Make Admin
                            </button>
                          ) : (
                            group.adminIds.length > 1 && (
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors"
                                onClick={() => { onDemote(member.id); setMemberMenuId(null); }}
                              >
                                <ShieldOff className="w-4 h-4 text-muted-foreground" /> Remove Admin
                              </button>
                            )
                          )}
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => { onRemoveMember(member.id); setMemberMenuId(null); }}
                          >
                            <UserMinus className="w-4 h-4" /> Remove from Group
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Settings (admin only) */}
          {group.isAdmin && (
            <div className="px-3 mt-3">
              <div className="px-3 py-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settings</p>
              </div>

              {/* Only admins can send */}
              <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-secondary/50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Only admins can send</div>
                    <div className="text-xs text-muted-foreground">Restrict messaging to admins</div>
                  </div>
                </div>
                <button
                  onClick={() => onUpdateGroup({ onlyAdminsCanSend: !group.onlyAdminsCanSend })}
                  className={cn(
                    "w-10 h-5.5 rounded-full transition-colors relative shrink-0",
                    group.onlyAdminsCanSend ? "bg-primary" : "bg-secondary border border-border"
                  )}
                  style={{ height: "22px" }}
                >
                  <span className={cn(
                    "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
                    group.onlyAdminsCanSend ? "left-[22px]" : "left-0.5"
                  )} />
                </button>
              </div>
            </div>
          )}

          {/* Disappear messages */}
          <div className="px-3 mt-2">
            <div className="px-3 py-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Disappearing Messages</p>
            </div>
            <div className="px-3 space-y-0.5">
              {(["off", "1h", "24h", "7d"] as const).map(opt => {
                const current = group.disappearAfter ?? "off";
                const isSelected = opt === current;
                return (
                  <button
                    key={opt}
                    onClick={() => onDisappearChange(opt === "off" ? null : opt)}
                    className={cn(
                      "w-full flex items-center justify-between py-2.5 px-2 rounded-xl text-sm transition-colors",
                      isSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-secondary/50"
                    )}
                  >
                    <span>{opt === "off" ? "Off" : disappearLabel[opt]}</span>
                    {isSelected && <span className="w-2 h-2 bg-primary rounded-full" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shared media */}
          {sharedMedia.length > 0 && (
            <div className="px-3 mt-3">
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors"
                onClick={() => setShowMedia(v => !v)}
              >
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Image className="w-4 h-4" /> Media & Files
                  <span className="text-muted-foreground font-normal">· {sharedMedia.length}</span>
                </div>
                {showMedia ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showMedia && (
                <div className="grid grid-cols-3 gap-1 px-1 mt-1">
                  {sharedMedia.slice(0, 12).map(m => (
                    <button
                      key={m.id}
                      className="aspect-square rounded-lg overflow-hidden bg-secondary hover:opacity-80 transition-opacity"
                      onClick={() => m.mediaUrl && onViewMedia(m.mediaUrl, m.mediaType ?? "image")}
                    >
                      {m.mediaType?.startsWith("video")
                        ? <div className="w-full h-full flex items-center justify-center bg-secondary text-muted-foreground text-xs">▶</div>
                        : <img src={m.mediaUrl ?? ""} alt="" className="w-full h-full object-cover" />
                      }
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pinned messages */}
          {pinnedMessages.length > 0 && (
            <div className="px-3 mt-2">
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors"
                onClick={() => setShowPinned(v => !v)}
              >
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Pin className="w-4 h-4" /> Pinned
                  <span className="text-muted-foreground font-normal">· {pinnedMessages.length}</span>
                </div>
                {showPinned ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showPinned && (
                <div className="px-1 space-y-1 mt-1">
                  {pinnedMessages.map(m => (
                    <div key={m.id} className="px-3 py-2 rounded-xl bg-secondary/50 text-sm">
                      <p className="text-xs text-muted-foreground mb-0.5">
                        {format(new Date(m.createdAt), "MMM d, h:mm a")}
                      </p>
                      <p className="truncate">{m.text ?? (m.mediaType ? `[${m.mediaType}]` : "")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Starred messages */}
          {starredMessages.length > 0 && (
            <div className="px-3 mt-2">
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors"
                onClick={() => setShowStarred(v => !v)}
              >
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Star className="w-4 h-4" /> Starred
                  <span className="text-muted-foreground font-normal">· {starredMessages.length}</span>
                </div>
                {showStarred ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showStarred && (
                <div className="px-1 space-y-1 mt-1">
                  {starredMessages.map(m => (
                    <div key={m.id} className="px-3 py-2 rounded-xl bg-secondary/50 text-sm">
                      <p className="text-xs text-muted-foreground mb-0.5">{format(new Date(m.createdAt), "MMM d, h:mm a")}</p>
                      <p className="truncate">{m.text ?? (m.mediaType ? `[${m.mediaType}]` : "")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Leave / Delete */}
          <div className="px-4 mt-5 space-y-2">
            {!confirmLeave ? (
              <button
                onClick={() => setConfirmLeave(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors border border-destructive/20"
              >
                <LogOut className="w-4 h-4" /> Leave Group
              </button>
            ) : (
              <div className="rounded-xl border border-destructive/30 p-3 bg-destructive/5">
                <p className="text-sm text-center text-destructive font-medium mb-2">Leave this group?</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 rounded-full h-8" onClick={() => setConfirmLeave(false)}>Cancel</Button>
                  <Button variant="destructive" size="sm" className="flex-1 rounded-full h-8" onClick={onLeave}>Leave</Button>
                </div>
              </div>
            )}

            {group.isAdmin && (
              !confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete Group
                </button>
              ) : (
                <div className="rounded-xl border border-destructive/30 p-3 bg-destructive/5">
                  <p className="text-sm text-center text-destructive font-medium mb-1">Delete group for everyone?</p>
                  <p className="text-xs text-center text-muted-foreground mb-2">This cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 rounded-full h-8" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <Button variant="destructive" size="sm" className="flex-1 rounded-full h-8" onClick={onDelete}>Delete</Button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
