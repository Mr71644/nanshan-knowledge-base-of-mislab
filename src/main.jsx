import '#theme-css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import router from './router/index'
import { RouterProvider } from 'react-router-dom'
import { Provider } from 'react-redux'
import store from './store'
import 'normalize.css'
import './styles/tokens.css'
import themeConfig from '#theme'

// Set document title and favicon from theme config
document.title = themeConfig.htmlTitle
const faviconLink = document.querySelector('link[rel="icon"]') || document.createElement('link')
faviconLink.rel = 'icon'
faviconLink.href = themeConfig.faviconPath
if (!document.querySelector('link[rel="icon"]')) {
    document.head.appendChild(faviconLink)
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <Provider store={store}>
        <RouterProvider router={router}></RouterProvider>
    </Provider>
)

// 移除首屏加载动画
const loader = document.getElementById('app-loading')
if (loader) {
    loader.classList.add('fade-out')
    setTimeout(() => loader.remove(), 350)
}
