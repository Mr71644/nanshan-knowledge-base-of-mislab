import React, { useState, useRef, useEffect } from 'react';
import styles from './index.module.css';
import axios from 'axios';
import { getToken } from '@/utils';

export const ChatInput = ({ userInfo }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [popoverVisible, setPopoverVisible] = useState(false);
  const messageListRef = useRef(null);
  const containerRef = useRef(null);
  const popoverRef = useRef(null);

  // 点击页面其他地方关闭弹窗
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        containerRef.current && 
        !containerRef.current.contains(e.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target)
      ) {
        setPopoverVisible(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // 滚动到底部
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const question = inputValue.trim();
    if (!question) {
      return;
    }

    // 添加问题到聊天记录
    setMessages(prev => [...prev, { type: 'Q', content: question }]);

    // 清空输入框
    setInputValue('');

    try{
      const token = getToken();
      const user_id = "1";
      const query = {
        // token,
        user_id,
        question
      };
      const response = await axios.post('http://10.92.191.37:8000/api/v1/ask', query, {
        'Content-Type':'application/json'
      });
      const answer = response.data.answer;
      setMessages(prev => [...prev, { type: 'A', content: answer }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { type: 'A', content: '获取答案失败，请检查网络' }]);
    }
  };

  return (
    <>
      <div className={styles.container} ref={containerRef}>
        <button 
          className={styles.messageButton} 
          onClick={() => setPopoverVisible(!popoverVisible)}
        >
          💬
        </button>
        {popoverVisible && (
          <div className={styles.popover} ref={popoverRef} type='default'>
            <div className={styles.popoverTitle}>
              <strong>智能助手</strong>
              <button 
                className={styles.closeButton} 
                onClick={() => setPopoverVisible(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.messageList} ref={messageListRef}>
              {messages.map((msg, index) => (
                <div  
                  key={index}  
                  className={`${styles.messageDiv} ${msg.type === 'Q' ? styles.question : styles.answer}`}
                >
                  <div className={styles.messageHeader}>
                    {msg.type === 'Q' ? `${userInfo?.username || '我'}:` : 'AI:'}
                  </div>
                  <div className={styles.messageContent}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className={styles.emptyMessage}>
                  你好！我是智能助手，有什么可以帮助你的吗？
                </div>
              )}
            </div>
            <div className={styles.inputContainer}>
              <input
                type="text"
                placeholder="请输入您的问题"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                className={styles.input}
              />
              <button 
                className={styles.sendButton}  
                onClick={handleSend}
              >
                发送
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ChatInput;