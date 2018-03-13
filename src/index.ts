export * from './builder/clause';
export * from './builder/delete';
export * from './builder/insert';
export * from './builder/select';
export * from './builder/update';

import {Connection, ConnectionConfig, createConnection} from 'mysql';
import {ModelBuilder} from './model';

let connection: Connection = null;

export function createModel(table: string, pk: string = 'id') {
  return new ModelBuilder(table, pk);
}

export function setOptions(options: ConnectionConfig) {
  connection = createConnection(options);
}

export function connectDatabase() {
  return connection.connect();
}

export function closeTheConnection() {
  connection.end();
}

export function execute(sql: string, params: Array<string> = []): Promise<any> {
  return new Promise(function (resolve, reject) {
    connection.query(sql, params, (err, rows, fields) => {
      if (err) return reject(err);
      // rows = JSON.parse(JSON.stringify(rows))[0];
      resolve({rows, fields});
    });
  });
}

ModelBuilder.execute = execute;
