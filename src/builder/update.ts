import {ClauseBuilder, IClauseBuilder, symbol} from './clause';
import {error, integer, required, stringed} from "../util/assertion";
import {escape, escapeId} from "../util/format";
import {parseColumn} from "../util/column-parser";
import {buildColumn, Executor} from "../util";

export interface UpdateItem {
  column: string;
  value?: any;
}

// UPDATE table_name SET field1=new-value1 [WHERE Clause] [LIMIT] [OFFSET]
export interface IUpdateBuilder extends IClauseBuilder {
  from(table: string): IUpdateBuilder;

  set(column: string, value?: any): IUpdateBuilder;

  setSome(columns: Array<string> | Record<string, any>): IUpdateBuilder;

  take(limit: number | string): IUpdateBuilder;

  skip(count: number | string): IUpdateBuilder;

  call(execute: Executor, params?: Array<any>): Promise<any>;
}

export class UpdateBuilder extends ClauseBuilder implements IUpdateBuilder {
  _table: string;
  _columns: Array<UpdateItem> = [];
  _limit?: number;
  _skip?: number;

  from(table: string): IUpdateBuilder {
    stringed(table, 'table');
    this._table = table;
    return this;
  }

  set(column: string, value?: any): IUpdateBuilder {
    stringed(column, 'column');
    const val = arguments.length < 2 ? symbol : value;
    this._columns.push({column, value: val});
    return this;
  }

  setSome(columns: Array<string> | Record<string, any>): IUpdateBuilder {
    if (Array.isArray(columns)) {
      columns.forEach(column => this.set(column));
      return this;
    }

    required(columns, 'values');
    if (typeof columns !== 'object')
      error('The columns is required to be Array, String or Object.');

    Object.keys(columns).forEach(key => {
      this.set(key, columns[key]);
    });

    return this;
  }

  take(limit: number | string): IUpdateBuilder {
    integer(limit, 'limit');
    this._limit = +limit;
    return this;
  }

  skip(count: number | string): IUpdateBuilder {
    integer(count, 'limit');
    this._skip = +count;
    return this;
  }

  build(options: Record<string, any> = {}): string {
    const opts = Object.assign({ignores: []}, options);
    let sql = 'UPDATE ' + escapeId(this._table);

    sql += ' SET ' + this._columns.reduce(function (str, item, index) {
      if (index > 0) str += ', ';
      str += buildColumn(item.column, opts.ignores, opts.alias) + ' = ';
      if (item.value === symbol) return str + '?';
      return str + escape(item.value, true);
    }, '');

    const where = super.build(opts);
    if (where) sql += ' WHERE ' + where;

    return sql;
  }

  call(exec: Executor, params?: Array<any>): Promise<any> {
    return exec(this.build({}), params);
  }
}
