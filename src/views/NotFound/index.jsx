import { useNavigate } from 'react-router-dom'
import { useEffect, useState, memo } from 'react'
import BG from '@/utils/BG'

const NotFound = () => {
    const navigate = useNavigate()
    const [time, setTime] = useState(5)
    /**
     * 对404页面进行重定向
     * @returns {void}
     */
    const replace = () => {
        setTimeout(() => {
            navigate('/home')
        }, 5000)
    }

    useEffect(() => {
        replace()
        const timer = setInterval(() => {
            setTime(time => time - 1)
        }, 1000)
        return () => clearInterval(timer)
    })
    return (
        <div style={{
            width: '100vw',
            height: '60vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        }}>
            <h1>404 Not Found</h1>
            <h2>该页面将在{time}秒后重定向至 /home </h2>
            <BG />
        </div>
    )
}

export const MemoNotFound = memo(NotFound)