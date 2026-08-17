import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AudioSettingsProvider } from "@/contexts/AudioSettingsContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import Auth from "./pages/Auth";

import Discover from "./pages/Discover";
import JournalMemoryDetail from "./pages/JournalMemoryDetail";
import Playlist from "./pages/Playlist";
import WhatsNew from "./pages/WhatsNew";
import NotFound from "./pages/NotFound";
import MemoryMapHome from "./pages/MemoryMapHome";
import MemoriesLibrary from "./pages/MemoriesLibrary";
import Profile from "./pages/Profile";
import MemoryDetail from "./pages/MemoryDetail";
import Friends from "./pages/Friends";

const queryClient = new QueryClient();

// Keeps all app pages behind authentication while still letting the auth page load publicly.
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  // Preserves where the user was headed (e.g. a shared memory link) so Auth can send them back after login.
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* Providers wrap the route tree so auth state, audio preferences, and cached queries are shared everywhere. */}
        <AuthProvider>
          <AudioSettingsProvider>
            <ErrorBoundary>
              <Routes>
                <Route path="/welcome" element={<Navigate to="/auth" replace />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/" element={<ProtectedRoute><MemoryMapHome /></ProtectedRoute>} />
                <Route path="/discover/memories/:id" element={<ProtectedRoute><JournalMemoryDetail /></ProtectedRoute>} />
                <Route path="/journal" element={<ProtectedRoute><MemoriesLibrary /></ProtectedRoute>} />
                <Route path="/account" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
                <Route path="/journal/memories/:id" element={<ProtectedRoute><MemoryDetail /></ProtectedRoute>} />
                <Route path="/playlist" element={<ProtectedRoute><Playlist /></ProtectedRoute>} />
                <Route path="/whats-new" element={<ProtectedRoute><WhatsNew /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </AudioSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
