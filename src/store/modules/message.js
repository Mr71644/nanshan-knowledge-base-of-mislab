// messageSlice.js
// 用于在全局展示一次性提示（与组件内部的 useMessage 配合使用）
import { createSlice } from '@reduxjs/toolkit';

const messageStore = createSlice({
  name: 'message',
  initialState: {
    message: '',
    type: '',
    visible: false
  },
  reducers: {
    // showMessage: 将 message 写入 state，常用于全局导航栏或布局组件读取并触发 antd 的 message
    showMessage(state, action) {
      state.message = action.payload.message;
      state.type = action.payload.type;
      state.visible = true;
    },
    hideMessage(state) {
      state.message = '';
      state.type = '';
      state.visible = false;
    }
  }
});

const messageReducer = messageStore.reducer

export const { showMessage, hideMessage } = messageStore.actions;
export default messageReducer