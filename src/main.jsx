import React from 'react'
import ReactDOM from 'react-dom/client'
import router from './router/index'
import { RouterProvider } from 'react-router-dom'
import { Provider } from 'react-redux'
import store from './store'
import 'normalize.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <Provider store={store}>
        <RouterProvider router={router}></RouterProvider>
    </Provider>
)
