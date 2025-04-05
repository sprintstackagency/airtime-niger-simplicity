import React, { createContext, useContext, useState, useEffect } from "react";
import { User, UserRole } from "../types";
import { useToast } from "@/components/ui/use-toast";
import { supabase, debugAuth } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (userData: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { toast } = useToast();

  // Helper function to fetch user profile
  const fetchUserProfile = async (userId: string): Promise<User | null> => {
    try {
      console.log("Fetching profile for user:", userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error) {
        console.error("Failed to fetch user profile:", error);
        return null;
      }
      
      if (data) {
        console.log("Profile data fetched successfully:", data);
        const userWithProfile: User = {
          id: userId,
          email: session?.user?.email || '',
          name: data.name || '',
          role: data.role as UserRole,
          balance: data.balance || 0,
          createdAt: data.created_at,
        };
        setUser(userWithProfile);
        return userWithProfile;
      }
      return null;
    } catch (err) {
      console.error("Error fetching profile:", err);
      return null;
    }
  };

  // Check if user is authenticated on mount and setup listener for auth changes
  useEffect(() => {
    console.log("Setting up auth state listener");
    let isMounted = true;
    setIsLoading(true);
    
    // Separate function to handle session changes to avoid infinite loops
    const handleAuthChange = (currentSession: Session | null) => {
      if (!isMounted) return;
      
      console.log("Auth change handler called with session:", !!currentSession);
      setSession(currentSession);
      
      if (currentSession?.user) {
        // Use timeout to prevent potential recursion issues
        setTimeout(() => {
          if (isMounted) {
            fetchUserProfile(currentSession.user.id)
              .catch(error => console.error("Error during profile fetch:", error))
              .finally(() => isMounted && setIsLoading(false));
          }
        }, 0);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    };
    
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        console.log("Auth state changed:", event, currentSession?.user?.id);
        handleAuthChange(currentSession);
        
        if (event === 'SIGNED_IN') {
          console.log("User successfully signed in");
          // Debug auth state
          debugAuth();
        }
      }
    );

    // Then check for existing session
    const checkSession = async () => {
      try {
        console.log("Checking for existing session");
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        console.log("Initial session check:", currentSession?.user?.id);
        
        handleAuthChange(currentSession);
        
        // Debug auth state
        debugAuth();
      } catch (err) {
        console.error("Session check error:", err);
        if (isMounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    };
    
    checkSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      console.log("Attempting login for:", email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Login error:", error);
        throw error;
      }
      
      console.log("Login successful, session:", data.session);
      
      // Setting session immediately to speed up UI updates
      setSession(data.session);
      
      // Fetching profile data immediately after successful login
      if (data.session?.user) {
        const profileData = await fetchUserProfile(data.session.user.id);
        if (!profileData) {
          throw new Error("Could not retrieve user profile after login");
        }
      }
      
      toast({
        title: "Login successful",
        description: `Welcome back!`,
      });
      
      // Debug auth state
      debugAuth();
    } catch (error: any) {
      console.error("Login failed:", error.message);
      toast({
        title: "Login failed",
        description: error.message || "Please check your credentials and try again",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
          },
        },
      });

      if (error) throw error;
      
      toast({
        title: "Registration successful",
        description: `Welcome to BigBSubz!`,
      });
    } catch (error: any) {
      console.error("Registration error in context:", error);
      toast({
        title: "Registration failed",
        description: error.message || "Please try again with a different email",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
    } catch (error: any) {
      toast({
        title: "Logout failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const updateUserProfile = async (userData: Partial<User>) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: userData.name,
        })
        .eq('id', user.id);
      
      if (error) throw error;
      
      setUser(prev => prev ? { ...prev, ...userData } : null);
      
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  console.log("Auth context state:", { 
    isAuthenticated: !!user && !!session, 
    isLoading, 
    user,
    sessionExists: !!session
  });

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user && !!session,
        login,
        register,
        logout,
        updateUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
