import React, { useRef, useEffect } from 'react';
import { FileTextOutlined, LinkOutlined } from '@ant-design/icons';
import styles from './ChatArea.module.css';

const extractFileId = (docId) => {
  const parts = docId.split('-');
  return parts[parts.length - 1];
};

const ChatArea = ({ messages, inputValue, onInputChange, onSend }) => {
  const messageListRef = useRef(null);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSourceClick = (src) => {
    const fileId = extractFileId(src.doc_id);
    const snippet = src.snippet ? src.snippet.slice(0, 80) : '';
    const url = `${window.location.origin}${window.location.pathname}#/preview?from=${fileId}&name=${encodeURIComponent(src.title)}&highlight=${encodeURIComponent(snippet)}&docType=${encodeURIComponent(src.doc_type || '')}`;
    window.open(url, '_blank');
  };

  return (
    <div className={styles.chatArea}>
      <div className={styles.messageList} ref={messageListRef}>
        <div className={styles.messageListInner}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.messageDiv} ${msg.type === 'Q' ? styles.question : styles.answer}`}
            >
              <div className={styles.messageHeader}>
                {msg.type === 'Q' ? '我:' : 'AI:'}
              </div>
              <div className={styles.messageContent}>
                {msg.content}
                {msg.type === 'A' && msg.isStreaming && (
                  <span className={styles.streamingCursor}>|</span>
                )}
              </div>
              {msg.type === 'A' && msg.sources?.length > 0 && !msg.isStreaming && (
                <div className={styles.sourcesContainer}>
                  <div className={styles.sourcesTitle}>来源文档：</div>
                  {msg.sources.map((src, i) => (
                    <div
                      key={i}
                      className={styles.sourceItem}
                      onClick={() => handleSourceClick(src)}
                    >
                      <FileTextOutlined style={{ fontSize: 12, color: '#1677ff', flexShrink: 0 }} />
                      <span className={styles.sourceName}>{src.title}</span>
                      <span className={styles.sourceType}>({src.doc_type})</span>
                      <span className={styles.sourceScore}>相关度: {(src.score * 100).toFixed(1)}%</span>
                      <LinkOutlined style={{ fontSize: 11, color: '#bbb', flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.inputWrap}>
        <div className={styles.inputContainer}>
          <input
            type="text"
            placeholder="请输入您的问题"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            className={styles.input}
          />
          <button className={styles.sendButton} onClick={onSend}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChatArea);
