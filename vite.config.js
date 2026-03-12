import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'

const isGithubActions = process.env.GITHUB_ACTIONS === 'true'
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = isGithubActions && repoName ? `/${repoName}/` : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
