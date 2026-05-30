import React, { useState, useRef, useEffect } from 'react';
import styles from './index.module.css';
import { getToken } from '@/utils';

export const ChatInput = ({ userInfo }) => {
  const [messages, setMessages] = useState([
    {
      type: 'A',
      content: '你好！我是知识库智能助手，有什么可以帮你的吗？',
      sources: [],
      isStreaming: false,
      id: 0,
    }
  ]);
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
    if (!question) return;

    setMessages(prev => [...prev, { type: 'Q', content: question }]);
    setInputValue('');

    const answerId = Date.now();
    setMessages(prev => [...prev, {
      type: 'A',
      content: '',
      sources: [],
      isStreaming: true,
      id: answerId,
    }]);

    try {
      const token = getToken();
      const ragUrl = import.meta.env.VITE_RAG_API_URL;

      const response = await fetch(`${ragUrl}/api/v1/rag/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          question,
          stream: true,
          top_k: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'source') {
              setMessages(prev => prev.map(m =>
                m.id === answerId
                  ? { ...m, sources: data.documents }
                  : m
              ));
            } else if (data.type === 'token') {
              setMessages(prev => prev.map(m =>
                m.id === answerId
                  ? { ...m, content: m.content + data.content }
                  : m
              ));
            } else if (data.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === answerId
                  ? { ...m, isStreaming: false }
                  : m
              ));
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    } catch (error) {
      setMessages(prev => prev.map(m =>
        m.id === answerId
          ? { ...m, content: '获取答案失败，请检查网络后重试', isStreaming: false }
          : m
      ));
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
                    {msg.type === 'A' && msg.isStreaming && (
                      <span className={styles.streamingCursor}>|</span>
                    )}
                  </div>
                  {msg.type === 'A' && msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
                    <div className={styles.sourcesContainer}>
                      <div className={styles.sourcesTitle}>来源文档：</div>
                      {msg.sources.map((src, i) => (
                        <div key={i} className={styles.sourceItem}>
                          <span className={styles.sourceName}>{src.title}</span>
                          <span className={styles.sourceType}>({src.doc_type})</span>
                          <span className={styles.sourceScore}>相关度: {(src.score * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
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