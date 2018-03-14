'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var mysql = require('mysql');

function parseColumn(src) {
    let at = 0;
    const peek = () => src[at];
    const consume = () => src[at++];
    function call(name, start) {
        let args = [];
        let ch;
        let tmp = '';
        let deep = 1;
        function setArg() {
            try {
                const node = parseColumn(src.substring(start, at));
                node && args.push(node);
                return node;
            }
            catch (e) {
                const [msg, errAt] = e.message.split('at', 2);
                if (isNaN(+errAt))
                    throw e;
                error(start + +errAt, msg);
            }
        }
        while (ch = peek()) {
            if (ch === ')' && --deep === 0) {
                setArg();
                consume();
                tmp = '';
                break;
            }
            if (ch === '(') {
                deep++;
                consume();
                tmp = '';
                continue;
            }
            if (ch === ',') {
                if (!setArg()) {
                    error(at);
                }
                consume();
                start = at;
                tmp = '';
                continue;
            }
            if (ch === '"' || ch === "'") {
                const quoteEnd = stern(src, at);
                if (quoteEnd === -1)
                    error(at, 'Bad string');
                at = quoteEnd + 1;
                continue;
            }
            tmp += consume();
        }
        if (tmp) {
            error(-1, 'Parse Failed');
        }
        return { name, args };
    }
    function lr() {
        let ch;
        let tmp = '';
        let tmpStop = false;
        let node = null;
        while (ch = peek()) {
            switch (ch) {
                case '+':
                case '-':
                case '*':
                case '/':
                case '%':
                    consume();
                    if (node && tmp) {
                        error(at);
                    }
                    return {
                        op: ch,
                        left: node || tmp,
                        right: lr()
                    };
            }
            if (ch === '(') {
                consume();
                node = call(tmp, at);
                tmp = '';
                continue;
            }
            if (ch === '"' || ch === "'") {
                if (node || tmp)
                    error(at);
                const quoteEnd = stern(src, at);
                if (quoteEnd === -1)
                    error(at, 'Bad string');
                node = src.substring(at, quoteEnd + 1);
                at = quoteEnd + 1;
                tmp = '';
                continue;
            }
            if (ch <= ' ') {
                if (tmp && !tmpStop) {
                    tmpStop = true;
                }
                consume();
                continue;
            }
            if (tmp && tmpStop) {
                error(at);
            }
            tmp += consume();
        }
        if (node && tmp) {
            error(at);
        }
        return tmp || node;
    }
    function error(at, message = 'Invalid char') {
        throw {
            name: 'SyntaxError',
            message: message + ' at ' + at,
            at
        };
    }
    return lr();
}
function stern(src, start) {
    const quote = src[start];
    let prevCharIsBackslash = false;
    let at = start;
    let ch;
    while (ch = src[++at]) {
        if (ch === '\\') {
            prevCharIsBackslash = !prevCharIsBackslash;
            continue;
        }
        // end
        if (ch === quote && !prevCharIsBackslash) {
            return at;
        }
        prevCharIsBackslash = false;
    }
    return -1;
}
function tokenStringify(token, handle) {
    if (typeof token === 'string') {
        if (/^[\d"']/.test(token))
            return token;
        if (/^(null|false|true)$/.test(token))
            return token;
        return handle(token);
    }
    if ('op' in token) {
        const { left, op, right } = token;
        return tokenStringify(left, handle)
            + ' ' + op + ' '
            + tokenStringify(right, handle);
    }
    const { name, args } = token;
    return name + '(' + args.map(arg => {
        return tokenStringify(arg, handle);
    }).join(', ') + ')';
}

function error(message) {
    throw new Error(message);
}
function required(value, variable) {
    if (value == null)
        error(`The ${variable} is required.`);
}
function stringed(value, variable) {
    if (!value || typeof value !== 'string')
        error(`The ${variable} is required to be string.`);
}
/**
 * 必须是正整数
 * @param num
 * @param variable
 */
function integer(num, variable) {
    if (isNaN(num = +num) || num <= 0 || num % 1 !== 0)
        error(`The ${variable} is required to be integer.`);
}

const ID_GLOBAL_REGEXP = /`/g;
const QUAL_GLOBAL_REGEXP = /\./g;
const CHARS_GLOBAL_REGEXP = /[\0\b\t\n\r\x1a\\"']/g;
const CHARS_ESCAPE_MAP = {
    '\0': '\\0',
    '\b': '\\b',
    '\t': '\\t',
    '\n': '\\n',
    '\r': '\\r',
    '\x1a': '\\Z',
    '"': '\\"',
    '\'': '\\\'',
    '\\': '\\\\'
};
function escapeId(val, forbidQualified) {
    if (Array.isArray(val)) {
        return val.map(item => escapeId(item, forbidQualified)).join(', ');
    }
    if (forbidQualified) {
        return '`' + String(val).replace(ID_GLOBAL_REGEXP, '``') + '`';
    }
    return '`' + String(val)
        .replace(ID_GLOBAL_REGEXP, '``')
        .replace(QUAL_GLOBAL_REGEXP, '`.`')
        + '`';
}
function escape(val, stringifyObjects, timeZone = 'local') {
    if (val === undefined || val === null) {
        return 'NULL';
    }
    if (typeof val === 'function') {
        return escape(val(), stringifyObjects, timeZone);
    }
    switch (typeof val) {
        case 'boolean':
            return (val) ? 'true' : 'false';
        case 'number':
            return val + '';
        case 'object':
            if (val instanceof Date) {
                return dateToString(val, timeZone);
            }
            else if (Array.isArray(val)) {
                return arrayToList(val, timeZone);
            }
            else if (Buffer.isBuffer(val)) {
                return bufferToString(val);
            }
            else if (typeof val.toSqlString === 'function') {
                return String(val.toSqlString());
            }
            else if (stringifyObjects) {
                return escapeString(val.toString());
            }
            else {
                return objectToValues(val, timeZone);
            }
        default:
            return escapeString(val);
    }
}
function arrayToList(array, timeZone) {
    let sql = '';
    for (let i = 0; i < array.length; i++) {
        const val = array[i];
        if (Array.isArray(val)) {
            sql += (i === 0 ? '' : ', ') + '(' + arrayToList(val, timeZone) + ')';
        }
        else {
            sql += (i === 0 ? '' : ', ') + escape(val, true, timeZone);
        }
    }
    return sql;
}
function format(sql, values, stringifyObjects, timeZone) {
    if (values == null) {
        return sql;
    }
    if (!(values instanceof Array || Array.isArray(values))) {
        values = [values];
    }
    const placeholdersRegex = /\?+/g;
    let chunkIndex = 0;
    let result = '';
    let valuesIndex = 0;
    let match;
    while (valuesIndex < values.length && (match = placeholdersRegex.exec(sql))) {
        const len = match[0].length;
        if (len > 2) {
            continue;
        }
        const value = len === 2
            ? escapeId(values[valuesIndex])
            : escape(values[valuesIndex], stringifyObjects, timeZone);
        result += sql.slice(chunkIndex, match.index) + value;
        chunkIndex = placeholdersRegex.lastIndex;
        valuesIndex++;
    }
    if (chunkIndex === 0) {
        // Nothing was replaced
        return sql;
    }
    if (chunkIndex < sql.length) {
        return result + sql.slice(chunkIndex);
    }
    return result;
}
function dateToString(date, timeZone) {
    const dt = new Date(date);
    if (isNaN(dt.getTime())) {
        return 'NULL';
    }
    let year;
    let month;
    let day;
    let hour;
    let minute;
    let second;
    let millisecond;
    if (timeZone === 'local') {
        year = dt.getFullYear();
        month = dt.getMonth() + 1;
        day = dt.getDate();
        hour = dt.getHours();
        minute = dt.getMinutes();
        second = dt.getSeconds();
        millisecond = dt.getMilliseconds();
    }
    else {
        const tz = convertTimezone(timeZone);
        if (tz !== false && tz !== 0) {
            dt.setTime(dt.getTime() + (tz * 60000));
        }
        year = dt.getUTCFullYear();
        month = dt.getUTCMonth() + 1;
        day = dt.getUTCDate();
        hour = dt.getUTCHours();
        minute = dt.getUTCMinutes();
        second = dt.getUTCSeconds();
        millisecond = dt.getUTCMilliseconds();
    }
    // YYYY-MM-DD HH:mm:ss.mmm
    const str = zeroPad(year, 4)
        + '-' + zeroPad(month, 2)
        + '-' + zeroPad(day, 2)
        + ' ' + zeroPad(hour, 2)
        + ':' + zeroPad(minute, 2)
        + ':' + zeroPad(second, 2)
        + '.' + zeroPad(millisecond, 3);
    return escapeString(str);
}
function bufferToString(buffer) {
    return 'X' + escapeString(buffer.toString('hex'));
}
function objectToValues(object, timeZone) {
    let sql = '';
    for (const key in object) {
        let val = object[key];
        if (typeof val === 'function') {
            continue;
        }
        sql += (sql.length === 0 ? '' : ', ') + escapeId(key) + ' = ' + escape(val, true, timeZone);
    }
    return sql;
}
function escapeString(val) {
    let chunkIndex = CHARS_GLOBAL_REGEXP.lastIndex = 0;
    let escapedVal = '';
    let match;
    while ((match = CHARS_GLOBAL_REGEXP.exec(val))) {
        escapedVal += val.slice(chunkIndex, match.index) + CHARS_ESCAPE_MAP[match[0]];
        chunkIndex = CHARS_GLOBAL_REGEXP.lastIndex;
    }
    if (chunkIndex === 0) {
        // Nothing was escaped
        return "'" + val + "'";
    }
    if (chunkIndex < val.length) {
        return "'" + escapedVal + val.slice(chunkIndex) + "'";
    }
    return "'" + escapedVal + "'";
}
function zeroPad(number, length) {
    let num = number.toString();
    while (num.length < length)
        num = '0' + num;
    return num;
}
function convertTimezone(tz) {
    if (tz === 'Z') {
        return 0;
    }
    const m = tz.match(/([\+\-\s])(\d\d):?(\d\d)?/);
    if (m) {
        return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) + ((m[3] ? parseInt(m[3], 10) : 0) / 60)) * 60;
    }
    return false;
}

