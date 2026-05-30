import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { message } from 'antd';
import styles from './index.module.css';
import { getToken } from '@/utils';
import {
  getDocumentTree,
  selectiveIndex,
  removeIndexedDocs,
  getIndexedDocuments,
  getIndexStatus,
} from '@/apis/rag';
import { buildTreeDataAndIndexedKeys, findNode } from './utils.jsx';
import AssistantSidebar from './AssistantSidebar';
import ChatArea from './ChatArea';

const AiAssistant = () => {
  const navigate = useNavigate();

  // --- Chat state ---
  const [messages, setMessages] = useState([
    {
      type: 'A',
      content: '你好！我是知识库智能助手，有什么可以帮你的吗？',
      sources: [],
      isStreaming: false,
      id: 0,
    },
  ]);
  const [inputValue, setInputValue] = useState('');

  // --- Sidebar state ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('conversations');

  // --- Knowledge base state ---
  const [treeData, setTreeData] = useState([]);
  const [checkedKeys, setCheckedKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [indexedDocs, setIndexedDocs] = useState([]);

  const progressTimerRef = useRef(null);

  // Cleanup polling timer
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);

  // Load knowledge base data on mount
  const loadKnowledgeBase = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, docsRes, statusRes] = await Promise.all([
        getDocumentTree(),
        getIndexedDocuments(),
        getIndexStatus(),
      ]);
      const { treeData, indexedKeys } = buildTreeDataAndIndexedKeys(treeRes.tree);
      setTreeData(treeData);
      setIndexedDocs(docsRes.documents);
      setCheckedKeys(indexedKeys);
      if (statusRes.indexing_in_progress && statusRes.current_progress) {
        setIndexing(true);
        setProgress(statusRes.current_progress);
        startPolling();
      }
    } catch (err) {
      message.error('加载知识库数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKnowledgeBase();
  }, [loadKnowledgeBase]);

  // Poll indexing progress
  const startPolling = () => {
    if (progressTimerRef.current) return;
    progressTimerRef.current = setInterval(async () => {
      try {
        const status = await getIndexStatus();
        setProgress(status.current_progress);
        if (!status.indexing_in_progress) {
          setIndexing(false);
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
          const [treeRes, docsRes] = await Promise.all([
            getDocumentTree(),
            getIndexedDocuments(),
          ]);
          const { treeData: newTreeData, indexedKeys } = buildTreeDataAndIndexedKeys(treeRes.tree);
          setTreeData(newTreeData);
          setIndexedDocs(docsRes.documents);
          setCheckedKeys(indexedKeys);
          message.success('索引完成');
        }
      } catch {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }, 2000);
  };

  // Index selected documents
  const handleIndex = async () => {
    if (checkedKeys.length === 0) {
      message.warning('请先选择要索引的文档或文件夹');
      return;
    }

    const leafIds = [];
    for (const key of checkedKeys) {
      const node = findNode(treeData, key);
      if (node && node.isLeaf && node.data) {
        leafIds.push(node.data.id);
      }
    }

    if (leafIds.length === 0) {
      message.warning('请选择至少一个文件');
      return;
    }

    try {
      setIndexing(true);
      await selectiveIndex(leafIds);
      message.success('开始索引...');
      startPolling();
    } catch (err) {
      message.error(err.message || '索引失败');
      setIndexing(false);
    }
  };

  // Remove selected indexed documents (from tree popover)
  const handleRemoveSelected = async () => {
    if (checkedKeys.length === 0) {
      message.warning('请先选择要移除的文档');
      return;
    }

    const docIds = [];
    for (const key of checkedKeys) {
      const node = findNode(treeData, key);
      if (node && node.data?.is_indexed && node.data?.doc_id) {
        docIds.push(node.data.doc_id);
      }
    }

    if (docIds.length === 0) {
      message.warning('选中的文档中没有已索引的');
      return;
    }

    try {
      const res = await removeIndexedDocs(docIds);
      message.success(`已移除 ${res.removed} 个文档`);
      loadKnowledgeBase();
      setCheckedKeys([]);
    } catch (err) {
      message.error(err.message || '移除失败');
    }
  };

  // Remove single document by doc_id
  const handleRemoveDoc = async (docId) => {
    try {
      const res = await removeIndexedDocs([docId]);
      message.success(`已移除 ${res.removed} 个文档`);
      loadKnowledgeBase();
    } catch (err) {
      message.error(err.message || '移除失败');
    }
  };

  // New conversation (frontend only)
  const handleNewConversation = () => {
    setMessages([
      {
        type: 'A',
        content: '你好！我是知识库智能助手，有什么可以帮你的吗？',
        sources: [],
        isStreaming: false,
        id: Date.now(),
      },
    ]);
    setInputValue('');
  };

  // SSE streaming query
  const handleSend = async () => {
    const question = inputValue.trim();
    if (!question) return;

    const questionId = Date.now();
    setMessages((prev) => [...prev, { type: 'Q', content: question, id: questionId }]);
    setInputValue('');

    const answerId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      { type: 'A', content: '', sources: [], isStreaming: true, id: answerId },
    ]);

    try {
      const token = getToken();
      const ragUrl = import.meta.env.VITE_RAG_API_URL;
      const response = await fetch(`${ragUrl}/api/v1/rag/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question, stream: true, top_k: 5 }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
              setMessages((prev) =>
                prev.map((m) => (m.id === answerId ? { ...m, sources: data.documents } : m))
              );
            } else if (data.type === 'token') {
              setMessages((prev) =>
                prev.map((m) => (m.id === answerId ? { ...m, content: m.content + data.content } : m))
              );
            } else if (data.type === 'done') {
              setMessages((prev) =>
                prev.map((m) => (m.id === answerId ? { ...m, isStreaming: false } : m))
              );
            }
          } catch {
            /* ignore parse errors */
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === answerId
            ? { ...m, content: '获取答案失败，请检查网络后重试', isStreaming: false }
            : m
        )
      );
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/home')}>
          <ArrowLeftOutlined />
        </button>
        <span className={styles.headerTitle}>智能助手</span>
      </div>
      <div className={styles.mainLayout}>
        <AssistantSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          onNewConversation={handleNewConversation}
          knowledgeTabProps={{
            indexedDocs,
            treeData,
            checkedKeys,
            loading,
            indexing,
            progress,
            onCheck: setCheckedKeys,
            onIndex: handleIndex,
            onRemoveSelected: handleRemoveSelected,
            onRemoveDoc: handleRemoveDoc,
          }}
        />
        <ChatArea
          messages={messages}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSend={handleSend}
        />
      </div>
    </div>
  );
};

export const MemoAiAssistant = React.memo(AiAssistant);
export default MemoAiAssistant;
