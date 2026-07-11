import { useState, useMemo } from "react";
import { X, Search, Check, Send } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConvItem {
  id: string;
  otherUser: { id: string; username: string; fullName: string; avatarUrl?: string | null };
}

interface Props {
  conversations: ConvItem[];
  onForward: (conversationId: string) => Promise<void>;
  onClose: () => void;
}

export function ForwardModal({ conversations, onForward, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(
    () =>
      conversations.filter(
        c =>
          c.otherUser.username.toLowerCase().includes(search.toLowerCase()) ||
          c.otherUser.fullName.toLowerCase().includes(search.toLowerCase())
      ),
    [conversations, search]
  );

  const handleSend = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await onForward(selected);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "75vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="font-semibold text-sm">Forward Message</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="pl-9 h-9 rounded-full text-sm bg-secondary border-transparent"
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">No conversations found</div>
          )}
          {filtered.map(conv => (
            <button
              key={conv.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 w-full hover:bg-secondary/60 transition-colors text-left",
                selected === conv.id && "bg-secondary"
              )}
              onClick={() => setSelected(prev => (prev === conv.id ? null : conv.id))}
            >
              <div className="relative">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={conv.otherUser.avatarUrl || undefined} />
                  <AvatarFallback className="font-semibold">
                    {conv.otherUser.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {selected === conv.id && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-card">
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {conv.otherUser.fullName || conv.otherUser.username}
                </div>
                <div className="text-xs text-muted-foreground truncate">@{conv.otherUser.username}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Send button */}
        <div className="p-4 border-t border-border shrink-0">
          <Button
            onClick={handleSend}
            disabled={!selected || loading}
            className="w-full rounded-full gap-2"
          >
            <Send className="w-4 h-4" />
            {loading ? "Forwarding..." : "Forward"}
          </Button>
        </div>
      </div>
    </div>
  );
}
