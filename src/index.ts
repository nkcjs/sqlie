export * from './builder/clause';
export * from './builder/delete';
export * from './builder/insert';
export * from './builder/select';
export * from './builder/update';

import {Connection} from 'mysql';
import {ModelBuilder} from './model';

let $connection: Connection = null;

/**
 * 创建模型对象
 * @param {string} table 表名称
 * @param {string} [pk] 主键名称，默认位 'id'
 */
export function createModel(table: string, pk: string = 'id') {
  return new ModelBuilder(table, pk);
}

/**
 * 设置MySQL连接对象
 * @param connection MySQL连接对象
 */
export function setConnection(connection: Connection) {
  $connection = connection;
}

/**
 * 执行 SQL 语句
 * @param {string} sql 被执行语句
 * @param {Array<string | number>} [params] 执行参数
 * @returns {Promise<*>}
 */
export function execute(sql: string, params: Array<string> = []): Promise<any> {
  return new Promise(function (resolve, reject) {
    $connection.query(sql, params, (err, rows, fields) => {
      if (err) return reject(err);
      // rows = JSON.parse(JSON.stringify(rows))[0];
      resolve({rows, fields});
    });
  });
}

ModelBuilder.execute = execute;
