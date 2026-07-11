import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  Bot, Sparkles, Languages, Hash, UserRound, Wand2, BarChart2,
  BookOpen, Flame, MessageSquareReply, Send, Copy, Check,
  Zap, RefreshCw, Brain, PanelLeftClose, PanelLeftOpen,
  ChevronDown, ArrowUp, SquarePen, StopCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── API helper ─────────────────────────────────────────────── */
async function aiPost<T>(ep: string, body: object, token: string): Promise<T> {
  const r = await fetch(`${BASE}/api/ai/${ep}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const e = (await r.json().catch(() => ({ error: "Request failed" }))) as { error?: string };
    throw new Error(e.error ?? "Request failed");
  }
  return r.json() as Promise<T>;
}

/* ─── Types ──────────────────────────────────────────────────── */
type ModelId = "groq" | "mistral" | "deepseek";
interface ModelInfo { id: ModelId; label: string; available: boolean }
interface ChatMsg { role: "user" | "assistant"; content: string; model?: string; modelId?: ModelId }

/* ─── Config ─────────────────────────────────────────────────── */
const MODEL_META: Record<ModelId, { short: string; color: string; ring: string; dot: string; glyph: string }> = {
  groq:     { short: "Groq",     color: "from-orange-500 to-amber-400",   ring: "ring-orange-400/40",  dot: "bg-orange-400",  glyph: "G" },
  mistral:  { short: "Mistral",  color: "from-sky-500 to-cyan-400",       ring: "ring-sky-400/40",     dot: "bg-sky-400",     glyph: "M" },
  deepseek: { short: "DeepSeek", color: "from-violet-500 to-purple-400",  ring: "ring-violet-400/40",  dot: "bg-violet-400",  glyph: "D" },
};

const TOOLS = [
  { id: "chat",      label: "Chat",        icon: Bot,                hint: "Multi-turn AI conversation" },
  { id: "compare",   label: "Compare",     icon: Zap,                hint: "All 3 models side by side" },
  { id: "caption",   label: "Caption",     icon: Sparkles,           hint: "Instagram-ready captions" },
  { id: "hashtags",  label: "Hashtags",    icon: Hash,               hint: "Trending hashtag generator" },
  { id: "bio",       label: "Bio",         icon: UserRound,          hint: "Profile bio writer" },
  { id: "translate", label: "Translate",   icon: Languages,          hint: "Translate to any language" },
  { id: "improve",   label: "Improve",     icon: Wand2,              hint: "Rewrite & polish your text" },
  { id: "sentiment", label: "Sentiment",   icon: BarChart2,          hint: "Tone & emotion analysis" },
  { id: "story",     label: "Story",       icon: BookOpen,           hint: "Creative story generator" },
  { id: "roast",     label: "Roast",       icon: Flame,              hint: "Fun roast generator" },
  { id: "reply",     label: "Replies",     icon: MessageSquareReply, hint: "Smart reply suggestions" },
] as const;
type ToolId = (typeof TOOLS)[number]["id"];

/* ─── Micro components ───────────────────────────────────────── */
function CopyBtn({ text, className }: { text: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      className={cn("p-1.5 rounded-lg hover:bg-white/10 text-current opacity-60 hover:opacity-100 transition-all", className)}
    >
      {ok ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function ModelBadge({ id, label, size = "sm" }: { id: ModelId; label?: string; size?: "xs" | "sm" }) {
  const m = MODEL_META[id];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full font-medium border border-white/10",
      size === "xs" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1",
      `bg-gradient-to-r ${m.color} bg-clip-text text-transparent`,
    )}>
      <span className={cn("rounded-full shrink-0", m.dot, size === "xs" ? "w-1.5 h-1.5" : "w-2 h-2")} />
      {label ?? m.short}
    </span>
  );
}

function ThinkingDots() {
  return (
    <span className="flex items-center gap-1 h-5">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

function ResultBox({ text, modelId, modelLabel, label }: { text: string; modelId?: ModelId; modelLabel?: string; label?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-4 space-y-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {label && <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</span>}
          {modelId && <ModelBadge id={modelId} label={modelLabel} />}
        </div>
        <CopyBtn text={text} />
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{text}</p>
    </motion.div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      "px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all",
      active ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
    )}>
      {children}
    </button>
  );
}

/* ─── Model selector bar ─────────────────────────────────────── */
function ModelSelector({ value, onChange, models }: { value: ModelId; onChange: (m: ModelId) => void; models: ModelInfo[] }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {models.map(m => {
        const meta = MODEL_META[m.id];
        const active = value === m.id;
        return (
          <button key={m.id} onClick={() => m.available && onChange(m.id)} disabled={!m.available}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all",
              active
                ? `bg-gradient-to-r ${meta.color} text-white border-transparent shadow-md ring-2 ${meta.ring}`
                : "border-border text-muted-foreground hover:border-foreground/20 hover:bg-muted/40",
              !m.available && "opacity-30 cursor-not-allowed",
            )}
          >
            <span className={cn("w-2 h-2 rounded-full shrink-0", m.available ? meta.dot : "bg-muted-foreground")} />
            {meta.short}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   CHAT
──────────────────────────────────────────────────────────────── */
const CHAT_SUGGESTIONS = [
  "What can you help me with?",
  "Write a creative Instagram bio for a photographer",
  "Explain quantum computing in simple terms",
  "Give me 5 unique content ideas for my travel page",
];

function ChatPanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [model, setModel] = useState<ModelId>("groq");
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const mut = useMutation({
    mutationFn: (history: { role: string; content: string }[]) =>
      aiPost<{ reply: string; model: string }>("chat", { model, messages: history }, token),
    onSuccess: (d) => setMsgs(p => [...p, { role: "assistant", content: d.reply, model: d.model, modelId: model }]),
  });

  const send = useCallback((text?: string) => {
    const val = (text ?? input).trim();
    if (!val || mut.isPending) return;
    const next: ChatMsg[] = [...msgs, { role: "user", content: val }];
    setMsgs(next);
    setInput("");
    mut.mutate(next.map(m => ({ role: m.role, content: m.content })));
  }, [input, msgs, mut, model]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, mut.isPending]);

  const autoResize = () => {
    if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 160) + "px"; }
  };

  const empty = msgs.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Model bar */}
      <div className="px-4 pt-3 pb-2 border-b border-border/50">
        <ModelSelector value={model} onChange={setModel} models={models} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-5">
        <AnimatePresence>
          {empty && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full gap-8 pt-12">
              <div className="space-y-2 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center mx-auto shadow-lg shadow-violet-500/25">
                  <Brain className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">How can I help you?</h2>
                <p className="text-sm text-muted-foreground">Powered by Groq · Mistral · DeepSeek</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {CHAT_SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="text-left px-4 py-3 rounded-2xl border border-border text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground hover:bg-muted/30 transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={cn("flex gap-3 max-w-3xl", m.role === "user" ? "ml-auto flex-row-reverse" : "")}>
            {/* Avatar */}
            {m.role === "assistant" && m.modelId && (
              <div className={cn(
                "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-md bg-gradient-to-br",
                MODEL_META[m.modelId].color,
              )}>
                {MODEL_META[m.modelId].glyph}
              </div>
            )}
            <div className={cn("space-y-1", m.role === "user" ? "items-end flex flex-col" : "")}>
              {m.role === "assistant" && m.model && (
                <span className="text-[11px] text-muted-foreground ml-1">{m.model}</span>
              )}
              <div className={cn(
                "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm relative group",
                m.role === "user"
                  ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-tr-sm"
                  : "bg-card border border-border text-foreground rounded-tl-sm",
              )}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "assistant" && (
                  <div className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyBtn text={m.content} className="bg-card border border-border shadow-sm" />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {mut.isPending && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
            <div className={cn("shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br", MODEL_META[model].color)}>
              {MODEL_META[model].glyph}
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
              <ThinkingDots />
            </div>
          </motion.div>
        )}

        {mut.isError && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-xs text-destructive text-center py-2 bg-destructive/5 rounded-xl px-4">
            {mut.error?.message}
          </motion.p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border/50">
        {msgs.length > 0 && (
          <div className="flex justify-center mb-2">
            <button onClick={() => setMsgs([])}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-full hover:bg-muted/40">
              <SquarePen className="w-3.5 h-3.5" /> New chat
            </button>
          </div>
        )}
        <div className="relative flex items-end gap-2 bg-muted/40 border border-border rounded-2xl px-4 py-3 focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
          <textarea
            ref={taRef}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize(); }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message AI Studio…"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-muted-foreground min-h-[24px] max-h-40 leading-relaxed"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || mut.isPending}
            className={cn(
              "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all",
              input.trim() && !mut.isPending
                ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/25 hover:shadow-lg hover:shadow-violet-500/30 active:scale-95"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground/50 mt-2">AI can make mistakes. Verify important information.</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   COMPARE
──────────────────────────────────────────────────────────────── */
function ComparePanel({ token }: { token: string }) {
  const [prompt, setPrompt] = useState("");
  const [sys, setSys] = useState("");
  const [showSys, setShowSys] = useState(false);

  const mut = useMutation({
    mutationFn: () => aiPost<{ responses: { id: string; label: string; text: string; error?: string }[] }>(
      "compare", { prompt: prompt.trim(), systemPrompt: sys.trim() || undefined }, token,
    ),
  });

  return (
    <div className="flex flex-col h-full gap-0">
      <div className="px-4 py-4 border-b border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Same prompt — three minds answer simultaneously</p>
          <button onClick={() => setShowSys(p => !p)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showSys && "rotate-180")} />
            System prompt
          </button>
        </div>
        <AnimatePresence>
          {showSys && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <textarea
                value={sys} onChange={e => setSys(e.target.value)}
                placeholder="e.g. Respond like a pirate"
                rows={2}
                className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm outline-none resize-none focus:border-foreground/30 transition-colors"
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="relative flex items-end gap-2 bg-muted/40 border border-border rounded-2xl px-4 py-3 focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mut.mutate(); } }}
            placeholder="Enter a prompt to compare across all three models…" rows={2}
            className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-muted-foreground leading-relaxed"
          />
          <button onClick={() => mut.mutate()} disabled={!prompt.trim() || mut.isPending}
            className={cn(
              "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all",
              prompt.trim() && !mut.isPending
                ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/25"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}>
            {mut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!mut.data && !mut.isPending && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Zap className="w-10 h-10 opacity-20" />
            <p className="text-sm">Send a prompt to compare model responses</p>
          </div>
        )}
        {mut.isPending && (
          <div className="grid md:grid-cols-3 gap-3">
            {(["groq", "mistral", "deepseek"] as ModelId[]).map(id => (
              <div key={id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <ModelBadge id={id} />
                <div className="space-y-2">
                  {[100, 80, 90].map((w, i) => (
                    <div key={i} className="h-3 rounded-full bg-muted animate-pulse" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {mut.data && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid md:grid-cols-3 gap-3">
            {mut.data.responses.map(r => (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <ModelBadge id={r.id as ModelId} label={r.label} />
                  {!r.error && <CopyBtn text={r.text} />}
                </div>
                {r.error
                  ? <p className="text-xs text-destructive bg-destructive/5 rounded-xl p-3">{r.error}</p>
                  : <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.text}</p>
                }
              </div>
            ))}
          </motion.div>
        )}
        {mut.isError && <p className="text-sm text-destructive text-center">{mut.error?.message}</p>}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   GENERIC TOOL PANEL
──────────────────────────────────────────────────────────────── */
interface ToolField {
  key: string;
  label?: string;
  type: "textarea" | "input" | "pills";
  placeholder?: string;
  rows?: number;
  pills?: string[];
  value: string;
  onChange: (v: string) => void;
}

function GenericTool({
  icon: Icon, title, hint, models, token, fields, endpoint, bodyFn, resultFn, submitLabel,
}: {
  icon: React.ElementType;
  title: string;
  hint: string;
  models: ModelInfo[];
  token: string;
  fields: ToolField[];
  endpoint: string;
  bodyFn: (model: ModelId) => Record<string, unknown>;
  resultFn: (data: Record<string, unknown>, modelId: ModelId) => React.ReactNode;
  submitLabel: string;
}) {
  const [model, setModel] = useState<ModelId>("groq");
  const mut = useMutation({ mutationFn: () => aiPost<Record<string, unknown>>(endpoint, bodyFn(model), token) });

  const canSubmit = fields.filter(f => f.type !== "pills").every(f => f.value.trim());

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-border/50 space-y-3">
        <ModelSelector value={model} onChange={setModel} models={models} />
        {fields.map(f => (
          <div key={f.key} className="space-y-1.5">
            {f.label && <p className="text-xs font-medium text-muted-foreground">{f.label}</p>}
            {f.type === "textarea" && (
              <textarea value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                rows={f.rows ?? 3}
                className="w-full bg-muted/40 border border-border rounded-2xl px-4 py-3 text-sm outline-none resize-none focus:border-foreground/30 focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:text-muted-foreground leading-relaxed"
              />
            )}
            {f.type === "input" && (
              <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                className="w-full bg-muted/40 border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-foreground/30 focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:text-muted-foreground"
              />
            )}
            {f.type === "pills" && f.pills && (
              <div className="flex flex-wrap gap-2">
                {f.pills.map(p => <Pill key={p} active={f.value === p} onClick={() => f.onChange(p)}>{p}</Pill>)}
              </div>
            )}
          </div>
        ))}
        <button
          onClick={() => mut.mutate()}
          disabled={!canSubmit || mut.isPending}
          className={cn(
            "w-full py-2.5 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-2",
            canSubmit && !mut.isPending
              ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/30 active:scale-[0.99]"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {mut.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</> : <><Icon className="w-4 h-4" /> {submitLabel}</>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!mut.data && !mut.isPending && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Icon className="w-10 h-10 opacity-20" />
            <p className="text-sm text-center max-w-xs">{hint}</p>
          </div>
        )}
        {mut.isPending && (
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <ThinkingDots />
          </div>
        )}
        {mut.isError && (
          <p className="text-sm text-destructive bg-destructive/5 rounded-2xl px-4 py-3">{mut.error?.message}</p>
        )}
        <AnimatePresence>
          {mut.data && !mut.isPending && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {resultFn(mut.data, model)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   TOOL PANELS (using GenericTool)
──────────────────────────────────────────────────────────────── */
function CaptionPanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [prompt, setPrompt] = useState("");
  return (
    <GenericTool icon={Sparkles} title="Caption" hint="Describe your photo and get an Instagram-ready caption with hashtags."
      models={models} token={token} endpoint="caption"
      fields={[{ key: "prompt", placeholder: "e.g. Sunset on the beach with my best friends ✨", type: "textarea", rows: 3, value: prompt, onChange: setPrompt }]}
      bodyFn={m => ({ prompt: prompt.trim(), model: m })}
      resultFn={(d, mid) => <ResultBox text={d.caption as string} modelId={mid} modelLabel={d.model as string} />}
      submitLabel="Generate Caption"
    />
  );
}

function HashtagsPanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("20");
  const [copied, setCopied] = useState(false);
  const mut = useMutation({
    mutationFn: (model: ModelId) =>
      aiPost<{ hashtags: string[]; model: string }>("hashtags", { topic: topic.trim(), count: Number(count), model }, token),
  });
  const [model, setModel] = useState<ModelId>("groq");
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-border/50 space-y-3">
        <ModelSelector value={model} onChange={setModel} models={models} />
        <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. fitness motivation, street photography, coffee art"
          className="w-full bg-muted/40 border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-foreground/30 focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Count:</span>
          {["10", "20", "30"].map(n => <Pill key={n} active={count === n} onClick={() => setCount(n)}>{n} tags</Pill>)}
        </div>
        <button onClick={() => mut.mutate(model)} disabled={!topic.trim() || mut.isPending}
          className={cn("w-full py-2.5 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-2",
            topic.trim() && !mut.isPending
              ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20 hover:shadow-lg active:scale-[0.99]"
              : "bg-muted text-muted-foreground cursor-not-allowed")}>
          {mut.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</> : <><Hash className="w-4 h-4" /> Generate Hashtags</>}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!mut.data && !mut.isPending && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Hash className="w-10 h-10 opacity-20" />
            <p className="text-sm">Enter a niche or topic to generate trending hashtags</p>
          </div>
        )}
        {mut.isPending && <div className="flex justify-center py-8"><ThinkingDots /></div>}
        {mut.isError && <p className="text-sm text-destructive bg-destructive/5 rounded-2xl px-4 py-3">{mut.error?.message}</p>}
        <AnimatePresence>
          {mut.data && !mut.isPending && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <ModelBadge id={model} label={mut.data.model} />
                <button onClick={() => { navigator.clipboard.writeText(mut.data!.hashtags.join(" ")); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full border border-border hover:border-foreground/30">
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {mut.data.hashtags.map((h, i) => (
                  <motion.button key={i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => navigator.clipboard.writeText(h)}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted/50 border border-border hover:bg-gradient-to-r hover:from-violet-600 hover:to-fuchsia-600 hover:text-white hover:border-transparent transition-all">
                    {h}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BioPanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [desc, setDesc] = useState("");
  const [style, setStyle] = useState("casual");
  return (
    <GenericTool icon={UserRound} title="Bio" hint="Describe yourself and get a catchy 150-char Instagram bio."
      models={models} token={token} endpoint="bio"
      fields={[
        { key: "desc", placeholder: "e.g. Photographer & adventurer based in NYC. Love coffee, cats, and golden hour.", type: "textarea", rows: 3, value: desc, onChange: setDesc },
        { key: "style", label: "Style", type: "pills", pills: ["casual", "professional", "funny", "mysterious", "inspiring"], value: style, onChange: setStyle },
      ]}
      bodyFn={m => ({ description: desc.trim(), style, model: m })}
      resultFn={(d, mid) => <ResultBox text={d.bio as string} modelId={mid} modelLabel={d.model as string} />}
      submitLabel="Write My Bio"
    />
  );
}

function TranslatePanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("Arabic");
  const langs = ["Arabic", "English", "Spanish", "French", "German", "Japanese", "Chinese", "Russian", "Portuguese", "Italian", "Korean", "Turkish"];
  return (
    <GenericTool icon={Languages} title="Translate" hint="Translate any text into any language instantly."
      models={models} token={token} endpoint="translate"
      fields={[
        { key: "text", placeholder: "Enter text to translate…", type: "textarea", rows: 4, value: text, onChange: setText },
        { key: "lang", label: "Target language", type: "pills", pills: langs, value: lang, onChange: setLang },
      ]}
      bodyFn={m => ({ text: text.trim(), targetLanguage: lang, model: m })}
      resultFn={(d, mid) => <ResultBox text={d.translation as string} modelId={mid} modelLabel={d.model as string} />}
      submitLabel={`Translate to ${lang}`}
    />
  );
}

function ImprovePanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [text, setText] = useState("");
  const [tone, setTone] = useState("professional");
  return (
    <GenericTool icon={Wand2} title="Improve" hint="Paste any text and get a polished, improved version."
      models={models} token={token} endpoint="improve"
      fields={[
        { key: "text", placeholder: "Paste text to rewrite…", type: "textarea", rows: 5, value: text, onChange: setText },
        { key: "tone", label: "Tone", type: "pills", pills: ["professional", "casual", "formal", "friendly", "persuasive", "concise", "creative"], value: tone, onChange: setTone },
      ]}
      bodyFn={m => ({ text: text.trim(), tone, model: m })}
      resultFn={(d, mid) => <ResultBox text={d.improved as string} modelId={mid} modelLabel={d.model as string} />}
      submitLabel="Improve Text"
    />
  );
}

function SentimentPanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [text, setText] = useState("");
  const [model, setModel] = useState<ModelId>("deepseek");
  const mut = useMutation({
    mutationFn: () => aiPost<{ analysis: { sentiment: string; score: number; emotions: string[]; summary: string }; model: string }>(
      "sentiment", { text: text.trim(), model }, token,
    ),
  });

  const sentColor: Record<string, string> = { positive: "text-emerald-400", negative: "text-red-400", neutral: "text-amber-400", mixed: "text-sky-400" };
  const sentGrad: Record<string, string> = { positive: "from-emerald-500 to-teal-500", negative: "from-red-500 to-rose-500", neutral: "from-amber-500 to-orange-500", mixed: "from-sky-500 to-cyan-500" };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-border/50 space-y-3">
        <ModelSelector value={model} onChange={setModel} models={models} />
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="Paste a comment, caption, or message to analyze…" rows={4}
          className="w-full bg-muted/40 border border-border rounded-2xl px-4 py-3 text-sm outline-none resize-none focus:border-foreground/30 focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:text-muted-foreground"
        />
        <button onClick={() => mut.mutate()} disabled={!text.trim() || mut.isPending}
          className={cn("w-full py-2.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 transition-all",
            text.trim() && !mut.isPending ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20 hover:shadow-lg active:scale-[0.99]" : "bg-muted text-muted-foreground cursor-not-allowed")}>
          {mut.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analyzing…</> : <><BarChart2 className="w-4 h-4" /> Analyze Sentiment</>}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!mut.data && !mut.isPending && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <BarChart2 className="w-10 h-10 opacity-20" />
            <p className="text-sm">Detect emotions, tone, and sentiment score</p>
          </div>
        )}
        {mut.isPending && <div className="flex justify-center py-8"><ThinkingDots /></div>}
        {mut.isError && <p className="text-sm text-destructive">{mut.error?.message}</p>}
        <AnimatePresence>
          {mut.data && !mut.isPending && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Sentiment</p>
                    <p className={cn("text-3xl font-bold capitalize", sentColor[mut.data.analysis.sentiment] ?? "")}>{mut.data.analysis.sentiment}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground mb-1">Score</p>
                    <p className="text-2xl font-bold tabular-nums">{mut.data.analysis.score?.toFixed(2)}</p>
                  </div>
                </div>
                {/* Score bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-muted-foreground"><span>-1 Negative</span><span>0 Neutral</span><span>+1 Positive</span></div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 flex">
                      <div className="flex-1 border-r border-border/50" />
                    </div>
                    <motion.div
                      initial={{ width: "50%" }}
                      animate={{ width: `${(mut.data.analysis.score + 1) / 2 * 100}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={cn("h-full rounded-full bg-gradient-to-r", sentGrad[mut.data.analysis.sentiment] ?? "from-violet-500 to-fuchsia-500")}
                    />
                  </div>
                </div>
                {mut.data.analysis.emotions?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {mut.data.analysis.emotions.map((e, i) => (
                      <span key={i} className="text-xs capitalize px-2.5 py-1 rounded-full bg-muted/50 border border-border">{e}</span>
                    ))}
                  </div>
                )}
                <p className="text-sm text-muted-foreground border-t border-border pt-3">{mut.data.analysis.summary}</p>
                <ModelBadge id={model} label={mut.data.model} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StoryPanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("general");
  const [length, setLength] = useState("short");
  return (
    <GenericTool icon={BookOpen} title="Story" hint="Turn your idea into a compelling short story."
      models={models} token={token} endpoint="story"
      fields={[
        { key: "prompt", placeholder: "e.g. A detective who can talk to ghosts discovers a centuries-old mystery…", type: "textarea", rows: 3, value: prompt, onChange: setPrompt },
        { key: "genre", label: "Genre", type: "pills", pills: ["general", "romance", "thriller", "sci-fi", "fantasy", "horror", "comedy", "mystery"], value: genre, onChange: setGenre },
        { key: "length", label: "Length", type: "pills", pills: ["short", "medium", "long"], value: length, onChange: setLength },
      ]}
      bodyFn={m => ({ prompt: prompt.trim(), genre, length, model: m })}
      resultFn={(d, mid) => <ResultBox text={d.story as string} modelId={mid} modelLabel={d.model as string} />}
      submitLabel="Write Story"
    />
  );
}

function RoastPanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [subject, setSubject] = useState("");
  return (
    <GenericTool icon={Flame} title="Roast" hint="Get a playful, funny roast on any topic."
      models={models} token={token} endpoint="roast"
      fields={[{ key: "subject", placeholder: "e.g. my coding skills, Monday mornings, my pet cat…", type: "input", value: subject, onChange: setSubject }]}
      bodyFn={m => ({ subject: subject.trim(), model: m })}
      resultFn={(d, mid) => <ResultBox text={d.roast as string} modelId={mid} modelLabel={d.model as string} />}
      submitLabel="🔥 Roast It"
    />
  );
}

function ReplyPanel({ models, token }: { models: ModelInfo[]; token: string }) {
  const [message, setMessage] = useState("");
  const [model, setModel] = useState<ModelId>("groq");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const mut = useMutation({
    mutationFn: () => aiPost<{ suggestions: string[]; model: string }>("reply-suggestions", { message: message.trim(), model }, token),
  });
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-border/50 space-y-3">
        <ModelSelector value={model} onChange={setModel} models={models} />
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Paste a comment or message you want to reply to…" rows={3}
          className="w-full bg-muted/40 border border-border rounded-2xl px-4 py-3 text-sm outline-none resize-none focus:border-foreground/30 focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:text-muted-foreground"
        />
        <button onClick={() => mut.mutate()} disabled={!message.trim() || mut.isPending}
          className={cn("w-full py-2.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 transition-all",
            message.trim() && !mut.isPending ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20 hover:shadow-lg active:scale-[0.99]" : "bg-muted text-muted-foreground cursor-not-allowed")}>
          {mut.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Thinking…</> : <><MessageSquareReply className="w-4 h-4" /> Get Reply Suggestions</>}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!mut.data && !mut.isPending && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <MessageSquareReply className="w-10 h-10 opacity-20" />
            <p className="text-sm text-center">Get 4 reply suggestions in different tones</p>
          </div>
        )}
        {mut.isPending && <div className="flex justify-center py-8"><ThinkingDots /></div>}
        {mut.isError && <p className="text-sm text-destructive">{mut.error?.message}</p>}
        <AnimatePresence>
          {mut.data && !mut.isPending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <ModelBadge id={model} label={mut.data.model} />
              <div className="space-y-2 pt-1">
                {mut.data.suggestions.map((s, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                    className="flex items-start gap-3 bg-card border border-border rounded-2xl px-4 py-3 group hover:border-violet-500/30 hover:bg-violet-500/5 transition-all">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground mt-0.5">{i + 1}</span>
                    <p className="flex-1 text-sm">{s}</p>
                    <button onClick={() => { navigator.clipboard.writeText(s); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 2000); }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedIdx === i ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   MAIN PAGE
──────────────────────────────────────────────────────────────── */
export default function AIPage() {
  const { token } = useAuth();
  const [tool, setTool] = useState<ToolId>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: modelsData } = useQuery({
    queryKey: ["ai-models"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/ai/models`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Failed to load models: ${res.status}`);
      return res.json() as Promise<{ models: ModelInfo[] }>;
    },
    enabled: !!token,
  });

  const models: ModelInfo[] = modelsData?.models ?? [
    { id: "groq", label: "Groq (LLaMA 3.3 70B)", available: true },
    { id: "mistral", label: "Mistral Large", available: true },
    { id: "deepseek", label: "DeepSeek Chat", available: true },
  ];

  const toolInfo = TOOLS.find(t => t.id === tool)!;
  const ToolIcon = toolInfo.icon;

  function renderTool() {
    const p = { models, token: token! };
    switch (tool) {
      case "chat":      return <ChatPanel {...p} />;
      case "compare":   return <ComparePanel token={token!} />;
      case "caption":   return <CaptionPanel {...p} />;
      case "hashtags":  return <HashtagsPanel {...p} />;
      case "bio":       return <BioPanel {...p} />;
      case "translate": return <TranslatePanel {...p} />;
      case "improve":   return <ImprovePanel {...p} />;
      case "sentiment": return <SentimentPanel {...p} />;
      case "story":     return <StoryPanel {...p} />;
      case "roast":     return <RoastPanel {...p} />;
      case "reply":     return <ReplyPanel {...p} />;
    }
  }

  return (
    <div className="flex h-[calc(100dvh-0px)] md:h-[100dvh] overflow-hidden bg-background">

      {/* ── Left sidebar ─────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="hidden md:flex flex-col h-full bg-muted/30 border-r border-border overflow-hidden shrink-0"
          >
            {/* Brand */}
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border/50">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-md shadow-violet-500/25">
                <Brain className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm tracking-tight whitespace-nowrap">AI Studio</span>
            </div>

            {/* Tools */}
            <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
              {TOOLS.map(t => {
                const Icon = t.icon;
                const active = tool === t.id;
                return (
                  <button key={t.id} onClick={() => setTool(t.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left group",
                      active
                        ? "bg-gradient-to-r from-violet-600/15 to-fuchsia-600/10 text-foreground border border-violet-500/20"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", active && "text-violet-500")} />
                    <span className="truncate whitespace-nowrap">{t.label}</span>
                    {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
                  </button>
                );
              })}
            </nav>

            {/* Model status */}
            <div className="px-3 py-3 border-t border-border/50 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 mb-2">Models</p>
              {models.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5">
                  <span className={cn("w-1.5 h-1.5 rounded-full", m.available ? MODEL_META[m.id].dot : "bg-muted-foreground")} />
                  <span className="text-xs text-muted-foreground truncate">{MODEL_META[m.id].short}</span>
                  {m.available && <span className="ml-auto text-[10px] text-emerald-500">live</span>}
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm shrink-0">
          <button onClick={() => setSidebarOpen(p => !p)}
            className="hidden md:flex p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-2">
            <ToolIcon className="w-4 h-4 text-violet-500" />
            <span className="font-semibold text-sm">{toolInfo.label}</span>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block">— {toolInfo.hint}</span>

          {/* Mobile model status dots */}
          <div className="ml-auto flex items-center gap-1.5 md:hidden">
            {models.map(m => (
              <span key={m.id} className={cn("w-2 h-2 rounded-full", m.available ? MODEL_META[m.id].dot : "bg-muted")} title={m.label} />
            ))}
          </div>
        </div>

        {/* Mobile tool strip */}
        <div className="md:hidden flex overflow-x-auto gap-1 px-3 py-2 border-b border-border/50 scrollbar-none shrink-0">
          {TOOLS.map(t => {
            const Icon = t.icon;
            const active = tool === t.id;
            return (
              <button key={t.id} onClick={() => setTool(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-all",
                  active
                    ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Tool content */}
        <div className="flex-1 overflow-hidden min-h-0">
          <AnimatePresence mode="wait">
            <motion.div key={tool} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
              className="h-full overflow-hidden flex flex-col">
              {renderTool()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
