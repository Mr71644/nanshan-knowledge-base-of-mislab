import React from 'react';
import { Tabs, Button, Tooltip } from 'antd';
import {
  MessageOutlined,
  DatabaseOutlined,
  LeftOutlined,
  RightOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import KnowledgeTab from './KnowledgeTab';
import styles from './AssistantSidebar.module.css';

const AssistantSidebar = ({
  collapsed,
  onToggleCollapse,
  activeTab,
  onTabChange,
  onNewConversation,
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
                  <div className={`${styles.conversationItem} ${styles.active}`}>
                    <MessageOutlined style={{ fontSize: 12, color: '#1677ff' }} />
                    <span>当前对话</span>
                  </div>
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