/**
 * 分解字段列表
 * @param {Array<string>|string} columns
 * @return {Array<string>}
 */
function disassembleColumns(columns) {
    const fields = [];
    // ['', null, undefined, column1', 'column2,column3', ...]
    if (Array.isArray(columns)) {
        return columns.reduce(function (arr, column) {
            // 跳过 空字符串、undefined、null
            if (!column)
                return arr;
            if (typeof column !== 'string')
                error('Invalid column for give columns');
            return arr.concat(...disassembleColumns(column));
        }, fields);
    }
    stringed(columns, 'columns');
    return columns.split(/,/).reduce(function (arr, column) {
        return (column = column.trim()) ? arr.concat(column) : arr;
    }, fields);
}
function buildColumn(str, ignores, alias) {
    return tokenStringify(parseColumn(str), (str) => {
        if (ignores.indexOf(str) > -1)
            return escapeId(str, true); // 主要是处理别名的引用问题
        const parts = str.split('.');
        if (parts.length === 1 && alias)
            parts.unshift(alias);
        return parts.map(part => escapeId(part)).join('.');
    });
}
const descriptor = {
    writable: false,
    enumerable: true,
    configurable: false
};
function freezeBuilder(builder, exec) {
    Object.defineProperties(builder, {
        call: Object.assign({ value: builder.call.bind(builder, exec) }, descriptor),
        _table: Object.assign({ value: builder._table }, descriptor)
    });
    return builder;
}

