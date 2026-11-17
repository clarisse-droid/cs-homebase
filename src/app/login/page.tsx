import { redirect } from "next/navigation";
import { isDemo } from "@/lib/server/context";
import { LoginForm } from "@/components/login-form";

export default function Login() {
  if (isDemo()) redirect("/");
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mb-4 text-sm muted">We&apos;ll email you a one-time sign-in link.</p>
        <LoginForm />
      </div>
    </div>
  );
}
