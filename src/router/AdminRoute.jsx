import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getToken } from '@/utils'
import { getUserInfo } from '@/apis/user'

const AdminRoute = ({ children }) => {
    const token = getToken()
    const [loading, setLoading] = useState(true)
    const [isAdministrator, setIsAdministrator] = useState(false)

    useEffect(() => {
        let cancelled = false

        const checkAdminPermission = async () => {
            if (!token) {
                setLoading(false)
                return
            }

            try {
                const res = await getUserInfo()
                if (!cancelled) {
                    setIsAdministrator(Boolean(res?.data?.isAdministrator))
                }
            } catch (e) {
                if (!cancelled) {
                    setIsAdministrator(false)
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        checkAdminPermission()

        return () => {
            cancelled = true
        }
    }, [token])

    if (!token) {
        return <Navigate to='/login' replace />
    }

    if (loading) {
        return null
    }

    if (!isAdministrator) {
        return <Navigate to='/home' replace />
    }

    return <>{children}</>
}

export default AdminRoute