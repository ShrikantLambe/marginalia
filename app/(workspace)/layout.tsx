import { LeftRail } from "@/app/components/LeftRail";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <LeftRail />
      {/* Offset content by rail width on desktop, add bottom padding for mobile tab bar */}
      <div className="flex-1 md:ml-[60px] mb-14 md:mb-0 min-h-screen">
        {children}
      </div>
    </div>
  );
}
