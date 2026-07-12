import { StackHandler } from "@stackframe/stack";
import { stackServerApp } from "@/stack";

export default function Handler(props: unknown) {
  return (
    <StackHandler
      fullPage
      app={stackServerApp}
      // Stack passes a typed prop here; casting through unknown avoids a brittle generic
      routeProps={props as Record<string, unknown>}
    />
  );
}
