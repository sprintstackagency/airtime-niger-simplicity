
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LoginForm from "@/components/auth/LoginForm";
import { useAuth } from "@/context/AuthContext";

const Login = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  
  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const redirectPath = user.role === "admin" ? "/admin" : "/dashboard";
      navigate(redirectPath, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-primary-soft-purple/20 to-transparent">
        <LoginForm />
      </main>
      <Footer />
    </div>
  );
};

export default Login;
