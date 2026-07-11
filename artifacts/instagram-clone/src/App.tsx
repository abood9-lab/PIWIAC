import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Layout } from "@/components/layout";
import { SplashScreen, hasShownSplashThisSession, markSplashShown } from "@/components/splash-screen";
import NotFound from "@/pages/not-found";
import { decodeTheme, applyThemeExtras } from "@/lib/theme-config";
import { applyAccentColor, ACCENT_STORAGE_KEY } from "@/lib/accent-color";

import Login from "@/pages/login";
import Register from "@/pages/register";
import SetupProfile from "@/pages/setup-profile";
import Home from "@/pages/home";
import Explore from "@/pages/explore";
import Create from "@/pages/create";
import Profile from "@/pages/profile";
import Messages from "@/pages/messages";
import Notifications from "@/pages/notifications";
import PostDetail from "@/pages/post";
import Settings from "@/pages/settings";
import Reels from "@/pages/reels";
import SnapPage from "@/pages/snap";
import AIPage from "@/pages/ai";

function ThemeImporter() {
  const { setTheme, setAccentColor, setFontSize, setRadius, setDensity, setUiHue } = useTheme();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("theme");
    if (!code) return;
    const config = decodeTheme(code);
    if (!config) return;
    setTheme(config.mode);
    setAccentColor(config.accent);
    setFontSize(config.fontSize);
    setRadius(config.radius);
    setDensity(config.density);
    setUiHue(config.uiHue);
    const url = new URL(window.location.href);
    url.searchParams.delete("theme");
    window.history.replaceState({}, "", url.toString());
  }, []);
  return null;
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if (!user.profileCompleted) return <Redirect to="/setup-profile" />;
  return <Component {...rest} />;
}

function SetupRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if (user.profileCompleted) return <Redirect to="/" />;
  return <SetupProfile />;
}

function PublicRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Redirect to={user.profileCompleted ? "/" : "/setup-profile"} />;
  return <Component {...rest} />;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/login" component={() => <PublicRoute component={Login} />} />
        <Route path="/register" component={() => <PublicRoute component={Register} />} />
        <Route path="/setup-profile" component={SetupRoute} />
        <Route path="/" component={() => <ProtectedRoute component={Home} />} />
        <Route path="/explore" component={() => <ProtectedRoute component={Explore} />} />
        <Route path="/create" component={() => <ProtectedRoute component={Create} />} />
        <Route path="/messages" component={() => <ProtectedRoute component={Messages} />} />
        <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />
        <Route path="/profile/:username" component={() => <ProtectedRoute component={Profile} />} />
        <Route path="/post/:id" component={() => <ProtectedRoute component={PostDetail} />} />
        <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
        <Route path="/reels" component={() => <ProtectedRoute component={Reels} />} />
        <Route path="/snap" component={() => <ProtectedRoute component={SnapPage} />} />
        <Route path="/ai" component={() => <ProtectedRoute component={AIPage} />} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function App() {
  const [showSplash, setShowSplash] = useState(() => !hasShownSplashThisSession());

  return (
    <ThemeProvider defaultTheme="system" storageKey="pixlr-theme">
      <ThemeImporter />
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <TooltipProvider>
              <Router />
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </WouterRouter>
      </QueryClientProvider>
      {showSplash && (
        <SplashScreen
          onDone={() => {
            markSplashShown();
            setShowSplash(false);
          }}
        />
      )}
    </ThemeProvider>
  );
}

export default App;
