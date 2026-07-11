"use client";

import { useUser } from "@stackframe/stack";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LandingRedirect() {
  const user = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/home");
  }, [user, router]);

  return null;
}
