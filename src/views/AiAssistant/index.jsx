import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tree, Tabs, Button, Progress, Spin, Tag, message } from 'antd';
import {
  FileTextOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FolderOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import styles from './index.module.css';
import { getToken } from '@/utils';
import {
  getDocumentTree,
  selectiveIndex,
  removeIndexedDocs,
  getIndexedDocuments,
  getIndexStatus,
} from '@/apis/rag';

const STATUS_MAP = {
  1: { icon: <FileTextOutlined />, label: '富文本', color: 'blue' },
  3: { icon: <FileExcelOutlined />, label: '表格', color: 'green' },
  4: { icon: <FilePdfOutlined />, label: '文件', color: 'orange' },
};

// status=2 表示文件夹，无论是否有 children 都应视为文件夹节点
const isFolderNode = (node) => node.status === 2;

// 使用自增计数器遍历原始树，生成唯一的 key 并同步收集已索引节点的 key
const buildTreeDataAndIndexedKeys = (nodes) => {
  let counter = 0;
  const indexedKeys = [];

  const transform = (items) =>
    items.map((node) => {
      const uniqueKey = `_tn_${counter++}`;
      const isFolder = isFolderNode(node);
      const statusInfo = STATUS_MAP[node.status] || {};
      if (node.is_indexed) {
        indexedKeys.push(uniqueKey);
      }
      return {
        key: uniqueKey,
        title: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {!isFolder && statusInfo.icon}
            <span>{node.name || '未命名'}</span>
            {node.is_indexed && (
              <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                已索引
              </Tag>
            )}
          </span>
        ),
        icon: isFolder ? <FolderOutlined /> : statusInfo.icon,
        isLeaf: !isFolder,
        data: node,
        children: transform(node.children || []),
      };
    });

  const treeData = transform(nodes);
  return { treeData, indexedKeys };
};

const AiAssistant = () => {
  const navigate = useNavigate();

  // --- 对话相关 state ---
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

  // --- 知识库管理 state ---
  const [activeTab, setActiveTab] = useState('chat');
  const [treeData, setTreeData] = useState([]);
  const [checkedKeys, setCheckedKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [indexedDocs, setIndexedDocs] = useState([]);

  const messageListRef = useRef(null);
  const progressTimerRef = useRef(null);

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);

  // 滚动到底部
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  // 切换到知识库 tab 时加载数据
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

  // 轮询索引进度
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

  const handleTabChange = (key) => {
    setActiveTab(key);
    if (key === 'knowledge') {
      loadKnowledgeBase();
    }
  };

  // 在树中查找节点
  const findNode = (nodes, key) => {
    for (const n of nodes) {
      if (n.key === key) return n;
      if (n.children) {
        const found = findNode(n.children, key);
        if (found) return found;
      }
    }
    return null;
  };

  // 提交索引 -- 只发送叶子节点（文件）ID
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

  // 移除文档
  const handleRemove = async () => {
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

  // --- 发送问答 ---
  const handleSend = async () => {
    const question = inputValue.trim();
    if (!question) return;

    const questionId = Date.now();
    setMessages(prev => [...prev, { type: 'Q', content: question, id: questionId }]);
    setInputValue('');

    const answerId = Date.now() + 1;
    setMessages(prev => [...prev, {
      type: 'A', content: '', sources: [], isStreaming: true, id: answerId,
    }]);

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
              setMessages(prev => prev.map(m =>
                m.id === answerId ? { ...m, sources: data.documents } : m
              ));
            } else if (data.type === 'token') {
              setMessages(prev => prev.map(m =>
                m.id === answerId ? { ...m, content: m.content + data.content } : m
              ));
            } else if (data.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === answerId ? { ...m, isStreaming: false } : m
              ));
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === answerId
          ? { ...m, content: '获取答案失败，请检查网络后重试', isStreaming: false }
          : m
      ));
    }
  };

  // --- 知识库管理标签页内容 ---
  const renderKnowledgeTab = () => (
    <div className={styles.knowledgeContainer}>
      {loading ? (
        <div className={styles.loadingWrapper}>
          <Spin tip="加载中..." />
        </div>
      ) : (
        <>
          {indexing && progress && (
            <div className={styles.progressWrapper}>
              <Progress
                percent={progress.total ? Math.round((progress.processed + progress.skipped) / progress.total * 100) : 0}
                size="small"
                status="active"
              />
              <div className={styles.progressText}>
                {progress.message}
              </div>
            </div>
          )}

          <div className={styles.treeWrapper}>
            {treeData.length > 0 ? (
              <Tree
                checkable
                showIcon
                defaultExpandAll={false}
                defaultExpandedKeys={treeData.slice(0, 1).map(n => n.key)}
                checkedKeys={checkedKeys}
                onCheck={(keys) => setCheckedKeys(keys)}
                treeData={treeData}
                blockNode
                style={{ fontSize: 13 }}
              />
            ) : (
              <div className={styles.emptyText}>暂无文档</div>
            )}
          </div>

          <div className={styles.knowledgeActions}>
            <span className={styles.docCount}>
              已索引 {indexedDocs.length} 个文档
            </span>
            <Button
              type="primary"
              size="small"
              icon={<CloudUploadOutlined />}
              loading={indexing}
              disabled={checkedKeys.length === 0 || indexing}
              onClick={handleIndex}
            >
              索引选中
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={checkedKeys.length === 0 || indexing}
              onClick={handleRemove}
            >
              移除
            </Button>
          </div>
        </>
      )}
    </div>
  );

  // --- 对话标签页内容 ---
  const renderChatTab = () => (
    <>
      <div className={styles.messageList} ref={messageListRef}>
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
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          className={styles.input}
        />
        <button className={styles.sendButton} onClick={handleSend}>
          发送
        </button>
      </div>
    </>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/home')}>
          <ArrowLeftOutlined />
        </button>
        <span className={styles.headerTitle}>智能助手</span>
      </div>
      <div className={styles.body}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          centered
          size="small"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          items={[
            { key: 'chat', label: '对话', children: renderChatTab() },
            { key: 'knowledge', label: '知识库', children: renderKnowledgeTab() },
          ]}
          tabBarStyle={{
            padding: '0 16px',
            margin: 0,
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
};

export const MemoAiAssistant = React.memo(AiAssistant);
export default MemoAiAssistant;
