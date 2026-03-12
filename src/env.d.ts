/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUS_API_URL: string
  readonly VITE_BUS_API_USER: string
  readonly VITE_BUS_API_PASSWORD: string
  readonly VITE_BUS_AES_KEY: string
  readonly VITE_BUS_AES_IV: string
  readonly VITE_BUS_GROUP_ID: string
  readonly VITE_BUS_LANG: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
