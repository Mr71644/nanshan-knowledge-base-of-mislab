import toExcelColumnName from "./toExcelColumnName.js";
/**
 * 转换函数 - 适配 Univer 0.15.x 数据结构
 * @param {Object} json 
 * @returns {Object}
 */
const convertToExcelFormat = (json) => {
    // 将后端的稀疏矩阵（以行为 key 的对象）转换为 XLSX 字段格式
    // Univer 0.15.x 版本使用富文本结构：{ p: { body: { dataStream: 'text' } } } 或 { v: 'value' }
    // 输出示例（简化）：{ A1: { v: 'a', t: 's' }, B1: { v: 'b', t: 's' }, A2: { v: 'c', t: 's' }, '!ref': 'A1:B2' }

    const result = {};
    const columnIndexes = []
    const rowIndexes = []

    for (const [rowKey, rowValue] of Object.entries(json)) {
        const row = parseInt(rowKey, 10) + 1 // 后端行从0开始，Excel 行从1开始
        rowIndexes.push(row)
        for (const [colKey, colValue] of Object.entries(rowValue)) {
            const colIndex = parseInt(colKey, 10)
            columnIndexes.push(colIndex)
            const columnName = toExcelColumnName(colIndex);
            const cellKey = `${columnName}${row}`; // e.g. A1
            
            // 提取单元格值，适配新旧两种数据结构
            let cellValue = '';
            
            if (colValue.p && colValue.p.body && colValue.p.body.dataStream) {
                // 新版本 0.15.x：富文本结构
                cellValue = colValue.p.body.dataStream.replace(/\r\n$/, ''); // 移除末尾换行符
            } else if (colValue.v !== undefined) {
                // 旧版本或简单值
                cellValue = colValue.v;
            }
            
            // 只有非空值才添加到结果中
            if (cellValue !== '') {
                result[cellKey] = {
                    v: cellValue,
                    t: 's'
                };
            }
        }
    }

    // 计算工作表范围（!ref），防止空数据导致 Math.max 报错
    if (columnIndexes.length === 0 || rowIndexes.length === 0) {
        result["!ref"] = 'A1:A1'
    } else {
        const maxCol = Math.max.apply(null, columnIndexes)
        const maxRow = Math.max.apply(null, rowIndexes)
        result["!ref"] = `A1:${toExcelColumnName(maxCol)}${maxRow}`
    }
    return result;
}

export default convertToExcelFormat