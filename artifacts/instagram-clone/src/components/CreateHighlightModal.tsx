import { useState } from "react";
import { motion } from "framer-motion";
import { X, Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

async function apiReq(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("pixlr_token") ?? "";
  const r = await fetch(`${BASE_URL}api/${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

interface CreateHighlightModalProps {
  storyId: string;
  coverUrl?: string;
  onClose: () => void;
}

interface Highlight {
  id: string;
  name: string;
  coverUrl?: string | null;
  stories: Array<{ mediaUrl: string }>;
}

export function CreateHighlightModal({ storyId, coverUrl, onClose }: CreateHighlightModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(true);

  useState(() => {
    if (!user?.username) return;
    apiReq(`stories/highlights/user/${user.username}`)
      .then((data: Highlight[]) => setHighlights(data))
      .catch(() => {})
      .finally(() => setLoadingHighlights(false));
  });

  const handleAddToExisting = async (highlightId: string) => {
    try {
      await apiReq(`stories/highlights/${highlightId}/stories`, {
        method: "POST",
        body: JSON.stringify({ storyId }),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/stories/highlights/user/${user?.username}`] });
      toast({ title: "Added to highlight! ✨" });
      onClose();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const handleCreateNew = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiReq("stories/highlights", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), coverUrl: coverUrl ?? null, storyIds: [storyId] }),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/stories/highlights/user/${user?.username}`] });
      toast({ title: `Highlight "${newName}" created! ⭐` });
      onClose();
    } catch { toast({ title: "Failed to create", variant: "destructive" }); }
    finally { setCreating(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-black/80 flex items-end" onClick={onClose}>
      <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }} transition={{ type: "spring", damping: 25 }}
        className="w-full bg-zinc-900 rounded-t-3xl p-5 border-t border-white/10 max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-white font-bold text-lg">Add to Highlight</span>
          <button onClick={onClose}><X size={20} className="text-white/60" /></button>
        </div>

        <div className="overflow-y-auto flex-1 flex flex-col gap-2">
          {showNew ? (
            <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4 py-3">
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreateNew()}
                placeholder="Highlight name..." className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/40" />
              <button onClick={handleCreateNew} disabled={creating || !newName.trim()}
                className="bg-fuchsia-500 text-white text-xs font-bold rounded-xl px-3 py-1.5 disabled:opacity-50">
                {creating ? <Loader2 size={14} className="animate-spin" /> : "Create"}
              </button>
            </div>
          ) : (
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-3 bg-white/8 hover:bg-white/12 border border-dashed border-white/20 rounded-2xl px-4 py-3 transition-all">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                <Plus size={22} className="text-fuchsia-400" />
              </div>
              <span className="text-white text-sm font-semibold">New Highlight</span>
            </button>
          )}

          {loadingHighlights && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-white/40" />
            </div>
          )}

          {highlights.map((h) => (
            <button key={h.id} onClick={() => handleAddToExisting(h.id)}
              className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl px-4 py-3 transition-all">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 shrink-0">
                {h.stories[0]?.mediaUrl ? (
                  <img src={h.stories[0].mediaUrl} className="w-full h-full object-cover" alt={h.name} />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-fuchsia-500 to-indigo-500" />
                )}
              </div>
              <div className="text-left">
                <div className="text-white text-sm font-semibold">{h.name}</div>
                <div className="text-white/50 text-xs">{h.stories.length} stories</div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
