import { createHashRouter, Navigate } from 'react-router-dom'
import { MemoHome } from '@/views/Home'
import { MemoNotFound } from '@/views/NotFound'
import { MemoFileList } from '@/views/FileList'
import { MemoLogin } from '@/views/Login'
import { MemoContent } from '@/views/Content'
import { MemoExcel } from '@/views/Excel'
import { MemoAddContent } from '@/views/AddContent'
import { MemoAddExcel } from '@/views/AddExcel'
import { MemoAdministrator } from '@/views/Administrator'
import { MemoManagement } from '@/views/Management'
import { MemoPreview } from '@/views/Preview'
import AdminRoute from './AdminRoute'

// 路由约定说明：
// - 使用 Hash 路由 (createHashRouter)，便于部署到静态服务或无需服务器 rewrite 的场景
// - 视图组件统一导出为 `Memo<ComponentName>`，路由处使用这些 Memo 版本以减少不必要的重渲染
const router = createHashRouter([
    {
        path: '/',
        element: <Navigate replace to='/home' />
    },
    {
        path: '/login',
        element: <MemoLogin />
    },
    {
        path: 'home',
        element: <MemoHome />,
        children: [
            {
                index: true,
                element: <MemoFileList />
            },
            {
                path: 'list/:id',
                element: <MemoFileList />
            }
        ]
    },
    {
        path: 'content/:folder/:id',
        element: <MemoContent />
    },
    {
        path: 'addContent/:folder',
        element: <MemoAddContent />
    },
    {
        path: 'excel/:folder/:id',
        element: <MemoExcel />
    },
    {
        path: 'addExcel/:folder',
        element: <MemoAddExcel />
    },
    {
        path: 'preview',
        element: <MemoPreview />
    },
    {
        path: 'administrator',
        element: (
            <AdminRoute>
                <MemoAdministrator />
            </AdminRoute>
        )
    },
    {
        path: 'management',
        element: (
            <AdminRoute>
                <MemoManagement />
            </AdminRoute>
        )
    },
    {
        path: '*',
        element: <MemoNotFound />
    }
])
export default router