const symbol = Symbol(__filename);
class ClauseBuilder {
    constructor() {
        this._clauses = [];
    }
    _appendWhere(column, value, operator = '=', isOr = false, valueIsColumn = false) {
        switch (operator.toUpperCase()) {
            case 'IS NULL':
            case 'IS NOT NULL':
                if (value)
                    error('can not set value');
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
        });
        return this;
    }
    where(column, operator, value) {
        const val = arguments.length < 3 ? symbol : value;
        return this._appendWhere(column, val, operator);
    }
    andWhere(column, operator, value) {
        const val = arguments.length < 3 ? symbol : value;
        return this._appendWhere(column, val, operator);
    }
    orWhere(column, operator, value) {
        const val = arguments.length < 3 ? symbol : value;
        return this._appendWhere(column, val, operator, true);
    }
    onColumn(first, second, operator) {
        required(second, 'second');
        return this._appendWhere(first, second, operator, false, true);
    }
    orColumn(first, second, operator) {
        required(second, 'second');
        return this._appendWhere(first, second, operator, true, true);
    }
    _appendClause(factory, isOr) {
        const builder = new ClauseBuilder();
        factory(builder);
        this._clauses.push({ builder, isOr });
        return this;
    }
    clause(factory) {
        return this._appendClause(factory, false);
    }
    andClause(factory) {
        return this._appendClause(factory, false);
    }
    orClause(factory) {
        return this._appendClause(factory, true);
    }
    build(options = {}) {
        const { ignores, alias } = options;
        const buildExpr = (expr) => {
            let column = buildColumn(expr.column, ignores, alias);
            switch (expr.operator.toUpperCase()) {
                case 'IS NULL':
                case 'IS NOT NULL':
                    return column + ' ' + expr.operator.toUpperCase();
                case 'BETWEEN':
                case 'NOT BETWEEN':
                    let value = ' ? AND ?';
                    if (expr.value)
                        value = format(value, expr.value);
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
        this._clauses.forEach((item, index) => {
            if (index > 0)
                sql += item.isOr ? ' OR ' : ' AND ';
            if ('builder' in item)
                sql += '(' + item.builder.build(options) + ')';
            else
                sql += buildExpr(item);
        });
        return sql.trim();
    }
}

class DeleteBuilder extends ClauseBuilder {
    /**
     * @see {IDeleteBuilder#from}
     */
    from(table) {
        stringed(table, 'table');
        this._table = table;
        return this;
    }
    /**
     * @see {IDeleteBuilder#take}
     */
    take(limit) {
        integer(limit, 'limit');
        this._limit = +limit;
        return this;
    }
    /**
     * @see {IDeleteBuilder#skip}
     */
    skip(count) {
        integer(count, 'count');
        if (!this._limit)
            error('The OFFSET is working together with LIMIT so first used take function');
        this._skip = +count;
        return this;
    }
    build(options = {}) {
        const where = super.build(Object.assign({
            ignores: [],
            alias: null
        }, options));
        let sql = 'DELETE FROM ' + escapeId(this._table);
        if (where)
            sql += ' WHERE ' + where;
        if (this._limit)
            sql += ' LIMIT ' + this._limit;
        if (this._skip)
            sql += ' OFFSET ' + this._skip;
        return sql;
    }
    call(exec, params) {
        return exec(this.build({}), params);
    }
}

class InsertBuilder {
    constructor() {
        this._columns = []; // 注意字段重复
    }
    /**
     * @see {InsertBuilder#into}
     */
    into(table) {
        stringed(table, 'table');
        this._table = table;
        return this;
    }
    /**
     * @see {InsertBuilder#set}
     */
    set(column, value) {
        stringed(column, 'column');
        const val = arguments.length < 2 ? symbol : value;
        this._columns.push({ column, value: val });
        return this;
    }
    /**
     * @see {InsertBuilder#setSome}
     */
    setSome(columns) {
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
    build(options) {
        const opts = Object.assign({
            ignores: [],
            alias: null
        }, options);
        const fields = [];
        const values = [];
        this._columns.forEach(item => {
            fields.push(buildColumn(item.column, opts.ignores, opts.alias));
            if (item.value === symbol)
                values.push('?');
            else
                values.push(escape(item.value, true));
        });
        if (!fields.length) {
            error('Miss data');
        }
        return 'INSERT INTO ' + escapeId(this._table)
            + ' (' + fields.join(', ') + ')'
            + ' VALUES (' + values.join(', ') + ')';
    }
    call(exec, params) {
        return exec(this.build({}), params);
    }
}

class JoinBuilder extends ClauseBuilder {
    constructor(table, type) {
        super();
        this._select = [];
        this._groupBy = [];
        this._orderBy = [];
        this._table = table;
        this._type = type;
    }
    setAlias(alias) {
        alias && stringed(alias, 'alias');
        this._alias = alias;
        return this;
    }
    select(columns) {
        required(columns, 'columns');
        const select = this._select.concat(disassembleColumns(columns));
        // 利用 Array.from 将 Set 结构转换成数组去重
        this._select = Array.from(new Set(select));
        return this;
    }
    groupBy(column, isDesc) {
        this._groupBy.push({ column, isDesc });
        return this;
    }
    orderBy(column, isDesc) {
        this._orderBy.push({ column, isDesc });
        return this;
    }
    build(options = {}) {
        let sql = (this._type ? this._type.toUpperCase() : '') + ' JOIN ';
        if (this._table instanceof JoinSelectBuilder) {
            sql += this._table.build(options);
        }
        else {
            sql += escapeId(this._table);
            if (this._alias) {
                options.ignores.push(this._alias);
                sql += ' AS ' + escapeId(this._alias);
            }
        }
        const on = super.build(options);
        if (on)
            sql += ' ON ' + on;
        return sql.trim();
    }
}
class SelectBuilder extends ClauseBuilder {
    constructor() {
        super(...arguments);
        this._select = [];
        this._join = [];
        this._groupBy = [];
        this._having = [];
        this._orderBy = [];
    }
    from(table, alias) {
        stringed(table, 'table');
        alias && stringed(alias, 'alias');
        this._table = table;
        this._alias = alias;
        return this;
    }
    select(columns) {
        required(columns, 'columns');
        const select = this._select.concat(disassembleColumns(columns));
        // 利用 Array.from 将 Set 结构转换成数组去重
        this._select = Array.from(new Set(select));
        return this;
    }
    join(table, type, joinFactory) {
        // join(selectFactory);
        if (typeof table === 'function') {
            const selector = new JoinSelectBuilder();
            table(selector);
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
            joinFactory(builder);
            this._join.push(builder);
        }
        return this;
    }
    take(limit) {
        integer(limit, 'limit');
        this._limit = +limit;
        return this;
    }
    skip(count) {
        integer(count, 'count');
        if (!this._limit)
            error('The OFFSET is working together with LIMIT so first used take function');
        this._skip = +count;
        return this;
    }
    groupBy(column, isDesc) {
        this._groupBy.push({ column, isDesc });
        return this;
    }
    orderBy(column, isDesc) {
        this._orderBy.push({ column, isDesc });
        return this;
    }
    having(havingFactory) {
        if (typeof havingFactory !== 'function')
            error('The havingFactory must be a function');
        const builder = new ClauseBuilder();
        havingFactory(builder);
        this._having.push({ builder });
        return this;
    }
    orHaving(havingFactory) {
        const havings = this.having(havingFactory)._having;
        havings[havings.length - 1].isOr = true;
        return this;
    }
    // SELECT [fields] FROM [table] [join] [where][group][having][order][limit][offset]';
    build(options = {}) {
        if (!this._table)
            error('must be use from() set table');
        // 如果 join 了其他的表则表示必须使用别名来处理字段
        const mustBeUseAlias = this._join.length > 0;
        const alias = this._alias || (mustBeUseAlias ? this._table : '');
        const opts = Object.assign({ ignores: [] }, options, { alias });
        if (alias)
            opts.ignores.push(alias);
        let sql = '';
        // [fields]
        const fields = [];
        const parseSelectedColumns = (arr, alias) => {
            arr.forEach(item => {
                if (item === '*') {
                    fields.push(alias ? escapeId(alias) + '.*' : '*');
                    return;
                }
                const parts = item.trim().split(/(?:^|\s+)as(?:\s+|$)/i);
                if (parts.length > 2)
                    error(`bad column expression "${item}"`);
                // 关键字 AS 前面没有字段名称
                let [field, asAlias] = parts;
                if (asAlias)
                    opts.ignores.push(asAlias);
                let subSql = buildColumn(field, opts.ignores, alias);
                if (asAlias)
                    subSql += ' AS ' + escapeId(asAlias);
                fields.push(subSql);
            });
        };
        parseSelectedColumns(this._select, alias);
        this._join.forEach((join) => {
            let joinedAlias = join._alias;
            if (!joinedAlias && join._table instanceof JoinSelectBuilder)
                joinedAlias = join._table._resultAlias;
            else if (!joinedAlias)
                joinedAlias = join._table;
            parseSelectedColumns(join._select, joinedAlias);
        });
        if (!fields.length) {
            fields.push('*');
        }
        sql += 'SELECT ' + fields.join(', ');
        // [table]
        if (!this._table)
            error('Please use "from()" set table for the select.');
        sql += ' FROM ' + escapeId(this._table);
        if (this._alias)
            sql += ' AS ' + escapeId(this._alias);
        // [join]
        // fixme: bad clause for on
        this._join.forEach(join => sql += ' ' + join.build(opts));
        // [where]
        const where = super.build(opts);
        if (where)
            sql += ' WHERE ' + where;
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
        sql += this._having.reduce(function (str, having, index) {
            if (index === 0)
                str += ' HAVING ';
            else
                str += having.isOr ? ' OR ' : ' AND ';
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
    call(exec, params) {
        return exec(this.build({}), params);
    }
}
class JoinSelectBuilder extends SelectBuilder {
    setAlias(alias) {
        alias && stringed(alias, 'alias');
        this._resultAlias = alias;
        return this;
    }
    build(options) {
        if (!this._resultAlias)
            error('Join a select must be use resultAlias');
        return '(' + super.build(options) + ') AS ' + escapeId(this._resultAlias, true);
    }
    call(exec, params) {
        return Promise.reject('cat not call "call()"');
    }
}

class UpdateBuilder extends ClauseBuilder {
    constructor() {
        super(...arguments);
        this._columns = [];
    }
    from(table) {
        stringed(table, 'table');
        this._table = table;
        return this;
    }
    set(column, value) {
        stringed(column, 'column');
        const val = arguments.length < 2 ? symbol : value;
        this._columns.push({ column, value: val });
        return this;
    }
    setSome(columns) {
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
    take(limit) {
        integer(limit, 'limit');
        this._limit = +limit;
        return this;
    }
    skip(count) {
        integer(count, 'limit');
        this._skip = +count;
        return this;
    }
    build(options = {}) {
        const opts = Object.assign({ ignores: [] }, options);
        let sql = 'UPDATE ' + escapeId(this._table);
        sql += ' SET ' + this._columns.reduce(function (str, item, index) {
            if (index > 0)
                str += ', ';
            str += buildColumn(item.column, opts.ignores, opts.alias) + ' = ';
            if (item.value === symbol)
                return str + '?';
            return str + escape(item.value, true);
        }, '');
        const where = super.build(opts);
        if (where)
            sql += ' WHERE ' + where;
        return sql;
    }
    call(exec, params) {
        return exec(this.build({}), params);
    }
}

class ModelBuilder {
    constructor(table, primaryKey = 'id') {
        this.table = table;
        this.primaryKey = primaryKey;
    }
    create(values) {
        return freezeBuilder(new InsertBuilder()
            .into(this.table)
            .setSome(values), ModelBuilder.execute);
    }
    getPrimaryKey() {
        return this.primaryKey;
    }
    get(columns) {
        return freezeBuilder(new SelectBuilder()
            .from(this.table)
            .select(columns), ModelBuilder.execute);
    }
    getOne(columns) {
        return this.get(columns).take(1);
    }
    getLast(columns) {
        return this.getOne(columns).orderBy(this.primaryKey, true);
    }
    getById(id, columns) {
        return this.get(columns).where(this.primaryKey, '=', id);
    }
    delete(where) {
        const builder = freezeBuilder(new DeleteBuilder().from(this.table), ModelBuilder.execute);
        if (!where) {
            return builder;
        }
        Object.keys(where).forEach(op => {
            const values = where[op];
            // {'>': 'c1,c2,...'}
            if (typeof values === 'string') {
                builder.where(values, op);
            }
            else if (Array.isArray(values)) {
                values.forEach(value => builder.where(op, value));
            }
            else {
                Object.keys(values).forEach(key => {
                    builder.where(key, op, values[key]);
                });
            }
        });
        return builder;
    }
    deleteById(id) {
        return freezeBuilder(new DeleteBuilder()
            .from(this.table)
            .where(this.primaryKey, '=', id), ModelBuilder.execute);
    }
    update(values) {
        return freezeBuilder(new UpdateBuilder()
            .from(this.table)
            .setSome(values), ModelBuilder.execute);
    }
    updateById(id, values) {
        return this.update(values).where(this.primaryKey, '=', id);
    }
}

let connection = null;
function createModel(table, pk = 'id') {
    return new ModelBuilder(table, pk);
}
function setOptions(options) {
    connection = mysql.createConnection(options);
}
function connectDatabase() {
    return connection.connect();
}
function closeTheConnection() {
    connection.end();
}
function execute(sql, params = []) {
    return new Promise(function (resolve, reject) {
        connection.query(sql, params, (err, rows, fields) => {
            if (err)
                return reject(err);
            // rows = JSON.parse(JSON.stringify(rows))[0];
            resolve({ rows, fields });
        });
    });
}
ModelBuilder.execute = execute;

exports.createModel = createModel;
exports.setOptions = setOptions;
exports.connectDatabase = connectDatabase;
exports.closeTheConnection = closeTheConnection;
exports.execute = execute;
exports.symbol = symbol;
exports.ClauseBuilder = ClauseBuilder;
exports.DeleteBuilder = DeleteBuilder;
exports.InsertBuilder = InsertBuilder;
exports.JoinBuilder = JoinBuilder;
exports.SelectBuilder = SelectBuilder;
exports.JoinSelectBuilder = JoinSelectBuilder;
exports.UpdateBuilder = UpdateBuilder;
