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
import api from "@/lib/api";
import { getApiBaseUrl } from "@/lib/runtime-config";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ProviderIcon } from "@/components/auth/ProviderIcon";
import type { AuthMethodsResponse } from "@/lib/types/auth";

const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [authMethods, setAuthMethods] = useState<AuthMethodsResponse | null>(
    null
  );
  const [authMethodsLoading, setAuthMethodsLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const invite = searchParams.get("invite");
    if (invite) {
      setInviteCode(invite);
    }
  }, [searchParams]);

  useEffect(() => {
    api
      .get("/auth/methods")
      .then(res => {
        setAuthMethods(res.data);
      })
      .catch(() => {
        setAuthMethods({
          builtin: { enabled: true, signupEnabled: true },
          providers: [],
        });
      })
      .finally(() => {
        setAuthMethodsLoading(false);
      });
  }, []);

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    setError("");

    try {
      const payload = {
        ...data,
        inviteCode: inviteCode || undefined,
      };
      const response = await api.post("/auth/register", payload);
      if (response.status === 201) {
        toast.success("Registration successful! Please log in.");
        router.push("/login");
      }
    } catch (error) {
      const message =
        error instanceof Error && "response" in error
          ? (
              error as {
                response?: { data?: { message?: string; error?: string } };
              }
            ).response?.data?.message ||
            (
              error as {
                response?: { data?: { message?: string; error?: string } };
              }
            ).response?.data?.error ||
            "Registration failed"
          : "Registration failed";
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

  const signupEnabled = authMethods?.builtin.signupEnabled !== false;
  const builtinEnabled = authMethods?.builtin.enabled !== false;
  const showBuiltinForm = builtinEnabled && signupEnabled;
  const providers = authMethods?.providers || [];
  const showDivider = showBuiltinForm && providers.length > 0;

  // If both builtin signup and OAuth are unavailable, show a message
  if (!showBuiltinForm && providers.length === 0) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold text-center">
            Registration disabled
          </CardTitle>
          <CardDescription className="text-center">
            Account registration is currently unavailable. Please contact your
            administrator.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col space-y-4">
          <div className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary hover:underline font-medium"
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold text-center">
          Create an account
        </CardTitle>
        <CardDescription className="text-center">
          {showBuiltinForm
            ? "Enter your information to get started"
            : "Sign up using one of the options below"}
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

        {/* Builtin registration form */}
        {showBuiltinForm && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="John Doe"
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
                          placeholder="Create a password"
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

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Confirm your password"
                          disabled={isLoading}
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          disabled={isLoading}
                        >
                          {showConfirmPassword ? (
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

              {inviteCode && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Using invite code:{" "}
                    <span className="font-mono font-medium">{inviteCode}</span>
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <InlineLoader className="mr-2" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <div className="text-sm text-center text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-primary hover:underline font-medium"
          >
            Sign in
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
