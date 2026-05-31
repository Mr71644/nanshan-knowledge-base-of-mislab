import { getToken } from '@/utils';

const RAG_BASE = import.meta.env.VITE_RAG_API_URL;

const ragFetch = async (path, options = {}) => {
  const token = getToken();
  const res = await fetch(`${RAG_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
};

// 获取文档树（含索引状态）
export const getDocumentTree = () => ragFetch('/api/v1/rag/tree');

// 选择性索引（仅支持单个文件粒度）
export const selectiveIndex = (docIds = []) =>
  ragFetch('/api/v1/rag/index', {
    method: 'POST',
    body: JSON.stringify({ doc_ids: docIds }),
  });

// 移除已索引文档（仅支持单个文件粒度）
export const removeIndexedDocs = (docIds = []) =>
  ragFetch('/api/v1/rag/index/remove', {
    method: 'POST',
    body: JSON.stringify({ doc_ids: docIds }),
  });

// 获取已索引文档列表
export const getIndexedDocuments = () => ragFetch('/api/v1/rag/index/documents');

// 获取索引状态和进度
export const getIndexStatus = () => ragFetch('/api/v1/rag/status');

// --- 会话管理 ---

export const createConversation = (title = '新对话') =>
  ragFetch('/api/v1/rag/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

export const getConversations = () =>
  ragFetch('/api/v1/rag/conversations');

export const getConversationMessages = (convId) =>
  ragFetch(`/api/v1/rag/conversations/${convId}/messages`);

export const updateConversation = (convId, title) =>
  ragFetch(`/api/v1/rag/conversations/${convId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });

export const deleteConversation = (convId) =>
  ragFetch(`/api/v1/rag/conversations/${convId}`, {
    method: 'DELETE',
  });
