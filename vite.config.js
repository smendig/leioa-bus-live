import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const isGithubActions = process.env.GITHUB_ACTIONS === 'true'
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = isGithubActions && repoName ? `/${repoName}/` : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [vue()],
})
