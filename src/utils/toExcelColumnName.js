/**
 * 将数字转换为对应的excel列数名字
 * @param {number} num 
 * @returns {string}
 */
const toExcelColumnName = (num) => {
    let columnName = '';
    let colNumber = num + 1
    let remainder;
    do {
        remainder = (colNumber - 1) % 26;
        columnName = String.fromCharCode(remainder + 65) + columnName;
        colNumber = Math.floor((colNumber - 1) / 26);
    } while (colNumber >= 1);
    return columnName;
}

export default toExcelColumnName