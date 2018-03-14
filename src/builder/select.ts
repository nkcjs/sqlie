import {ClauseBuilder, ClauseFactory, IClauseBuilder} from './clause';
import {buildColumn, disassembleColumns, Executor} from '../util';
import {error, integer, required, stringed} from '../util/assertion';
import {escapeId} from '../util/format';

export interface ByItem {
  column: string;
  isDesc?: boolean;
}

export interface HavingItem {
  builder: ClauseBuilder;
  isOr?: boolean;
}

export interface SelectFactory {
  (builder: ISelectBuilder): void;
}

export interface JoinSelectFactory {
  (builder: IJoinSelectBuilder): void;
}

export interface ISelectBuilder extends IClauseBuilder {
  from(table: string, alias?: string): ISelectBuilder;

  select(columns: Array<string> | string): ISelectBuilder;

  join(selectFactory: SelectFactory): ISelectBuilder; // JOIN (a select result) ON
  join(table: string, joinFactory: JoinFactory): ISelectBuilder;

  join(table: string, type: string, joinFactory: JoinFactory): ISelectBuilder;

  take(limit: number | string): ISelectBuilder;

  skip(count: number | string): ISelectBuilder;

  groupBy(column: string, isDesc?: boolean): ISelectBuilder;

  orderBy(column: string, isDesc?: boolean): ISelectBuilder;

  having(havingFactory: ClauseFactory): ISelectBuilder;

  orHaving(havingFactory: ClauseFactory): ISelectBuilder;

  call(exec: Executor, params?: Array<any>): Promise<any>;
}

export interface IJoinSelectBuilder extends ISelectBuilder {
  setAlias(alias: string): IJoinSelectBuilder;
}

export interface JoinFactory {
  (builder: IJoinBuilder): void;
}

export interface IJoinBuilder extends IClauseBuilder {
  setAlias(alias: string): IJoinBuilder;

  select(columns: Array<string> | string): IJoinBuilder;

  groupBy(column: string, isDesc?: boolean): IJoinBuilder;

  orderBy(column: string, isDesc?: boolean): IJoinBuilder;
}

export class JoinBuilder extends ClauseBuilder implements IJoinBuilder {
  _table: string | IJoinSelectBuilder;
  _alias?: string;
  _type?: string;
  _select: Array<string> = [];
  _groupBy: Array<ByItem> = [];
  _orderBy: Array<ByItem> = [];

  constructor(table: string | IJoinSelectBuilder, type: string) {
    super();
    this._table = table;
    this._type = type;
  }

  setAlias(alias: string): IJoinBuilder {
    alias && stringed(alias, 'alias');
    this._alias = alias;
    return this;
  }

  select(columns: Array<string> | string): IJoinBuilder {
    required(columns, 'columns');
    const select = this._select.concat(disassembleColumns(columns));
    // 利用 Array.from 将 Set 结构转换成数组去重
    this._select = Array.from(new Set(select));
    return this;
  }

  groupBy(column: string, isDesc?: boolean): IJoinBuilder {
    this._groupBy.push({column, isDesc});
    return this;
  }

  orderBy(column: string, isDesc?: boolean): IJoinBuilder {
    this._orderBy.push({column, isDesc});
    return this;
  }

  build(options: Record<string, any> = {}): string {
    let sql = (this._type ? this._type.toUpperCase() : '') + ' JOIN ';

    if (this._table instanceof JoinSelectBuilder) {
      sql += this._table.build(options);
    } else {
      sql += escapeId(this._table);

      if (this._alias) {
        options.ignores.push(this._alias);
        sql += ' AS ' + escapeId(this._alias);
      }
    }

    const on = super.build(options);
    if (on) sql += ' ON ' + on;

    return sql.trim();
  }
}

export class SelectBuilder extends ClauseBuilder implements ISelectBuilder {
  _table?: string;
  _alias?: string;
  _select: Array<string> = [];
  _join: Array<JoinBuilder> = [];
  _groupBy: Array<ByItem> = [];
  _having: Array<HavingItem> = [];
  _orderBy: Array<ByItem> = [];
  _limit?: number;
  _skip?: number;

  from(table: string, alias?: string): ISelectBuilder {
    stringed(table, 'table');
    alias && stringed(alias, 'alias');
    this._table = table;
    this._alias = alias;
    return this;
  }

  select(columns: Array<string> | string): ISelectBuilder {
    required(columns, 'columns');
    const select = this._select.concat(disassembleColumns(columns));
    // 利用 Array.from 将 Set 结构转换成数组去重
    this._select = Array.from(new Set(select));
    return this;
  }

  join(selectFactory: JoinSelectFactory): ISelectBuilder;
  join(table: string, joinFactory: JoinFactory): ISelectBuilder;
  join(table: string, type: string, joinFactory: JoinFactory): ISelectBuilder;
  join(table: string | JoinSelectFactory, type?: string | JoinFactory, joinFactory?: JoinFactory): ISelectBuilder {
    // join(selectFactory);
    if (typeof table === 'function') {
      const selector = new JoinSelectBuilder();
      (table as JoinSelectFactory)(selector);
      const builder = new JoinBuilder(selector, '');
      this._join.push(builder);
      return this;
    }

    stringed(table, 'table');

    // join(table, joinFactory)
    if (typeof type === 'function') {
      joinFactory = type;
      type = '';
    }

    // join(table, type, joinFactory)
    if (typeof joinFactory === 'function') {
      const builder = new JoinBuilder(table, type);
      (joinFactory as JoinFactory)(builder);
      this._join.push(builder);
    }

    return this;
  }

