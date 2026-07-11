import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const theme = env.VITE_THEME || 'cqupt'

    return {
        plugins: [react()],
        resolve: {
            alias: [
                {
                    find: '@',
                    replacement: resolve(__dirname, './src')
                },
                {
                    find: '#theme',
                    replacement: resolve(__dirname, `src/theme/${theme}.js`)
                },
                {
                    find: '#theme-css',
                    replacement: resolve(__dirname, `src/theme/${theme}.css`)
                }
            ]
        },
        base: './',
        server: {
            proxy: {
                '/api': {
                    target: 'http://101.43.146.27/new-app/api',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, '')
                }
            }
        }
    }
})
