import {buildColumn, disassembleColumns, Executor} from '../util';
import {error, required, stringed} from '../util/assertion';
import {escape, escapeId} from '../util/format';
import {symbol} from "./clause";

export interface InsertItem {
  column: string;
  value?: any;
}

// INSERT INTO table ([set_fields]) values ([set_values])';
export interface IInsertBuilder {
  /**
   * 将数据插入到那张表
   *
   * @param {string} table 数据表名称
   * @return {IInsertBuilder}
   */
  into(table: string): IInsertBuilder;

  /**
   * 设置一个新数据
   *
   * @example
   * // 设置新数据的字段
   * ip.set('name');
   *
   * @example
   * // 设置新数据字段，同时绑定数据
   * ip.set('name', 'Jon Snow')
   *
   * @example
   * // 设置新数据字段，同时使用绑定数据的getter函数
   * ip.set('name', function nameGetter() { ... });
   *
   * @param {string} column 字段名称
   * @param {*} [value] 可选，插入的值，未设置则需在后续设置
   * @return {IInsertBuilder}
   */
  set(column: string, value?: any): IInsertBuilder;

  /**
   * 设置多个新数据
   *
   * @example
   * // 通过数组设置多个字段
   * ip.setSome(['name', 'gender', 'role']);
   *
   * @example
   * // 通过字符串设置多个字段
   * ip.setSome('name,gender,role');
   *
   * @example
   * // 通过对象设置多个字段并且绑定值（值可以是一个 getter）
   * ip.setSome({name: 'Jon Snow', gender: 1, role: 'king'});
   *
   * @param {Array<string>|Object|string} columns 数据信息
   * @return {IInsertBuilder}
   */
  setSome(columns: Array<string> | Record<string, any> | string): IInsertBuilder;

  call(exec: Executor, params?: Array<any>): Promise<any>;
}

export class InsertBuilder implements IInsertBuilder {
  _table: string;
  _columns: Array<InsertItem> = []; // 注意字段重复

  /**
   * @see {InsertBuilder#into}
   */
  into(table: string): IInsertBuilder {
    stringed(table, 'table');
    this._table = table;
    return this;
  }

  /**
   * @see {InsertBuilder#set}
   */
  set(column: string, value?: any): IInsertBuilder {
    stringed(column, 'column');
    const val = arguments.length < 2 ? symbol : value;
    this._columns.push({column, value: val});
    return this;
  }

  /**
   * @see {InsertBuilder#setSome}
   */
  setSome(columns: Array<string> | Record<string, any> | string): IInsertBuilder {
    if (typeof columns === 'string') {
      columns = disassembleColumns(columns);
    }

    if (Array.isArray(columns)) {
      columns.forEach(column => {
        this.set(column);
      });

      return this;
    }

    required(columns, 'values');
    if (typeof columns !== 'object')
      error('The columns is required to be Array, String or Object.');

    Object.keys(columns).forEach(column => {
      this.set(column, columns[column]);
    });

    return this;
  }

  build(options: Record<string, any>): string {
    const opts = Object.assign({
      ignores: [],
      alias: null
    }, options);

    const fields = [];
    const values = [];

    this._columns.forEach(item => {
      fields.push(buildColumn(item.column, opts.ignores, opts.alias));
      if (item.value === symbol) values.push('?');
      else values.push(escape(item.value, true));
    });

    if (!fields.length) {
      error('Miss data');
    }

    return 'INSERT INTO ' + escapeId(this._table)
      + ' (' + fields.join(', ') + ')'
      + ' VALUES (' + values.join(', ') + ')';
  }

  call(exec: Executor, params?: Array<any>): Promise<any> {
    return exec(this.build({}), params);
  }
}
