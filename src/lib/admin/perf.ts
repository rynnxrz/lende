export async function withServerTiming<T>(label: string, work: () => Promise<T>): Promise<T> {
    const start = Date.now()
    try {
        return await work()
    } finally {
        if (process.env.NODE_ENV !== 'production' || process.env.ADMIN_PERF_LOGS === '1') {
            console.info(`[admin-perf] ${label}: ${Date.now() - start}ms`)
        }
    }
}
