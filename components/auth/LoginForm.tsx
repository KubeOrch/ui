"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Eye, EyeOff } from "lucide-react";
import { InlineLoader, Loader } from "@/components/ui/loader";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/AuthStore";
import api from "@/lib/api";
import { getApiBaseUrl } from "@/lib/runtime-config";
import { useRouter } from "next/navigation";
import { ProviderIcon } from "@/components/auth/ProviderIcon";
import type { AuthMethodsResponse } from "@/lib/types/auth";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { setAuthDetails } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>("");
  const [authMethods, setAuthMethods] = useState<AuthMethodsResponse | null>(
    null
  );
  const [authMethodsLoading, setAuthMethodsLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    // Check for error from OAuth redirect
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(errorParam);
    }
  }, [searchParams]);

  useEffect(() => {
    api
      .get("/auth/methods")
      .then(res => {
        setAuthMethods(res.data);
      })
      .catch(() => {
        // Fallback: assume builtin auth is enabled if the endpoint fails
        setAuthMethods({
          builtin: { enabled: true, signupEnabled: true },
          providers: [],
        });
      })
      .finally(() => {
        setAuthMethodsLoading(false);
      });
  }, []);

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/login", data);
      const responseData = response.data;
      if (response.status === 200) {
        setAuthDetails(responseData.token, {
          email: responseData.user.email,
          id: responseData.user.id,
          name: responseData.user.name,
          role: responseData.user.role,
          avatarUrl: responseData.user.avatarUrl,
          createdAt: responseData.user.createdAt,
        });
      }
      router.push("/dashboard");
    } catch (error) {
      const message =
        error instanceof Error && "response" in error
          ? (error as { response?: { data?: { message?: string } } }).response
              ?.data?.message || "Login failed"
          : "Login failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = (providerName: string) => {
    window.location.href = `${getApiBaseUrl()}/auth/oauth/${providerName}/authorize`;
  };

  if (authMethodsLoading) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="flex items-center justify-center py-12">
          <Loader size="md" />
        </CardContent>
      </Card>
    );
  }

  const showBuiltin = authMethods?.builtin.enabled !== false;
  const providers = authMethods?.providers || [];
  const showDivider = showBuiltin && providers.length > 0;

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold text-center">
          Welcome back
        </CardTitle>
        <CardDescription className="text-center">
          {showBuiltin
            ? "Enter your credentials to access your account"
            : "Sign in to access your account"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            {error}
          </div>
        )}

        {/* OAuth provider buttons */}
        {providers.length > 0 && (
          <div className="space-y-2">
            {providers.map(provider => (
              <Button
                key={provider.name}
                variant="outline"
                className="w-full h-11"
                onClick={() => handleOAuthLogin(provider.name)}
              >
                <ProviderIcon
                  name={provider.icon || provider.name}
                  className="mr-2 h-4 w-4"
                />
                Continue with {provider.displayName}
              </Button>
            ))}
          </div>
        )}

        {/* Divider */}
        {showDivider && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
        )}

        {/* Builtin email/password form */}
        {showBuiltin && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="name@example.com"
                        disabled={isLoading}
                        className="h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          disabled={isLoading}
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          disabled={isLoading}
                        >
                          {showPassword ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-11"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <InlineLoader className="mr-2" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        {authMethods?.builtin.signupEnabled && (
          <div className="text-sm text-center text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-primary hover:underline font-medium"
            >
              Create account
            </Link>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
