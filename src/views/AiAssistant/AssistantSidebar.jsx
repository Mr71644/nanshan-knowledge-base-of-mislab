import React, { useState } from 'react';
import { Tabs, Button, Tooltip, Input, Popconfirm } from 'antd';
import {
  MessageOutlined,
  DatabaseOutlined,
  LeftOutlined,
  RightOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import KnowledgeTab from './KnowledgeTab';
import styles from './AssistantSidebar.module.css';

const ConversationItem = React.memo(({ conversation, isActive, onSwitch, onDelete, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);

  const handleSaveTitle = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(trimmed);
    } else {
      setEditTitle(conversation.title);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`${styles.conversationItem} ${isActive ? styles.active : ''}`}
      onClick={isEditing ? undefined : onSwitch}
    >
      <MessageOutlined style={{ fontSize: 12, flexShrink: 0, color: isActive ? '#1677ff' : '#999' }} />
      {isEditing ? (
        <Input
          size="small"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onPressEnter={handleSaveTitle}
          onBlur={handleSaveTitle}
          onClick={(e) => e.stopPropagation()}
          className={styles.conversationInput}
          autoFocus
        />
      ) : (
        <span className={styles.conversationTitle} title={conversation.title}>
          {conversation.title}
        </span>
      )}
      <div className={styles.conversationActions}>
        <Tooltip title="重命名">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            className={styles.actionBtn}
            onClick={(e) => {
              e.stopPropagation();
              setEditTitle(conversation.title);
              setIsEditing(true);
            }}
          />
        </Tooltip>
        <Popconfirm
          title="确定删除此对话？"
          onConfirm={(e) => {
            e?.stopPropagation();
            onDelete();
          }}
          onCancel={(e) => e?.stopPropagation()}
          okText="删除"
          cancelText="取消"
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            className={styles.actionBtn}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      </div>
    </div>
  );
});

const AssistantSidebar = ({
  collapsed,
  onToggleCollapse,
  activeTab,
  onTabChange,
  onNewConversation,
  conversations,
  currentConversationId,
  onSwitchConversation,
  onDeleteConversation,
  onRenameConversation,
  knowledgeTabProps,
}) => {
  if (collapsed) {
    return (
      <div className={`${styles.sidebar} ${styles.collapsed}`}>
        <div className={styles.collapsedIcons}>
          <Tooltip title="会话" placement="right">
            <Button
              type={activeTab === 'conversations' ? 'primary' : 'text'}
              icon={<MessageOutlined />}
              onClick={() => {
                onTabChange('conversations');
                onToggleCollapse();
              }}
              className={styles.iconBtn}
            />
          </Tooltip>
          <Tooltip title="知识库" placement="right">
            <Button
              type={activeTab === 'knowledge' ? 'primary' : 'text'}
              icon={<DatabaseOutlined />}
              onClick={() => {
                onTabChange('knowledge');
                onToggleCollapse();
              }}
              className={styles.iconBtn}
            />
          </Tooltip>
        </div>
        <button className={styles.collapseToggle} onClick={onToggleCollapse}>
          <RightOutlined style={{ fontSize: 13 }} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <button className={styles.collapseToggle} onClick={onToggleCollapse}>
        <LeftOutlined style={{ fontSize: 13 }} />
      </button>

      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        centered
        size="small"
        className={styles.sidebarTabs}
        items={[
          {
            key: 'conversations',
            label: (
              <span>
                <MessageOutlined /> 会话
              </span>
            ),
            children: (
              <div className={styles.conversationPanel}>
                <div className={styles.newChatBtn}>
                  <Button
                    block
                    icon={<PlusOutlined />}
                    onClick={onNewConversation}
                    size="small"
                  >
                    新建对话
                  </Button>
                </div>
                <div className={styles.conversationList}>
                  {(!conversations || conversations.length === 0) ? (
                    <div className={styles.emptyConversations}>暂无对话</div>
                  ) : (
                    conversations.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        isActive={conv.id === currentConversationId}
                        onSwitch={() => onSwitchConversation(conv.id)}
                        onDelete={() => onDeleteConversation(conv.id)}
                        onRename={(newTitle) => onRenameConversation(conv.id, newTitle)}
                      />
                    ))
                  )}
                </div>
              </div>
            ),
          },
          {
            key: 'knowledge',
            label: (
              <span>
                <DatabaseOutlined /> 知识库
              </span>
            ),
            children: <KnowledgeTab {...knowledgeTabProps} />,
          },
        ]}
        tabBarStyle={{
          padding: '0 8px',
          margin: 0,
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}
      />
    </div>
  );
};

export default React.memo(AssistantSidebar);
