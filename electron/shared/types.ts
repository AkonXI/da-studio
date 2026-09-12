export interface ElectronAPI {
  dataset: {
    list: () => Promise<any[]>
    create: (n: string, d: string, t: string, g: string) => Promise<any>
    update: (id: number, n: string, d: string, t: string, g: string) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  image: {
    upload: (did: number) => Promise<{ created: any[]; skipped: number; total: number }>
    list: (did: number) => Promise<any[]>
    listWithStatus: (did: number) => Promise<any[]>
    getPath: (iid: number) => Promise<string>
    getUrl: (iid: number) => Promise<string>
    delete: (id: number) => Promise<void>
  }
  annotation: {
    get: (iid: number) => Promise<any>
    save: (iid: number, shapes: string, meta: string) => Promise<void>
    skip: (iid: number) => Promise<void>
    export: (
      did: number,
      format: string
    ) => Promise<{ canceled: boolean; path?: string; count?: number }>
  }
  setShortcutState: (state: any) => void
  setShortcutBindings: (bindings: Record<string, string>) => void
  onPageChange: (page: string) => void
}
