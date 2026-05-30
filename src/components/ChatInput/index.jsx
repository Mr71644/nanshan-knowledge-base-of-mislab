import { useNavigate } from 'react-router-dom';
import styles from './index.module.css';

export const ChatInput = () => {
  const navigate = useNavigate();
  return (
    <div className={styles.container}>
      <button
        className={styles.messageButton}
        onClick={() => navigate('/ai-assistant')}
        title="智能助手"
      >
        💬
      </button>
    </div>
  );
};

export default ChatInput;
