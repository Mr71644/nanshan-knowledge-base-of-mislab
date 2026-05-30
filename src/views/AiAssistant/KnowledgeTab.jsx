import React, { useState } from 'react';
import { Tree, Button, Progress, Spin, Empty, Popover, Tooltip } from 'antd';
import {
  CloudUploadOutlined,
  DeleteOutlined,
  PlusOutlined,
  FileTextOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import styles from './KnowledgeTab.module.css';

const DOC_TYPE_ICON = {
  markdown: <FileTextOutlined style={{ color: '#1677ff' }} />,
  excel: <FileExcelOutlined style={{ color: '#52c41a' }} />,
  pdf: <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
  docx: <FileTextOutlined style={{ color: '#1677ff' }} />,
};

const KnowledgeTab = ({
  indexedDocs,
  treeData,
  checkedKeys,
  loading,
  indexing,
  progress,
  onCheck,
  onIndex,
  onRemoveSelected,
  onRemoveDoc,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const docTreeContent = (
    <div className={styles.popoverContent}>
      {loading ? (
        <div className={styles.popoverLoading}>
          <Spin size="small" />
        </div>
      ) : (
        <>
          <div className={styles.popoverTree}>
            {treeData.length > 0 ? (
              <Tree
                checkable
                showIcon
                defaultExpandAll={false}
                defaultExpandedKeys={treeData.slice(0, 1).map((n) => n.key)}
                checkedKeys={checkedKeys}
                onCheck={(keys) => onCheck(keys)}
                treeData={treeData}
                blockNode
                style={{ fontSize: 12 }}
              />
            ) : (
              <div className={styles.emptyText}>暂无文档</div>
            )}
          </div>
          <div className={styles.popoverActions}>
            <Button
              type="primary"
              size="small"
              icon={<CloudUploadOutlined />}
              loading={indexing}
              disabled={checkedKeys.length === 0 || indexing}
              onClick={onIndex}
            >
              索引选中
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={checkedKeys.length === 0 || indexing}
              onClick={onRemoveSelected}
            >
              移除
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={styles.knowledgeTab}>
      <div className={styles.docListHeader}>
        <span className={styles.docListTitle}>
          已索引文档 ({indexedDocs.length})
        </span>
        <Popover
          content={docTreeContent}
          trigger="click"
          placement="rightTop"
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          overlayStyle={{ width: 340 }}
        >
          <Button size="small" type="primary" icon={<PlusOutlined />}>
            添加文档
          </Button>
        </Popover>
      </div>

      {indexing && progress && (
        <div className={styles.progressWrapper}>
          <Progress
            percent={
              progress.total
                ? Math.round(
                    ((progress.processed + progress.skipped) / progress.total) * 100
                  )
                : 0
            }
            size="small"
            status="active"
          />
          <div className={styles.progressText}>{progress.message}</div>
        </div>
      )}

      <div className={styles.docListScroll}>
        {indexedDocs.length === 0 ? (
          <Empty
            description="暂无已索引文档"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 40 }}
          />
        ) : (
          indexedDocs.map((doc) => (
            <div key={doc.doc_id} className={styles.docRow}>
              <span className={styles.docIcon}>
                {DOC_TYPE_ICON[doc.doc_type] || (
                  <FileTextOutlined style={{ color: '#999' }} />
                )}
              </span>
              <div className={styles.docInfo}>
                <span className={styles.docName} title={doc.title}>
                  {doc.title}
                </span>
                {doc.folder_path && (
                  <span className={styles.docPath} title={doc.folder_path}>
                    {doc.folder_path}
                  </span>
                )}
              </div>
              <Tooltip title="移除索引">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  className={styles.docDeleteBtn}
                  onClick={() => onRemoveDoc(doc.doc_id)}
                />
              </Tooltip>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default React.memo(KnowledgeTab);
