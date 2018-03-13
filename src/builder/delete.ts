import {ClauseBuilder, IClauseBuilder} from './clause';
import {error, integer, stringed} from "../util/assertion";
import {escapeId} from "../util/format";
import {Executor} from "../util";

export interface IDeleteBuilder extends IClauseBuilder {
  /**
   * 自那张表中删除记录
   *
   * @param {string} table 数据表名称
   * @return {IDeleteBuilder}
   */
  from(table: string): IDeleteBuilder;

  /**
   * 最多删除多少条记录
   *
   * @param {number | string} limit 删除上限
   * @return {IDeleteBuilder}
   */
  take(limit: number | string): IDeleteBuilder;

  /**
   * 跳过多少条记录开始删除（开始位置）
   *
   * @param {number | string} count 偏移位置
   * @return {IDeleteBuilder}
   */
  skip(count: number | string): IDeleteBuilder;

  call(exec: Executor, params?: Array<any>): Promise<any>;
}

export class DeleteBuilder extends ClauseBuilder implements IDeleteBuilder {
  _table: string;
  _limit?: number;
  _skip?: number;

  /**
   * @see {IDeleteBuilder#from}
   */
  from(table: string): IDeleteBuilder {
    stringed(table, 'table');
    this._table = table;
    return this;
  }

  /**
   * @see {IDeleteBuilder#take}
   */
  take(limit: number | string): IDeleteBuilder {
    integer(limit, 'limit');
    this._limit = +limit;
    return this;
  }

  /**
   * @see {IDeleteBuilder#skip}
   */
  skip(count: number | string): IDeleteBuilder {
    integer(count, 'count');
    if (!this._limit) error('The OFFSET is working together with LIMIT so first used take function');
    this._skip = +count;
    return this;
  }

  build(options: Record<string, any> = {}): string {
    const where = super.build(Object.assign({
      ignores: [],
      alias: null
    }, options));

    let sql = 'DELETE FROM ' + escapeId(this._table);
    if (where) sql += ' WHERE ' + where;
    if (this._limit) sql += ' LIMIT ' + this._limit;
    if (this._skip) sql += ' OFFSET ' + this._skip;
    return sql;
  }

  call(exec: Executor, params?: Array<any>): Promise<any> {
    return exec(this.build({}), params);
  }
}
