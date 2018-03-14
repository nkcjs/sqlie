# Sqlie

A simple SQL query builder.

[![npm](https://img.shields.io/npm/v/sqlie.svg)](https://www.npmjs.com/package/sqlie)
[![npm](https://img.shields.io/npm/dt/sqlie.svg)](https://www.npmjs.com/package/sqlie)

>  There are many sql query builders out there. But this one makes more sense to me.

![](sqlie.png)

## Install

```bash
$ npm install sqlie --save
```

## Examples

#### SELECT

1. A base **SELECT:**

    ```js
    const {SelectBuilder} = require('sqlite');
    
    const builder = new SelectBuilder()
      .from('users')
      .select('name,age,address')
      .where('name', '=', 'Jon Snow')
      .where('age', '=', 22);
    
    builder.build();
    // => SELECT `name`, `age`, `address` FROM `users` WHERE `name` = 'Swat' AND `age` = 22
    ```

2. **SELECT** with a simple **JOIN**:
    
    ```js
    const {SelectBuilder} = require('sqlie');
    
    const builder = new SelectBuilder()
      .from('users', 'u') // alias 'u' for table 'users'
      .select('*') // optional with select all
      .where('name', '=', 'Jon Snow')
      .where('age', '=', 22)
      .join('hobbies', function(hobbyBuilder) {
        hobbyBuilder
          .setAlias('h')
          .select('hobby') // select 'hobby' from table 'hobbies'
          .onColumn('h.id', 'u.id');
      })
      .join('colors', function(colorBuilder) {
        colorBuilder
          .setAlias('c')
          .select('favorite') // select 'favorite' from table 'colors'
          .onColumn('c.user_id', 'u.id');
      });
    
    builder.build();
    // => SELECT `u`.*, `h`.`hobby`, `c`.favorite FROM `users`
    //    JOIN `hobbies` ON `h`.`id` = `u`.`id`
    //    JOIN `colors` ON `c`.`user_id` = `u`.`id`
    //    WHERE `u`.`name` = 'Jon Snow' AND `u`.`age` = 22
    ```

3. **INSERT**

    ```js
    const {InsertBuilder} = require('./dist');
    
    const builder = new InsertBuilder()
      .into('users')
      .set('name', 'Super Girl')
      .setSome({
        age: 18,
        gender: 'female'
      });
    
    builder.build();
    // => INSERT INTO `users` (`name`, `age`, `gender`) VALUES ('Super Girl', 18, 'female')
    ```

4. **UPDATE**

    ```js
    const {UpdateBuilder} = require('./dist');
    
    const builder = new UpdateBuilder()
      .from('users')
      .set('age', 22)
      .setSome({})
      .where('name', '=', 'Super Girl');
    
    builder.build();
    // => UPDATE `users` SET `age` = 22 WHERE `name` = 'Super Girl'
    ```
    
## Licence

MIT © Frge <frge@mail.com>
