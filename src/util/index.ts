import {parseColumn, tokenStringify} from './column-parser';
import {error, stringed} from './assertion';
import {escapeId} from './format';

export interface Executor {
  (sql: string, params: Array<any>): Promise<any>;
}

/**
 * 分解字段列表
 * @param {Array<string>|string} columns
 * @return {Array<string>}
 */
export function disassembleColumns(columns: Array<string> | string): Array<string> {
  const fields: Array<string> = [];

  // ['', null, undefined, column1', 'column2,column3', ...]
  if (Array.isArray(columns)) {
    return columns.reduce(function (arr, column) {
      // 跳过 空字符串、undefined、null
      if (!column) return arr;
      if (typeof column !== 'string') error('Invalid column for give columns');
      return arr.concat(...disassembleColumns(column));
    }, fields);
  }

  stringed(columns, 'columns');

  return columns.split(/,/).reduce(function (arr, column) {
    return (column = column.trim()) ? arr.concat(column) : arr;
  }, fields);
}

export function buildColumn(str: string, ignores, alias: string) {
  return tokenStringify(parseColumn(str), (str: string): string => {
    if (ignores.indexOf(str) > -1) return escapeId(str, true); // 主要是处理别名的引用问题
    const parts = str.split('.');
    if (parts.length === 1 && alias) parts.unshift(alias);
    return parts.map(part => escapeId(part)).join('.');
  });
}

const descriptor = {
  writable: false,
  enumerable: true,
  configurable: false
};

export function freezeBuilder<T extends any>(builder: T, exec: Executor): T {
  Object.defineProperties(builder, {
    call: {
      value: builder.call.bind(builder, exec),
      ...descriptor
    },
    _table: {
      value: builder._table,
      ...descriptor
    }
  });

  return builder;
}
