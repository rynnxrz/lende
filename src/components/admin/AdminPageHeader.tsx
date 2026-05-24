import { cn } from '@/lib/utils'

interface AdminPageHeaderProps {
    title: string
    description?: string
    action?: React.ReactNode
    className?: string
}

export function AdminPageHeader({ title, description, action, className }: AdminPageHeaderProps) {
    return (
        <div className={cn("flex items-center justify-between", className)}>
            <div>
                <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
                {description && (
                    <p className="text-muted-foreground mt-1">{description}</p>
                )}
            </div>
            {action && <div>{action}</div>}
        </div>
    )
}
