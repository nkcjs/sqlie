import {buildColumn} from '../util';
import {error, required} from '../util/assertion';
import {escape, format} from '../util/format';

export const symbol = Symbol(__filename);

export interface ClauseExpr {
  column: string;
  operator: string;
  value?: any;
  valueIsColumn?: boolean;
  isOr?: boolean;
}

export interface ClauseBlock {
  builder: IClauseBuilder;
  isOr?: boolean;
}

export interface IClauseBuilder {
  where(column: string, operator?: string, value?: any): IClauseBuilder;

  andWhere(column: string, operator?: string, value?: any): IClauseBuilder;

  orWhere(column: string, operator?: string, value?: any): IClauseBuilder;

  onColumn(first: string, second: string, operator?: string): IClauseBuilder;

  orColumn(first: string, second: string, operator?: string): IClauseBuilder;

  clause(factory: ClauseFactory): IClauseBuilder;

  andClause(factory: ClauseFactory): IClauseBuilder;

  orClause(factory: ClauseFactory): IClauseBuilder;

  build(options?: Record<string, any>): string;
}

export interface ClauseFactory {
  (builder: IClauseBuilder): void;
}

export class ClauseBuilder implements IClauseBuilder {
  _clauses: Array<ClauseExpr | ClauseBlock> = [];

  _appendWhere(
    column: string,
    value: any,
    operator: string = '=',
    isOr: boolean = false,
    valueIsColumn: boolean = false
  ): IClauseBuilder {
    switch (operator.toUpperCase()) {
      case 'IS NULL':
      case 'IS NOT NULL':
        if (value) error('can not set value');
        break;

      case 'BETWEEN':
      case 'NOT BETWEEN':
        if (Array.isArray(value) && value.length !== 2) {
          error('The value is required to be Array with length 2');
        }
        break;
    }

    this._clauses.push({
      column,
      operator,
      value,
      valueIsColumn,
      isOr
    } as ClauseExpr);
    return this;
  }

  where(column: string, operator?: string, value?: any): IClauseBuilder {
    const val = arguments.length < 3 ? symbol : value;
    return this._appendWhere(column, val, operator);
  }

  andWhere(column: string, operator?: string, value?: any): IClauseBuilder {
    const val = arguments.length < 3 ? symbol : value;
    return this._appendWhere(column, val, operator);
  }

  orWhere(column: string, operator?: string, value?: any): IClauseBuilder {
    const val = arguments.length < 3 ? symbol : value;
    return this._appendWhere(column, val, operator, true);
  }

  onColumn(first: string, second: string, operator?: string): IClauseBuilder {
    required(second, 'second');
    return this._appendWhere(first, second, operator, false, true);
  }

  orColumn(first: string, second: string, operator?: string): IClauseBuilder {
    required(second, 'second');
    return this._appendWhere(first, second, operator, true, true);
  }

  _appendClause(factory: ClauseFactory, isOr: boolean): IClauseBuilder {
    const builder = new ClauseBuilder();
    factory(builder);
    this._clauses.push({builder, isOr} as ClauseBlock);
    return this;
  }

  clause(factory: ClauseFactory): IClauseBuilder {
    return this._appendClause(factory, false);
  }

  andClause(factory: ClauseFactory): IClauseBuilder {
    return this._appendClause(factory, false);
  }

  orClause(factory: ClauseFactory): IClauseBuilder {
    return this._appendClause(factory, true);
  }

  build(options: Record<string, any> = {}): string {
    const {ignores, alias} = options;

    const buildExpr = (expr: ClauseExpr): string => {
      let column = buildColumn(expr.column, ignores, alias);

      switch (expr.operator.toUpperCase()) {
        case 'IS NULL':
        case 'IS NOT NULL':
          return column + ' ' + expr.operator.toUpperCase();

        case 'BETWEEN':
        case 'NOT BETWEEN':
          let value = ' ? AND ?';
          if (expr.value) value = format(value, expr.value as Array<any>);
          return column + ' ' + expr.operator.toUpperCase() + value;
      }

      if (expr.valueIsColumn) {
        return column + ' ' + expr.operator + ' ' + buildColumn(expr.value, ignores, alias);
      }

      if (expr.value === symbol) {
        return column + ' ' + expr.operator + ' ?';
      }

      return column + ' ' + expr.operator + ' ' + escape(expr.value, true);
    };

    let sql = '';

    this._clauses.forEach((item: ClauseExpr | ClauseBlock, index: number) => {
      if (index > 0) sql += item.isOr ? ' OR ' : ' AND ';
      if ('builder' in item) sql += '(' + (item as ClauseBlock).builder.build(options) + ')';
      else sql += buildExpr(item as ClauseExpr);
    });

    return sql.trim();
  }
}
