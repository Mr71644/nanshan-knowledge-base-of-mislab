import { createSlice } from '@reduxjs/toolkit'
import { request } from '../../utils'
import { setToken as _setToken, getToken, clearToken } from '@/utils'
const userStore = createSlice({
    name: 'user',
    // 数据状态
    initialState: {
        token: getToken() || ''
    },
    // 同步修改方法
    reducers: {
        setToken(state, action) {
            state.token = action.payload
            _setToken(action.payload)
        },
        clearUserInfo(state) {
            state.token = ''
            clearToken()
        }
    }
})

// 解构出actionCreater
const { setToken, clearUserInfo } = userStore.actions

// 获取reducer函数
const userReducer = userStore.reducer

// 异步方法封装（示例）：
// - fetchLogin 使用封装好的 `request` 发送登录请求
// - 请注意：这里仅给出入口，实际使用时应在组件中 dispatch 相应的 thunk 或调用 API
const fetchLogin = (loginForm) => {
    return async (dispatch) => {
        const res = await request.post('/user/login', loginForm)
        if (res.message) throw new Error(res.message);
        else dispatch(setToken(res.data.token))
    }
}

export { setToken, fetchLogin, clearUserInfo }
export default userReducer