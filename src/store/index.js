import { configureStore } from '@reduxjs/toolkit'

import userReducer from './modules/user'
import messageReducer from './modules/message'

// 全局 store：包含 `user`（token 管理）与 `message`（全局提示）两个 slice
// 注意：`src/main.jsx` 中必须在 `Provider` 包裹前引入 `src/utils/request.js`，
// 以便拦截器能正确访问 store（request.js 中直接 import store）。
const conF =  configureStore({
  reducer: {
    // 注册子模块
    user: userReducer,
    message: messageReducer
  }
})

export default conF