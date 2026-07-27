/**
 * 权限判断工具模块
 *
 * 后端返回的每个资源节点包含：
 * - hasPermission: boolean        — 是否有查看权限
 * - permissionType: "VIEW"|"EDIT"|null — 兼容字段，表达查看/编辑能力
 * - canDelete: boolean            — 是否有独立删除权限
 *
 * 规则：
 * - EDIT 与 DELETE 相互独立
 * - EDIT、DELETE 都自动获得只读能力（VIEW）
 */

/**
 * 是否有查看权限
 */
export function canView(item) {
  return item?.hasPermission === true
}

/**
 * 是否有编辑权限
 */
export function canEdit(item) {
  return item?.permissionType === 'EDIT'
}

/**
 * 是否有删除权限（使用独立 canDelete 字段）
 */
export function canDelete(item) {
  return item?.canDelete === true
}

/**
 * 生成文件夹权限的复合键："folderId:permissionType"
 * 用于区分同一文件夹的不同权限类型，避免后写入覆盖前写入。
 */
export function permissionCompositeKey(folderId, permissionType) {
  return `${folderId}:${permissionType}`
}

/**
 * 计算权限差异
 * @param {Array<{folderId: number, permissionType: string}>} previous - 原始权限列表
 * @param {Array<{folderId: number, permissionType: string}>} next - 新权限列表
 * @returns {{ additions: Array, removals: Array }}
 */
export function diffPermissions(previous, next) {
  const key = (item) => permissionCompositeKey(item.folderId, item.permissionType)
  const prevMap = new Map(previous.map((item) => [key(item), item]))
  const nextMap = new Map(next.map((item) => [key(item), item]))

  return {
    additions: [...nextMap.entries()]
      .filter(([k]) => !prevMap.has(k))
      .map(([, item]) => item),
    removals: [...prevMap.entries()]
      .filter(([k]) => !nextMap.has(k))
      .map(([, item]) => item),
  }
}
