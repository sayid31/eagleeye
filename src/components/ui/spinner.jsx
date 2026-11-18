import { cn } from "cn"
import { Loader2Icon } from "lucide-react"
import { UI_COPY } from "@/copy/id/ui"

function Spinner({
  className,
  ...props
}) {
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label={UI_COPY.loading} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
