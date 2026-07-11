import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Camera, Check, ChevronRight, Globe, Hash, Sparkles, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadAvatar } from "@workspace/api-client-react";

const AVATAR_STYLES = [
  { id: "adventurer", label: "Adventurer" },
  { id: "avataaars", label: "Cartoon" },
  { id: "bottts", label: "Robot" },
  { id: "fun-emoji", label: "Emoji" },
  { id: "lorelei", label: "Lorelei" },
  { id: "micah", label: "Micah" },
  { id: "pixel-art", label: "Pixel" },
  { id: "open-peeps", label: "Peeps" },
  { id: "notionists", label: "Notion" },
  { id: "croodles", label: "Croodles" },
];

const INTERESTS = [
  { id: "photography", label: "📸 Photography" },
  { id: "travel", label: "✈️ Travel" },
  { id: "food", label: "🍕 Food" },
  { id: "art", label: "🎨 Art" },
  { id: "music", label: "🎵 Music" },
  { id: "gaming", label: "🎮 Gaming" },
  { id: "fitness", label: "💪 Fitness" },
  { id: "fashion", label: "👗 Fashion" },
  { id: "technology", label: "💻 Technology" },
  { id: "science", label: "🔬 Science" },
  { id: "books", label: "📚 Books" },
  { id: "movies", label: "🎬 Movies" },
  { id: "nature", label: "🌿 Nature" },
  { id: "sports", label: "⚽ Sports" },
  { id: "comedy", label: "😂 Comedy" },
  { id: "education", label: "🎓 Education" },
  { id: "business", label: "📈 Business" },
  { id: "health", label: "🏥 Health" },
  { id: "design", label: "✏️ Design" },
  { id: "cooking", label: "👨‍🍳 Cooking" },
  { id: "pets", label: "🐾 Pets" },
  { id: "anime", label: "🌸 Anime" },
  { id: "diy", label: "🔨 DIY" },
  { id: "beauty", label: "💄 Beauty" },
];

const GENDERS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "nonbinary", label: "Non-binary" },
  { id: "other", label: "Other" },
  { id: "prefer_not", label: "Prefer not to say" },
];

const TOTAL_STEPS = 3;

function dicebearUrl(style: string, seed: string) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

export default function SetupProfile() {
  const { user, token, updateUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const uploadAvatarMutation = useUploadAvatar();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [website, setWebsite] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  const [interests, setInterests] = useState<string[]>([]);

  const previewAvatarUrl =
    uploadedAvatarUrl ??
    (selectedStyle ? dicebearUrl(selectedStyle, user?.username ?? "user") : null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const res = await uploadAvatarMutation.mutateAsync({
          data: { data: reader.result as string, mimeType: file.type },
        });
        setUploadedAvatarUrl(res.url);
        setSelectedStyle(null);
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally {
        setUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleInterest = (id: string) => {
    setInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = {
        bio: bio.trim() || undefined,
        website: website.trim() || undefined,
        gender: gender || undefined,
        pronouns: pronouns.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        interests,
      };

      if (selectedStyle && !uploadedAvatarUrl) {
        body.avatarUrl = dicebearUrl(selectedStyle, user?.username ?? "user");
      }

      const res = await fetch("/api/users/complete-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save profile");
      }

      const updatedUser = await res.json();
      updateUser(updatedUser);
      toast({ title: "Welcome to Pixlr! 🎉" });
      setLocation("/");
    } catch (err: any) {
      toast({ title: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-4xl font-bold italic tracking-tighter mb-1">Pixlr</h1>
          <p className="text-muted-foreground text-sm">Let's set up your profile</p>
        </div>

        <div className="flex items-center gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-500",
                i + 1 <= step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="p-6 sm:p-8 space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold">Choose your avatar</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pick a generated avatar or upload your own photo
                  </p>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-24 w-24 ring-4 ring-primary/20 ring-offset-2 ring-offset-background">
                      <AvatarImage src={previewAvatarUrl ?? undefined} />
                      <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                        {user.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {uploadedAvatarUrl && (
                      <button
                        onClick={() => setUploadedAvatarUrl(null)}
                        className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {previewAvatarUrl ? "Looking good! 🎉" : "No avatar selected yet"}
                  </p>
                </div>

                <div className="grid grid-cols-5 gap-2.5">
                  {AVATAR_STYLES.map((style) => {
                    const url = dicebearUrl(style.id, user.username);
                    const isSelected = selectedStyle === style.id && !uploadedAvatarUrl;
                    return (
                      <button
                        key={style.id}
                        onClick={() => { setSelectedStyle(style.id); setUploadedAvatarUrl(null); }}
                        className={cn(
                          "flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all hover:scale-105",
                          isSelected ? "border-primary bg-primary/5 scale-105" : "border-border hover:border-muted-foreground/40"
                        )}
                      >
                        <div className="relative w-12 h-12">
                          <img src={url} alt={style.label} className="w-12 h-12 rounded-lg" />
                          {isSelected && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate w-full text-center">{style.label}</span>
                      </button>
                    );
                  })}

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-xl border-2 border-dashed transition-all hover:scale-105",
                      uploadedAvatarUrl ? "border-primary bg-primary/5 scale-105" : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <div className="relative w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                      {uploadingPhoto ? (
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : uploadedAvatarUrl ? (
                        <img src={uploadedAvatarUrl} alt="uploaded" className="w-12 h-12 rounded-lg object-cover" />
                      ) : (
                        <Camera className="h-5 w-5 text-muted-foreground" />
                      )}
                      {uploadedAvatarUrl && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">Upload</span>
                  </button>
                </div>

                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => handleFinish()}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Skip for now
                  </button>
                  <Button onClick={() => setStep(2)} className="gap-2">
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="p-6 sm:p-8 space-y-5"
              >
                <div>
                  <h2 className="text-xl font-bold">Tell us about yourself</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    All fields are optional — fill in whatever you'd like to share
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => { if (e.target.value.length <= 150) setBio(e.target.value); }}
                    placeholder="Tell people about yourself..."
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">{bio.length}/150</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pronouns">Pronouns</Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="pronouns"
                        value={pronouns}
                        onChange={(e) => setPronouns(e.target.value)}
                        placeholder="e.g. he/him, she/her"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="website">Website</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="website"
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://yoursite.com"
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Gender</Label>
                  <div className="flex flex-wrap gap-2">
                    {GENDERS.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setGender(gender === g.id ? "" : g.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-sm border-2 transition-all",
                          gender === g.id
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border hover:border-muted-foreground/40"
                        )}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dob">Date of Birth <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                  <Button onClick={() => setStep(3)} className="gap-2">
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="p-6 sm:p-8 space-y-5"
              >
                <div>
                  <h2 className="text-xl font-bold">What are you into?</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Select your interests to personalise your experience
                    {interests.length > 0 && (
                      <span className="ml-1 font-medium text-primary">({interests.length} selected)</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto pr-1">
                  {INTERESTS.map((interest) => {
                    const active = interests.includes(interest.id);
                    return (
                      <button
                        key={interest.id}
                        onClick={() => toggleInterest(interest.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-sm border-2 transition-all",
                          active
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border hover:border-muted-foreground/40"
                        )}
                      >
                        {active && <Check className="inline h-3 w-3 mr-1" />}
                        {interest.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                  <Button onClick={handleFinish} disabled={saving} className="gap-2 px-6">
                    {saving ? (
                      <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Saving...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Finish Setup</>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          You can always update these details later in Settings
        </p>
      </div>
    </div>
  );
}
