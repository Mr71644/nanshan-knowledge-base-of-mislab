import { message } from 'antd'
export const useMessage = () => {
    const [messageApi, contextHolder] = message.useMessage()

    const success = ({ content = '请求成功！', callBack, delayTime = 0, show = true } = {}) => {
        if (show)
        messageApi.open({
            type: 'success',
            content
        })
        if (callBack) setTimeout(callBack, delayTime)
    }

    const error = ({ content = '请求失败！', callBack } = {}) => {
        messageApi.open({
            type: 'error',
            content,
        })
        if (callBack) {
            callBack()
        }
    }

    const warn = ({ content = '请求警告', callBack } = {}) => {
        messageApi.open({
            type: 'warning',
            content,
        })
        if (callBack) {
            callBack()
        }
    }

    const loading = (content = '加载中...', duration = 0) => {
        return messageApi.open({
            type: 'loading',
            content,
            duration,
        })
    }

    return {
        success,
        error,
        warn,
        loading,
        contextHolder
    }
}