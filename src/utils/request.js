import axios from 'axios'
import { getToken, clearToken } from './token'
import store from '@/store'
import { clearUserInfo } from '@/store/modules/user'
import { showMessage } from '@/store/modules/message'
// axios 实例：统一封装项目内所有 HTTP 请求
// 注意：建议在部署或开发时改为使用环境变量（Vite 的 import.meta.env.VITE_API_BASE_URL）
const request = axios.create({
    // node node_modules/cors-anywhere/server.js
    // 解决跨域问题（可在本地开发时通过代理或 cors-anywhere 处理）
    // baseURL: 'http://localhost:8080/http://1.117.70.79:4529',
    // 生产/演示地址（在代码中硬编码，推荐替换为环境变量）
    baseURL: 'http://101.43.146.27/new-app/api',
})

// 添加请求拦截器
// 请求拦截器：统一添加 token（如果存在）
// 说明：后端期望 `Authorization: Bearer <token>`，token 存储策略见 `src/utils/token.js`
request.interceptors.request.use((config) => {
    const token = getToken()
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
}, (error) => {
    return Promise.reject(error)
})

// 添加响应拦截器
// 响应拦截器：
// - 对 2xx 响应统一返回 `response.data` 以简化调用处处理
// - 对 401 错误做统一处理：清理本地登录态、提示并跳转到登录页
request.interceptors.response.use((response) => {
    return response.data
}, (error) => {
    // 统一处理鉴权失败：服务端返回 401（未登录 / token 过期）
    if (error.response && error.response.status === 401) {
        // 清理 redux store 与 token 存储
        store.dispatch(clearUserInfo())
        clearToken()
        // 在全局 message reducer 中展示提示（组件内也常用 useMessage）
        store.dispatch(showMessage({ message: '未登录或登录已过期，请重新登录', type: 'warn' }))
        // 使用 hash 路由时直接设置 location.hash 跳转登录
        window.location.hash = '/login';
    }
    return Promise.reject(error)
})

export { request }