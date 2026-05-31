import styles from './index.module.css';

export const ChatInput = () => {
  return (
    <div className={styles.container}>
      <button
        className={styles.messageButton}
        onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/ai-assistant`, '_blank')}
        title="智能助手"
      >
        💬
      </button>
    </div>
  );
};

export default ChatInput;
