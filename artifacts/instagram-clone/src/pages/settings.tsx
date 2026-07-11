import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useUpdateMyProfile, useUploadAvatar, useCreatePost } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/components/theme-provider";
import { PRESET_COLORS, DEFAULT_ACCENT_HEX, UI_PALETTE_PRESETS } from "@/lib/accent-color";
import { cn } from "@/lib/utils";
import {
  type FontSize,
  type BorderRadius,
  type Density,
  type ThemeConfig,
  encodeTheme,
  decodeTheme,
} from "@/lib/theme-config";
import {
  User,
  Lock,
  Palette,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  Camera,
  Eye,
  EyeOff,
  AlertTriangle,
  Shield,
  RotateCcw,
  Check,
  Globe,
  Hash,
  Share2,
  Download,
  Copy,
  CheckCheck,
  Type,
  SquareDashedBottom,
  LayoutGrid,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SETTINGS_GENDERS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "nonbinary", label: "Non-binary" },
  { id: "other", label: "Other" },
  { id: "prefer_not", label: "Prefer not to say" },
];

const SETTINGS_INTERESTS = [
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

type Section = "profile" | "password" | "appearance" | "account";

const NAV_ITEMS: { id: Section; icon: React.ElementType; label: string; desc: string }[] = [
  { id: "profile", icon: User, label: "Edit Profile", desc: "Update name, username, and bio" },
  { id: "password", icon: Lock, label: "Password & Security", desc: "Change your password" },
  { id: "appearance", icon: Palette, label: "Appearance", desc: "Theme and display settings" },
  { id: "account", icon: Shield, label: "Account", desc: "Logout and account options" },
];

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function EditProfileSection() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(user?.fullName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [website, setWebsite] = useState(user?.website || "");
  const [pronouns, setPronouns] = useState(user?.pronouns || "");
  const [gender, setGender] = useState(user?.gender || "");
  const [dateOfBirth, setDateOfBirth] = useState(
    user?.dateOfBirth ? user.dateOfBirth.split("T")[0] : ""
  );
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);

  const updateProfileMutation = useUpdateMyProfile();
  const uploadAvatarMutation = useUploadAvatar();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max size is 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const uploadRes = await uploadAvatarMutation.mutateAsync({
          data: { data: reader.result as string, mimeType: file.type }
        });
        if (user) updateUser({ ...user, avatarUrl: uploadRes.url });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        toast({ title: "Photo updated successfully" });
      } catch {
        toast({ title: "Failed to update photo", variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleInterest = (id: string) => {
    setInterests((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updatedUser = await updateProfileMutation.mutateAsync({
        data: {
          fullName, username, bio,
          website: website || undefined,
          pronouns: pronouns || undefined,
          gender: gender || undefined,
          dateOfBirth: dateOfBirth || undefined,
          interests,
        } as any
      });
      updateUser(updatedUser);
      toast({ title: "Profile updated successfully" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Please try again";
      toast({ title: "Failed to update profile", description: msg, variant: "destructive" });
    }
  };

  if (!user) return null;

  return (
    <div>
      <SectionHeader title="Edit Profile" subtitle="Update your public profile information" />

      {/* Avatar */}
      <div className="flex items-center gap-4 p-4 bg-muted/40 rounded-xl mb-6 border border-border">
        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarImage src={user.avatarUrl || undefined} />
            <AvatarFallback className="text-xl font-bold bg-gradient-to-br from-purple-500 to-pink-500 text-white">
              {user.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {uploadAvatarMutation.isPending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Camera className="h-4 w-4 text-white" />}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{user.username}</div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadAvatarMutation.isPending}
            className="text-sm text-primary font-medium hover:underline"
          >
            {uploadAvatarMutation.isPending ? "Uploading..." : "Change profile photo"}
          </button>
        </div>
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="pl-7"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => {
              if (e.target.value.length <= 150) setBio(e.target.value);
            }}
            className="resize-none"
            rows={3}
            placeholder="Tell people about yourself..."
          />
          <p className="text-xs text-muted-foreground text-right">{bio.length} / 150</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
            {SETTINGS_GENDERS.map((g) => (
              <button
                key={g.id}
                type="button"
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
          <Label htmlFor="dob">Date of Birth <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
          <Input
            id="dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
          />
        </div>

        <div className="space-y-2">
          <Label>Interests {interests.length > 0 && <span className="text-primary font-normal">({interests.length} selected)</span>}</Label>
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto border border-border rounded-xl p-3">
            {SETTINGS_INTERESTS.map((interest) => {
              const active = interests.includes(interest.id);
              return (
                <button
                  key={interest.id}
                  type="button"
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
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={updateProfileMutation.isPending} className="px-8">
            {updateProfileMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function PasswordSection() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };

  const strength = passwordStrength(newPassword);
  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["", "bg-red-500", "bg-yellow-500", "bg-blue-500", "bg-green-500"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "At least 6 characters required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to change password");
      }
      toast({ title: "Password changed successfully" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Please try again";
      toast({ title: "Failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Password & Security" subtitle="Keep your account secure with a strong password" />
      <form onSubmit={handleSubmit} className="space-y-5 max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">Current Password</Label>
          <div className="relative">
            <Input
              id="currentPassword"
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="pr-10"
              required
            />
            <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="newPassword">New Password</Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="pr-10"
              required
            />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {newPassword && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= strength ? strengthColors[strength] : "bg-muted")} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{strengthLabels[strength]}</p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            required
            className={cn(confirmPassword && newPassword !== confirmPassword ? "border-red-500 focus-visible:ring-red-500" : "")}
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-500">Passwords don't match</p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={loading} className="px-8">
            {loading ? "Changing..." : "Change password"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function AppearanceSection() {
  const {
    theme, setTheme,
    accentColor, setAccentColor, resetAccentColor,
    fontSize, setFontSize,
    radius, setRadius,
    density, setDensity,
    uiHue, setUiHue,
  } = useTheme();
  const { toast } = useToast();

  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharingAsPost, setSharingAsPost] = useState(false);

  const createPostMutation = useCreatePost();

  const handleShareAsPost = async () => {
    setSharingAsPost(true);
    try {
      // Build a Placehold.co image URL that visually represents the accent color
      const hex = accentColor.replace("#", "");
      // Pick contrasting text color (simple luminance check)
      const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
      const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
      const textHex = lum > 0.5 ? "000000" : "ffffff";
      const mediaUrl = `https://placehold.co/1080x1080/${hex}/${textHex}?text=My+Pixlr+Theme`;

      const modeLabel = theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";
      const caption = `🎨 My Pixlr theme\n\nAccent: ${accentColor.toUpperCase()} · Mode: ${modeLabel} · Size: ${fontSize} · Corners: ${radius} · Density: ${density}\n\nCopy my theme code: ${encodeTheme(getCurrentConfig())}`;

      await createPostMutation.mutateAsync({ data: { mediaUrl, mediaType: "image", caption } });
      toast({ title: "Shared as post! 🎉", description: "Your theme is now in your feed." });
    } catch {
      toast({ title: "Failed to share", variant: "destructive" });
    } finally {
      setSharingAsPost(false);
    }
  };

  const themes = [
    { id: "light" as const, icon: Sun, label: "Light" },
    { id: "dark" as const, icon: Moon, label: "Dark" },
    { id: "system" as const, icon: Monitor, label: "System" },
  ];

  const fontSizes: { id: FontSize; label: string; preview: string }[] = [
    { id: "sm", label: "Small", preview: "Aa" },
    { id: "md", label: "Default", preview: "Aa" },
    { id: "lg", label: "Large", preview: "Aa" },
  ];

  const radiuses: { id: BorderRadius; label: string; className: string }[] = [
    { id: "sharp", label: "Sharp", className: "rounded-sm" },
    { id: "soft", label: "Soft", className: "rounded-xl" },
    { id: "round", label: "Round", className: "rounded-full" },
  ];

  const densities: { id: Density; label: string; desc: string }[] = [
    { id: "compact", label: "Compact", desc: "Less spacing, more content" },
    { id: "comfortable", label: "Comfortable", desc: "Relaxed, easier to read" },
  ];

  const isDefault = accentColor === DEFAULT_ACCENT_HEX;

  const getCurrentConfig = useCallback((): ThemeConfig => ({
    accent: accentColor,
    mode: theme,
    fontSize,
    radius,
    density,
    uiHue,
  }), [accentColor, theme, fontSize, radius, density, uiHue]);

  const handleCopyCode = async () => {
    const code = encodeTheme(getCurrentConfig());
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast({ title: "Theme code copied!" });
  };

  const handleCopyLink = async () => {
    const code = encodeTheme(getCurrentConfig());
    const url = `${window.location.origin}${window.location.pathname}?theme=${code}`;
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast({ title: "Share link copied!" });
  };

  const handleImport = () => {
    setImportError("");
    const code = importCode.trim();
    if (!code) return;
    const config = decodeTheme(code);
    if (!config) {
      setImportError("Invalid theme code. Please check and try again.");
      return;
    }
    setTheme(config.mode);
    setAccentColor(config.accent);
    setFontSize(config.fontSize);
    setRadius(config.radius);
    setDensity(config.density);
    setUiHue(config.uiHue);
    setImportCode("");
    toast({ title: "Theme applied!", description: "The shared theme has been loaded." });
  };

  return (
    <div className="space-y-8">
      <SectionHeader title="Appearance" subtitle="Customize how Pixlr looks — then share your style" />

      {/* Color Mode */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Color Mode</Label>
        <div className="grid grid-cols-3 gap-3">
          {themes.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={cn(
                "flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all",
                theme === id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/40 hover:bg-muted/40"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                id === "light" ? "bg-yellow-100 text-yellow-600" :
                id === "dark" ? "bg-slate-800 text-slate-200" :
                "bg-gradient-to-br from-yellow-100 to-slate-700 text-foreground"
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">{label}</span>
              {theme === id && <div className="w-2 h-2 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      {/* UI Color — full palette */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">UI Color</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tints the entire interface — background, cards, sidebar, and surfaces
            </p>
          </div>
          {uiHue !== null && (
            <button
              onClick={() => { setUiHue(null); toast({ title: "UI color reset" }); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>

        {/* UI palette mini-preview */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div
            className="p-3 flex gap-2 items-start"
            style={uiHue !== null ? { backgroundColor: `hsl(${uiHue} 10% 97%)` } : { backgroundColor: "hsl(var(--muted))" }}
          >
            <div
              className="w-16 h-full min-h-[60px] rounded-lg shrink-0"
              style={uiHue !== null ? { backgroundColor: `hsl(${uiHue} 12% 92%)` } : { backgroundColor: "hsl(var(--sidebar))" }}
            />
            <div className="flex-1 space-y-2">
              <div
                className="h-5 rounded-lg w-3/4"
                style={uiHue !== null ? { backgroundColor: `hsl(${uiHue} 10% 88%)` } : { backgroundColor: "hsl(var(--border))" }}
              />
              <div
                className="h-5 rounded-lg w-1/2"
                style={uiHue !== null ? { backgroundColor: `hsl(${uiHue} 10% 88%)` } : { backgroundColor: "hsl(var(--border))" }}
              />
              <button
                className="px-3 py-1 rounded-lg text-xs text-white font-medium"
                style={{ backgroundColor: accentColor }}
              >
                Follow
              </button>
            </div>
          </div>
          <div className="px-3 py-2 bg-muted/40 text-xs text-muted-foreground border-t border-border">
            {uiHue !== null
              ? `Hue ${uiHue}° — all surfaces tinted`
              : "Neutral (default black & white)"}
          </div>
        </div>

        {/* Named presets grid */}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {UI_PALETTE_PRESETS.map((preset) => {
            const isActive = uiHue === preset.hue;
            return (
              <button
                key={preset.name}
                onClick={() => { setUiHue(preset.hue); toast({ title: `${preset.name} UI applied` }); }}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all",
                  isActive
                    ? "border-foreground shadow-md scale-105"
                    : "border-transparent hover:border-border hover:scale-105"
                )}
              >
                <div
                  className="w-9 h-9 rounded-full border-2 border-black/10"
                  style={{ backgroundColor: preset.swatch }}
                >
                  {isActive && (
                    <div className="w-full h-full rounded-full flex items-center justify-center">
                      <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight text-center">{preset.name}</span>
              </button>
            );
          })}
        </div>

        {/* Hue slider */}
        {uiHue !== null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">Fine-tune hue</p>
              <span className="text-xs font-mono text-foreground">{uiHue}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={359}
              value={uiHue}
              onChange={(e) => setUiHue(Number(e.target.value))}
              className="w-full h-3 rounded-full cursor-pointer appearance-none"
              style={{
                background: `linear-gradient(to right, hsl(0,80%,55%), hsl(30,80%,55%), hsl(60,80%,55%), hsl(90,80%,55%), hsl(120,80%,55%), hsl(150,80%,55%), hsl(180,80%,55%), hsl(210,80%,55%), hsl(240,80%,55%), hsl(270,80%,55%), hsl(300,80%,55%), hsl(330,80%,55%), hsl(360,80%,55%))`,
              }}
            />
          </div>
        )}
      </div>

      {/* Accent Color */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">Accent Color</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Buttons, links, and highlights</p>
          </div>
          {!isDefault && (
            <button
              onClick={() => { resetAccentColor(); toast({ title: "Reset to default" }); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>

        {/* Live preview */}
        <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Preview</p>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: accentColor }}>
              Follow
            </button>
            <button className="px-4 py-1.5 rounded-lg text-sm font-semibold border-2" style={{ borderColor: accentColor, color: accentColor }}>
              Message
            </button>
            <span className="text-sm font-semibold" style={{ color: accentColor }}>View all comments</span>
            <div className="w-5 h-5 rounded-full" style={{ backgroundColor: accentColor }} />
          </div>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-6 gap-2">
          {PRESET_COLORS.map((preset) => {
            const isActive = accentColor.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.hex}
                onClick={() => { setAccentColor(preset.hex); toast({ title: `${preset.name} applied` }); }}
                title={preset.name}
                className={cn(
                  "relative w-full aspect-square rounded-xl transition-all hover:scale-110 active:scale-95 border-2",
                  isActive ? "border-foreground scale-110 shadow-lg" : "border-transparent"
                )}
                style={{ backgroundColor: preset.hex }}
              >
                {isActive && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-md" strokeWidth={3} />}
              </button>
            );
          })}
        </div>

        {/* Custom picker */}
        <div className="flex items-center gap-3">
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="sr-only" id="accent-color-picker" />
          <label htmlFor="accent-color-picker" className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors">
            <div className="w-7 h-7 rounded-lg shadow-sm border border-black/10 shrink-0" style={{ backgroundColor: accentColor }} />
            <span className="text-sm font-mono">{accentColor.toUpperCase()}</span>
            <span className="text-xs text-muted-foreground">Click to pick</span>
          </label>
        </div>
      </div>

      {/* Font Size */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-semibold">Font Size</Label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {fontSizes.map(({ id, label, preview }) => (
            <button
              key={id}
              onClick={() => setFontSize(id)}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                fontSize === id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/40 hover:bg-muted/40"
              )}
            >
              <span
                className={cn("font-semibold text-foreground", id === "sm" ? "text-base" : id === "md" ? "text-xl" : "text-2xl")}
              >
                {preview}
              </span>
              <span className="text-xs text-muted-foreground">{label}</span>
              {fontSize === id && <div className="w-2 h-2 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      {/* Border Radius */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <SquareDashedBottom className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-semibold">Corner Style</Label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {radiuses.map(({ id, label, className }) => (
            <button
              key={id}
              onClick={() => setRadius(id)}
              className={cn(
                "flex flex-col items-center gap-2.5 p-4 border-2 transition-all rounded-xl",
                radius === id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/40 hover:bg-muted/40"
              )}
            >
              <div
                className={cn("w-10 h-10 border-2 border-current", className, radius === id ? "border-primary" : "border-muted-foreground/40")}
              />
              <span className="text-xs text-muted-foreground">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Density */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-semibold">Display Density</Label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {densities.map(({ id, label, desc }) => (
            <button
              key={id}
              onClick={() => setDensity(id)}
              className={cn(
                "flex flex-col items-start gap-1 p-4 rounded-xl border-2 transition-all text-left",
                density === id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/40 hover:bg-muted/40"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-medium">{label}</span>
                {density === id && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <span className="text-xs text-muted-foreground">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Share Theme */}
      <div className="space-y-4 pt-2 border-t border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-semibold">Share Your Theme</Label>
          </div>
          <p className="text-xs text-muted-foreground">Export your current color + style settings so others can apply them instantly</p>
        </div>

        {/* Live mini-preview of current theme */}
        <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
          <div className="flex-1 min-w-0 text-xs text-muted-foreground space-y-0.5">
            <div><span className="font-medium text-foreground">Accent:</span> {accentColor.toUpperCase()}</div>
            <div>
              <span className="font-medium text-foreground">Mode:</span> {theme} ·{" "}
              <span className="font-medium text-foreground">Size:</span> {fontSize} ·{" "}
              <span className="font-medium text-foreground">Corners:</span> {radius} ·{" "}
              <span className="font-medium text-foreground">Density:</span> {density}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 gap-2" onClick={handleCopyCode}>
            {copiedCode ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copiedCode ? "Copied!" : "Copy Code"}
          </Button>
          <Button type="button" variant="outline" className="flex-1 gap-2" onClick={handleCopyLink}>
            {copiedLink ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Share2 className="h-4 w-4" />}
            {copiedLink ? "Copied!" : "Share Link"}
          </Button>
        </div>

        {/* Share as post */}
        <div className="mt-3 p-4 rounded-2xl border border-border bg-gradient-to-br from-muted/40 to-muted/10">
          <div className="flex items-center gap-3 mb-3">
            {/* mini post preview */}
            <div className="w-14 h-14 rounded-xl shrink-0 shadow-md border border-white/10 overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}>
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-2xl">🎨</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Post your theme to the feed</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Accent <span className="font-mono font-medium" style={{ color: accentColor }}>{accentColor.toUpperCase()}</span>
                {" · "}{theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}
                {" · "}{radius}
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="w-full gap-2 text-sm font-semibold"
            style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }}
            disabled={sharingAsPost || createPostMutation.isPending}
            onClick={handleShareAsPost}
          >
            {sharingAsPost ? (
              <>
                <div className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Sharing…
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                Share as Post
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Import Theme */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-semibold">Import a Theme</Label>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={importCode}
            onChange={(e) => { setImportCode(e.target.value); setImportError(""); }}
            placeholder="Paste a theme code here..."
            className="flex-1 px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
          <Button type="button" onClick={handleImport} disabled={!importCode.trim()}>
            Apply
          </Button>
        </div>
        {importError && <p className="text-xs text-destructive">{importError}</p>}
        <p className="text-xs text-muted-foreground">
          Paste a code someone shared — it will instantly update your colors, font size, corners, and density.
        </p>
      </div>
    </div>
  );
}

function AccountSection() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  return (
    <div>
      <SectionHeader title="Account" subtitle="Manage your account settings" />
      <div className="space-y-3">
        <button
          onClick={() => setLogoutOpen(true)}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <LogOut className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Log out</div>
            <div className="text-xs text-muted-foreground">Sign out of your account</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>

        <div className="mt-6 p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Danger Zone</p>
              <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
                Deleting your account is permanent and cannot be undone. All your posts, followers, and data will be lost.
              </p>
              <Button variant="destructive" size="sm" className="mt-3" disabled>
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign in again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Settings() {
  const [section, setSection] = useState<Section>("profile");

  const renderSection = () => {
    switch (section) {
      case "profile": return <EditProfileSection />;
      case "password": return <PasswordSection />;
      case "appearance": return <AppearanceSection />;
      case "account": return <AccountSection />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full pt-4 pb-20 md:pb-8 sm:px-4">
      <h1 className="font-semibold text-xl px-4 sm:px-0 mb-4">Settings</h1>

      <div className="flex flex-col md:flex-row gap-0 md:gap-6">
        {/* Sidebar nav */}
        <nav className="md:w-56 shrink-0">
          <div className="md:sticky md:top-4 bg-card border border-border rounded-none md:rounded-xl overflow-hidden md:overflow-auto border-b-0 md:border-b">
            {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b border-border last:border-b-0",
                  section === id
                    ? "bg-primary/8 text-primary font-medium"
                    : "hover:bg-muted/60 text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", section === id ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm">{label}</span>
                {section === id && <div className="ml-auto w-1 h-4 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-card border border-border rounded-none md:rounded-xl p-5 sm:p-7">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
}
