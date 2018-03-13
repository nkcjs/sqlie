import {IInsertBuilder, InsertBuilder} from './builder/insert';
import {ISelectBuilder, SelectBuilder} from "./builder/select";
import {DeleteBuilder, IDeleteBuilder} from "./builder/delete";
import {IUpdateBuilder, UpdateBuilder} from "./builder/update";
import {Executor, freezeBuilder} from './util';

export interface IModelBuilder {
  table: string;
  primaryKey: string;

  getPrimaryKey(): string;

  create(values: Record<string, any>): IInsertBuilder;

  get(columns?: Array<string> | string): ISelectBuilder;

  getOne(columns?: Array<string> | string): ISelectBuilder;

  getLast(columns?: Array<string> | string): ISelectBuilder;

  getById(id: any, columns?: Array<string> | string): ISelectBuilder;

  delete(where?: Record<string, any>): IDeleteBuilder;

  deleteById(id: any): IDeleteBuilder;

  update(values: Record<string, any>): IUpdateBuilder;

  updateById(id: any, values: Record<string, any>): IUpdateBuilder;
}

export class ModelBuilder implements IModelBuilder {
  static execute: Executor;

  constructor(
    public table: string,
    public primaryKey: string = 'id'
  ) {
  }

  create(values: Record<string, any>): IInsertBuilder {
    return freezeBuilder(
      new InsertBuilder()
        .into(this.table)
        .setSome(values),
      ModelBuilder.execute
    );
  }

  getPrimaryKey(): string {
    return this.primaryKey;
  }

  get(columns?: Array<string> | string): ISelectBuilder {
    return freezeBuilder(
      new SelectBuilder()
        .from(this.table)
        .select(columns),
      ModelBuilder.execute
    );
  }

  getOne(columns?: Array<string> | string): ISelectBuilder {
    return this.get(columns).take(1);
  }

  getLast(columns?: Array<string> | string): ISelectBuilder {
    return this.getOne(columns).orderBy(this.primaryKey, true);
  }

  getById(id: any, columns?: Array<string> | string): ISelectBuilder {
    return this.get(columns).where(this.primaryKey, '=', id) as ISelectBuilder;
  }

  delete(where?: Record<string, any>): IDeleteBuilder {
    const builder = freezeBuilder(
      new DeleteBuilder().from(this.table),
      ModelBuilder.execute
    );

    if (!where) {
      return builder;
    }

    Object.keys(where).forEach(op => {
      const values = where[op];

      // {'>': 'c1,c2,...'}
      if (typeof values === 'string') {
        builder.where(values, op);
      }
      // {'>': ['c1','c2' ...]}
      else if (Array.isArray(values)) {
        values.forEach(value => builder.where(op, value));
      }
      // {'=': {c1: v1, c2: v2}}
      else {
        Object.keys(values).forEach(key => {
          builder.where(key, op, values[key]);
        });
      }
    });

    return builder;
  }

  deleteById(id: any): IDeleteBuilder {
    return freezeBuilder(
      new DeleteBuilder()
        .from(this.table)
        .where(this.primaryKey, '=', id) as IDeleteBuilder,
      ModelBuilder.execute
    );
  }

  update(values: Record<string, any>): IUpdateBuilder {
    return freezeBuilder(
      new UpdateBuilder()
        .from(this.table)
        .setSome(values),
      ModelBuilder.execute
    );
  }

  updateById(id: any, values: Record<string, any>): IUpdateBuilder {
    return this.update(values).where(this.primaryKey, '=', id) as IUpdateBuilder;
  }
}