  take(limit: number | string): ISelectBuilder {
    integer(limit, 'limit');
    this._limit = +limit;
    return this;
  }

  skip(count: number | string): ISelectBuilder {
    integer(count, 'count');
    if (!this._limit) error('The OFFSET is working together with LIMIT so first used take function');
    this._skip = +count;
    return this;
  }

  groupBy(column: string, isDesc?: boolean): ISelectBuilder {
    this._groupBy.push({column, isDesc});
    return this;
  }

  orderBy(column: string, isDesc?: boolean): ISelectBuilder {
    this._orderBy.push({column, isDesc});
    return this;
  }

  having(havingFactory: ClauseFactory): ISelectBuilder {
    if (typeof havingFactory !== 'function') error('The havingFactory must be a function');
    const builder = new ClauseBuilder();
    havingFactory(builder);
    this._having.push({builder});
    return this;
  }

  orHaving(havingFactory: ClauseFactory): ISelectBuilder {
    const havings = (this.having(havingFactory) as SelectBuilder)._having;
    havings[havings.length - 1].isOr = true;
    return this;
  }

  // SELECT [fields] FROM [table] [join] [where][group][having][order][limit][offset]';
  build(options: Record<string, any> = {}): string {
    if (!this._table) error('must be use from() set table');

    // 如果 join 了其他的表则表示必须使用别名来处理字段
    const mustBeUseAlias = this._join.length > 0;
    const alias = this._alias || (mustBeUseAlias ? this._table : '');
    const opts = Object.assign({ignores: []}, options,{alias});

    if (alias) opts.ignores.push(alias);

    let sql = '';

    // [fields]
    const fields = [];
    const parseSelectedColumns = (arr: Array<string>, alias?: string) => {
      arr.forEach(item => {
        if (item === '*') {
          fields.push(alias ? escapeId(alias) + '.*' : '*');
          return;
        }

        const parts = item.trim().split(/(?:^|\s+)as(?:\s+|$)/i);
        if (parts.length > 2) error(`bad column expression "${item}"`);

        // 关键字 AS 前面没有字段名称
        let [field, asAlias] = parts;
        if (asAlias) opts.ignores.push(asAlias);

        let subSql = buildColumn(field, opts.ignores, alias);
        if (asAlias) subSql += ' AS ' + escapeId(asAlias);

        fields.push(subSql);
      });
    };

    parseSelectedColumns(this._select, alias);

    this._join.forEach((join: JoinBuilder) => {
      let joinedAlias = join._alias;
      if (!joinedAlias && join._table instanceof JoinSelectBuilder) joinedAlias = join._table._resultAlias;
      else if (!joinedAlias) joinedAlias = join._table as string;
      parseSelectedColumns(join._select, joinedAlias);
    });

    if (!fields.length) {
      fields.push('*');
    }

    sql += 'SELECT ' + fields.join(', ');

    // [table]
    if (!this._table) error('Please use "from()" set table for the select.');
    sql += ' FROM ' + escapeId(this._table);
    if (this._alias) sql += ' AS ' + escapeId(this._alias);

    // [join]
    // fixme: bad clause for on
    this._join.forEach(join => sql += ' ' + join.build(opts));

    // [where]
    const where = super.build(opts);
    if (where) sql += ' WHERE ' + where;

    // [group by]
    const groupBy = [];
    this._groupBy.forEach(group => {
      const column = buildColumn(group.column, opts.ignores, opts.alias);
      groupBy.push(column + (group.isDesc ? ' DESC' : ' ASC'));
    });

    this._join.forEach(join => {
      join._groupBy.forEach(group => {
        const column = buildColumn(group.column, opts.ignores, opts.alias);
        groupBy.push(column + (group.isDesc ? ' DESC' : ' ASC'));
      });
    });

    if (groupBy.length) {
      sql += ' GROUP BY ' + groupBy.join(', ');
    }

    // [having]
    sql += this._having.reduce(function (str, having: HavingItem, index: number) {
      if (index === 0) str += ' HAVING ';
      else str += having.isOr ? ' OR ' : ' AND ';
      return str + having.builder.build(opts);
    }, '');

    // [order by]
    const orderBy = [];
    this._orderBy.forEach(order => {
      const column = buildColumn(order.column, opts.ignores, opts.alias);
      orderBy.push(column + (order.isDesc ? ' DESC' : ' ASC'));
    });

    this._join.forEach(join => {
      join._orderBy.forEach(order => {
        const column = buildColumn(order.column, opts.ignores, opts.alias);
        orderBy.push(column + (order.isDesc ? ' DESC' : ' ASC'));
      });
    });

    if (orderBy.length) {
      sql += ' ORDER BY ' + orderBy.join(', ');
    }

    // [limit]
    if (this._limit) {
      sql += ' LIMIT ' + this._limit;
    }

    // [offset]
    if (this._skip) {
      sql += ' OFFSET ' + this._skip;
    }

    return sql;
  }

  call(exec: Executor, params?: Array<any>): Promise<any> {
    return exec(this.build({}), params);
  }
}

export class JoinSelectBuilder extends SelectBuilder implements IJoinSelectBuilder {
  _resultAlias?: string;

  setAlias(alias: string): IJoinSelectBuilder {
    alias && stringed(alias, 'alias');
    this._resultAlias = alias;
    return this;
  }

  build(options: Record<string, any>): string {
    if (!this._resultAlias) error('Join a select must be use resultAlias');
    return '(' + super.build(options) + ') AS ' + escapeId(this._resultAlias, true);
  }

  call(exec: Executor, params?: Array<any>): Promise<any> {
    return Promise.reject('cat not call "call()"');
  }
}
