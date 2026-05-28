import { memo, useEffect, useState } from "react";
import { Card, Form, Input, Button } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { fetchLogin } from "@/store/modules/user";
import { useNavigate } from "react-router-dom";
import { useMessage } from "@/hooks/useMessage";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { getCaptcha } from "@/apis/captcha";
import { runes } from 'runes2';
import BG from "@/utils/BG";
import style from "./index.module.css";
import { showMessage } from "@/store/modules/message";

const Login = () => {
    const { success, error, warn, contextHolder } = useMessage()
    const { message, type, visible } = useSelector(state => state.message)
    const [captchaImage, setCaptchaImage] = useState(null);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const captcha = async () => {
        try {
            const res = await getCaptcha()
            // const blob = new Blob([res], { type: "image/png" });
            // const imageUrl = URL.createObjectURL(blob);
            setCaptchaImage(res.data.captchaImage);
        } catch (e) {
            error({
                content: e.response?.data?.message || '验证码获取失败，请检查网络',
            })
        }
    }

    const onFinish = async (values) => {
        try {
            await dispatch(fetchLogin(values));
            dispatch(showMessage({ message: '登录成功', type: 'success' }))
            navigate('/home')
        } catch (e) {
            error({
                content: e.message || '账号密码或验证码错误！'
            })
            captcha();
        }
    };

    useEffect(() => {
        if (visible && message === '退出成功') {
            success({
                content: message
            })
        } else if (visible && type === 'warn') {
            warn({
                content: message
            })
        }
    }, [visible, message, type])
    useEffect(() => {
        captcha()
    }, [])

    return (
        <div>
            {contextHolder}
            <div className={style.login}>
                <Card className={style.loginCard}>
                    <div className={style.logo}>甘蔗种植中心-ZhangLab</div>
                    <Form onFinish={onFinish} validateTrigger="onBlur">
                        <Form.Item
                            name="username"
                            rules={[
                                {
                                    required: true,
                                    message: "请输入账号",
                                },
                            ]}
                        >
                            <Input
                                prefix={<UserOutlined className="site-form-item-icon" />}
                                size="large"
                                placeholder="请输入账号"
                                className={style.logoInput}
                            />
                        </Form.Item>
                        <Form.Item
                            name="password"
                            rules={[
                                {
                                    required: true,
                                    message: "请输入密码",
                                },
                            ]}
                        >
                            <Input.Password
                                prefix={<LockOutlined className="site-form-item-icon" />}
                                size="large"
                                placeholder="请输入密码"
                                className={style.logoInput}
                            />
                        </Form.Item>
                        <Form.Item style={{
                            marginBottom: 0,
                        }}>
                            <Form.Item
                                name='captcha'
                                style={{
                                    display: 'inline-block',
                                    marginRight: '20px',
                                    width: 210
                                }}
                                rules={[
                                    {
                                        required: true,
                                        message: "请输入验证码",
                                    },
                                ]}
                            >
                                <Input
                                    count={{
                                        show: true,
                                        max: 4,
                                        strategy: (txt) => runes(txt).length,
                                        exceedFormatter: (txt, { max }) => runes(txt).slice(0, max).join('')
                                    }}
                                />
                            </Form.Item>
                            {captchaImage && <img src={captchaImage} alt="captcha" className={style.img} onClick={captcha} />}
                        </Form.Item>
                        <Form.Item>
                            <Button type="primary" htmlType="submit" size="large" block>
                                登录
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
            </div>
            <BG />
        </div>
    );
};

export const MemoLogin = memo(Login);
