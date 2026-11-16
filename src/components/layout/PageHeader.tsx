import { cn } from "@/lib/utils";
import { EditableText } from "@/components/editable/EditableText";

interface PageHeaderProps {
  titlePath: string;
  subtitlePath?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  titlePath,
  subtitlePath,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-3 flex shrink-0 flex-col items-center gap-1 text-center",
        className
      )}
    >
      <div className="flex flex-col items-center gap-1">
        <EditableText
          path={titlePath}
          as="h1"
          block
          center
          className="text-2xl text-ink sm:text-3xl"
        />
        <span className="h-1 w-14 rounded-full bg-gradient-to-l from-[#2F3B67] via-[#10B7C6] to-[#6B2DBD]" />
        {subtitlePath && (
          <EditableText
            path={subtitlePath}
            as="p"
            block
            center
            className="text-sm text-muted-foreground"
          />
        )}
      </div>
      {action && <div className="mt-1 flex justify-center gap-2">{action}</div>}
    </div>
  );
}
