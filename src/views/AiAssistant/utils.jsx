import React from 'react';
import {
  FileTextOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';

export const STATUS_MAP = {
  1: { icon: <FileTextOutlined />, label: '富文本', color: 'blue' },
  3: { icon: <FileExcelOutlined />, label: '表格', color: 'green' },
  4: { icon: <FilePdfOutlined />, label: '文件', color: 'orange' },
};

export const isFolderNode = (node) => node.status === 2;

export const buildTreeDataAndIndexedKeys = (nodes) => {
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

export const findNode = (nodes, key) => {
  for (const n of nodes) {
    if (n.key === key) return n;
    if (n.children) {
      const found = findNode(n.children, key);
      if (found) return found;
    }
  }
  return null;
};
