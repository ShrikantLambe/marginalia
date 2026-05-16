import { Suspense } from "react";
import { LeftRail } from "@/app/components/LeftRail";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={null}>
        <LeftRail />
      </Suspense>
      {/* Offset content by rail width on desktop, add bottom padding for mobile tab bar */}
      <div className="flex-1 md:ml-[220px] mb-14 md:mb-0 min-h-screen">
        {children}
      </div>
    </div>
  );
}

