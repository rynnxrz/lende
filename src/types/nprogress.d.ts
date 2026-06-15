declare module 'nprogress' {
    interface NProgressSettings {
        minimum?: number
        easing?: string
        speed?: number
        trickle?: boolean
        trickleRate?: number
        trickleSpeed?: number
        showSpinner?: boolean
        [key: string]: unknown
    }

    interface NProgressStatic {
        settings: NProgressSettings
        status: number | null
        configure(options: NProgressSettings): NProgressStatic
        start(): NProgressStatic
        done(force?: boolean): NProgressStatic
        set(n: number): NProgressStatic
        inc(amount?: number): NProgressStatic
        remove(): void
        isStarted(): boolean
        isRendered(): boolean
        getPositioningCSS(): string
    }

    const NProgress: NProgressStatic
    export default NProgress
}
