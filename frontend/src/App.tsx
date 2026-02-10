import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleBasedRoute } from "@/components/auth/RoleBasedRoute";
import Overview from "./pages/Overview";
import Panels from "./pages/Panels";
import Anomalies from "./pages/Anomalies";
import Missions from "./pages/Missions";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* All authenticated users can access Overview */}
              <Route path="/" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
              {/* Panels & Anomalies: Admin and Operator only */}
              <Route path="/panels" element={
                <RoleBasedRoute allowedRoles={['admin', 'operator']}>
                  <Panels />
                </RoleBasedRoute>
              } />
              <Route path="/anomalies" element={
                <RoleBasedRoute allowedRoles={['admin', 'operator']}>
                  <Anomalies />
                </RoleBasedRoute>
              } />
              {/* Missions: All roles can view, but with different permissions */}
              <Route path="/missions" element={
                <RoleBasedRoute allowedRoles={['admin', 'operator', 'drone_team']}>
                  <Missions />
                </RoleBasedRoute>
              } />
              {/* Admin: Admin only */}
              <Route path="/admin" element={
                <RoleBasedRoute allowedRoles={['admin']}>
                  <Admin />
                </RoleBasedRoute>
              } />
              {/* Profile: All authenticated users */}
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
