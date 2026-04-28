import { StackHandler } from "@stackframe/stack";
import { stackServerApp } from "@/stack";

export default function Handler(props: unknown) {
  return (
    <StackHandler
      fullPage
      app={stackServerApp}
      // Stack passes a typed prop here; keeping `any` avoids a brittle generic
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      routeProps={props as any}
    />
  );
}
