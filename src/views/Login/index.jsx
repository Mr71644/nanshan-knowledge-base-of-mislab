import { memo, useEffect, useState, useRef } from "react";
import { Card, Form, Input, Button } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { fetchLogin } from "@/store/modules/user";
import { useNavigate } from "react-router-dom";
import { useMessage } from "@/hooks/useMessage";
import { LockOutlined, UserOutlined, MailOutlined, SafetyOutlined, CheckOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { getCaptcha } from "@/apis/captcha";
import { sendResetCode, resetPassword } from "@/apis/user";
import BG from "@/utils/BG";
import style from "./index.module.css";
import { showMessage } from "@/store/modules/message";

// 步骤指示器
const StepIndicator = ({ resetStep, resetSuccess }) => {
    const step1Done = resetStep >= 1;
    const step2Done = resetSuccess;

    return (
        <div className={style.stepIndicator}>
            {/* 步骤 1：验证邮箱 */}
            <div className={style.stepDot}>
                <div className={`${style.stepCircle} ${step1Done ? style.stepCircleDone : style.stepCircleActive}`}>
                    {step1Done ? <CheckOutlined /> : '1'}
                </div>
                <span className={`${style.stepLabel} ${step1Done ? style.stepLabelDone : style.stepLabelActive}`}>
                    验证邮箱
                </span>
            </div>
            <div className={`${style.stepLine} ${step1Done ? style.stepLineConnected : ''}`} />
            {/* 步骤 2：重置密码 */}
            <div className={style.stepDot}>
                <div className={`${style.stepCircle} ${step2Done ? style.stepCircleDone : (resetStep >= 1 ? style.stepCircleActive : '')}`}>
                    {step2Done ? <CheckOutlined /> : '2'}
                </div>
                <span className={`${style.stepLabel} ${step2Done ? style.stepLabelDone : (resetStep >= 1 ? style.stepLabelActive : '')}`}>
                    重置密码
                </span>
            </div>
        </div>
    );
};

const Login = () => {
    const { success, error, warn, contextHolder } = useMessage()
    const { message, type, visible } = useSelector(state => state.message)
    const [captchaImage, setCaptchaImage] = useState(null);
    const [mode, setMode] = useState('login');         // 'login' | 'reset'
    const [resetStep, setResetStep] = useState(0);     // 0=验证邮箱, 1=重置密码
    const [countdown, setCountdown] = useState(0);
    const [sendingCode, setSendingCode] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [codeSent, setCodeSent] = useState(false);
    const [resetSuccess, setResetSuccess] = useState(false);
    const timerRef = useRef(null);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [loginForm] = Form.useForm();
    const [resetForm] = Form.useForm();

    const captcha = async () => {
        try {
            const res = await getCaptcha()
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

    // ==================== 密码重置流程 ====================

    // 发送验证码
    const handleSendCode = async () => {
        try {
            const values = await resetForm.validateFields(['email']);
            setSendingCode(true);
            await sendResetCode(values.email);
            setCodeSent(true);
            success({ content: '验证码已发送，请查收邮箱（有效期5分钟）' });
            setCountdown(60);
            timerRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (e) {
            if (e.errorFields) return;
            error({
                content: e.response?.data?.message || e.message || '验证码发送失败，请稍后重试',
            })
        } finally {
            setSendingCode(false);
        }
    };

    // 步骤 1 → 步骤 2：校验验证码格式后进入密码设置
    const goToStep2 = async () => {
        try {
            await resetForm.validateFields(['email', 'code']);
            setResetStep(1);
        } catch (e) {
            // 表单校验失败，Ant Design 会自动展示错误
        }
    };

    // 步骤 2 → 步骤 1：返回修改邮箱或验证码
    const backToStep1 = () => {
        setResetStep(0);
    };

    // 提交重置密码
    const handleResetPassword = async (values) => {
        try {
            setResetting(true);
            await resetPassword(values);
            setResetSuccess(true);
            success({ content: '密码重置成功，即将返回登录页' });
            setTimeout(() => {
                switchMode('login');
            }, 2000);
        } catch (e) {
            error({
                content: e.response?.data?.message || e.message || '密码重置失败，请稍后重试',
            })
        } finally {
            setResetting(false);
        }
    };

    // 切换登录/重置模式，彻底清理状态
    const switchMode = (newMode) => {
        setMode(newMode);
        if (newMode === 'reset') {
            loginForm.resetFields();
            setResetStep(0);
            setCodeSent(false);
            setResetSuccess(false);
        } else {
            resetForm.resetFields();
            setResetStep(0);
            setCodeSent(false);
            setResetSuccess(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setCountdown(0);
            captcha();
        }
    };

    useEffect(() => {
        if (visible && message === '退出成功') {
            success({ content: message })
        } else if (visible && type === 'warn') {
            warn({ content: message })
        }
    }, [visible, message, type])

    useEffect(() => {
        captcha()
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }
    }, [])

    // ==================== 渲染 ====================

    return (
        <div>
            {contextHolder}
            <div className={style.login}>
                <Card className={style.loginCard}>
                    <div className={style.logo}>
                        <div className={style.logoTitle}>甘蔗育种中心</div>
                        <div className={style.logoSub}>ZhangLab · 广西大学农学院</div>
                    </div>

                    {/* ========== 登录模式 ========== */}
                    {mode === 'login' && (
                        <div className={style.formWrapper} key="login">
                            <Form form={loginForm} onFinish={onFinish} validateTrigger="onBlur">
                                <Form.Item
                                    name="username"
                                    rules={[{ required: true, message: "请输入账号" }]}
                                >
                                    <Input
                                        prefix={<UserOutlined />}
                                        size="large"
                                        placeholder="请输入账号"
                                    />
                                </Form.Item>
                                <Form.Item
                                    name="password"
                                    rules={[{ required: true, message: "请输入密码" }]}
                                >
                                    <Input.Password
                                        prefix={<LockOutlined />}
                                        size="large"
                                        placeholder="请输入密码"
                                    />
                                </Form.Item>
                                <Form.Item
                                    name='captcha'
                                    rules={[{ required: true, message: "请输入验证码" }]}
                                >
                                    <Input
                                        size="large"
                                        maxLength={4}
                                        placeholder="请输入验证码"
                                        suffix={
                                            captchaImage ? (
                                                <img src={captchaImage} alt="captcha" className={style.captchaSuffix} onClick={captcha} />
                                            ) : null
                                        }
                                    />
                                </Form.Item>
                                <Form.Item>
                                    <Button type="primary" htmlType="submit" size="large" block>
                                        登录
                                    </Button>
                                </Form.Item>
                            </Form>
                            <div className={style.switchLink}>
                                <span onClick={() => switchMode('reset')}>忘记密码？</span>
                            </div>
                        </div>
                    )}

                    {/* ========== 密码重置模式 ========== */}
                    {mode === 'reset' && (
                        <div className={style.formWrapper} key={`reset-step${resetStep}`}>
                            {/* 头部 */}
                            <div className={style.resetHeader}>
                                <div className={style.resetTitle}>重置密码</div>
                                <div className={style.resetSubtitle}>
                                    {resetStep === 0
                                        ? '请输入注册邮箱以接收验证码'
                                        : '请设置您的新密码'}
                                </div>
                            </div>

                            {/* 步骤指示器 */}
                            <StepIndicator resetStep={resetStep} resetSuccess={resetSuccess} />

                            <Form form={resetForm} onFinish={handleResetPassword} validateTrigger="onBlur">
                                {/* email & code 始终挂载以保留表单值，步骤二时隐藏 */}
                                <div style={{ display: resetStep === 0 ? 'block' : 'none' }}>
                                    <Form.Item
                                        name="email"
                                        rules={[
                                            { required: true, message: "请输入注册邮箱" },
                                            { type: 'email', message: "请输入有效的邮箱地址" },
                                        ]}
                                    >
                                        <Input
                                            prefix={<MailOutlined />}
                                            size="large"
                                            placeholder="请输入注册邮箱"
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        name="code"
                                        rules={[
                                            { required: true, message: "请输入验证码" },
                                            { pattern: /^\d{6}$/, message: "验证码为 6 位数字" },
                                        ]}
                                    >
                                        <Input
                                            prefix={<SafetyOutlined />}
                                            size="large"
                                            maxLength={6}
                                            placeholder="请输入6位验证码"
                                            suffix={
                                                <Button
                                                    type="link"
                                                    onClick={handleSendCode}
                                                    disabled={countdown > 0}
                                                    loading={sendingCode}
                                                    className={style.sendCodeSuffix}
                                                >
                                                    {countdown > 0 ? `${countdown}s` : codeSent ? '重新发送' : '发送验证码'}
                                                </Button>
                                            }
                                        />
                                    </Form.Item>

                                    <Form.Item>
                                        <Button type="primary" size="large" block onClick={goToStep2}>
                                            下一步
                                        </Button>
                                    </Form.Item>
                                </div>

                                {/* ======== 步骤 2：重置密码 ======== */}
                                <div style={{ display: resetStep >= 1 ? 'block' : 'none' }}>
                                        <Form.Item
                                            name="newPassword"
                                            rules={[
                                                { required: true, message: "请输入新密码" },
                                                { min: 6, message: "密码长度 6-20 位" },
                                                { max: 20, message: "密码长度 6-20 位" },
                                            ]}
                                        >
                                            <Input.Password
                                                prefix={<LockOutlined />}
                                                size="large"
                                                placeholder="请输入新密码（6-20位）"
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            name="confirmPassword"
                                            dependencies={['newPassword']}
                                            rules={[
                                                { required: true, message: "请确认新密码" },
                                                ({ getFieldValue }) => ({
                                                    validator(_, value) {
                                                        if (!value || getFieldValue('newPassword') === value) {
                                                            return Promise.resolve();
                                                        }
                                                        return Promise.reject(new Error('两次输入的密码不一致'));
                                                    },
                                                }),
                                            ]}
                                        >
                                            <Input.Password
                                                prefix={<LockOutlined />}
                                                size="large"
                                                placeholder="请确认新密码"
                                            />
                                        </Form.Item>

                                        <Form.Item>
                                            <Button type="primary" htmlType="submit" size="large" block loading={resetting}>
                                                {resetSuccess ? '✓ 重置成功' : '重置密码'}
                                            </Button>
                                        </Form.Item>
                                    </div>
                            </Form>

                            {/* 底部链接 */}
                            <div className={style.switchLink}>
                                {resetStep === 0 ? (
                                    <span onClick={() => switchMode('login')}>← 返回登录</span>
                                ) : (
                                    <span onClick={backToStep1}>
                                        <ArrowLeftOutlined style={{ marginRight: 4 }} />返回上一步
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </Card>
            </div>
            <BG />
        </div>
    );
};

export const MemoLogin = memo(Login);
