const {
  SelectBuilder,
  DeleteBuilder,
  InsertBuilder,
  UpdateBuilder,
  createModel
} = require('./dist/index');

const {expect} = require('chai');

describe('select', function () {
  it('简单查询', function () {
    expect(new SelectBuilder()
      .from('users')
      .build())
      .to
      .be
      .equal('SELECT * FROM `users`');
  });

  it('带条件查询', function () {
    expect(new SelectBuilder()
      .from('users')
      .where('created', '>')
      .build())
      .to
      .be
      .equal('SELECT * FROM `users` WHERE `created` > ?');
  });

  it('带多个条件的', function () {
    expect(new SelectBuilder()
      .from('users')
      .where('created', '>')
      .andWhere('role')
      .build()) // done
      .to
      .be
      .equal('SELECT * FROM `users` WHERE `created` > ? AND `role` = ?');
  });

  it('OR和AND混用', function () {
    expect(new SelectBuilder()
      .from('users')
      .where('created', '>')
      .orWhere('role')
      .build()) // done
      .to.be.equal('SELECT * FROM `users` WHERE `created` > ? OR `role` = ?');
  });

  it('复合条件', function () {
    expect(new SelectBuilder()
      .from('users')
      .where('created', '>')
      .clause(clause => clause.where('role').andWhere('age', '>', 18))
      .build())// done
      .to.be.equal('SELECT * FROM `users` WHERE `created` > ? AND (`role` = ? AND `age` > 18)');
  });

  it('join一张表', function () {
    expect(new SelectBuilder()
      .from('users', 'u')
      .join('roles', join => join.setAlias('r').onColumn('r.role', 'u.role'))
      .build({})) // done
      .to
      .be
      .equal('SELECT * FROM `users` AS `u` JOIN `roles` AS `r` ON `r`.`role` = `u`.`role`');
  });

  it('left join一张表', function () {
    expect(new SelectBuilder()
      .from('users', 'u')
      .select('*')
      .join('roles', 'left', join => join.setAlias('r').onColumn('r.role', 'u.role'))
      .build()) // done
      .to
      .be
      .equal('SELECT `u`.* FROM `users` AS `u` LEFT JOIN `roles` AS `r` ON `r`.`role` = `u`.`role`');
  });

  it('join查询结果', function () {
    expect(new SelectBuilder()
      .from('users', 'u')
      .select('*')
      .join(selector => selector.from('roles').setAlias('r'))
      .build()) // done
      .to
      .be
      .equal('SELECT `u`.* FROM `users` AS `u` JOIN (SELECT * FROM `roles`) AS `r`');
  });
});

describe('delete', function () {
  it('简单删除', function () {
    expect(new DeleteBuilder()
      .from('users')
      .where('age', '>')
      .build({})) // done
      .to
      .be
      .equal('DELETE FROM `users` WHERE `age` > ?')
  });

  it('多条件', function () {
    expect(new DeleteBuilder()
      .from('users')
      .where('age', '>')
      .orWhere('age', '<')
      .build({})) // done
      .to
      .be
      .equal('DELETE FROM `users` WHERE `age` > ? OR `age` < ?')
  });
});

describe('insert', function () {
  it('添加一条数据', function () {
    expect(new InsertBuilder()
      .into('users')
      .set('name', 'ok')
      .setSome(['role', 'hero'])
      .build({})) // done
      .to
      .be
      .equal("INSERT INTO `users` (`name`, `role`, `hero`) VALUES ('ok', ?, ?)");
  });
});


describe('update', function () {
  it('数据更新', function () {
    expect(new UpdateBuilder()
      .from('users')
      .set('name', 'super girl')
      .setSome({})
      .where('age', '>')
      .build({})) // done
      .to
      .be
      .equal("UPDATE `users` SET `name` = 'super girl' WHERE `age` > ?");
  });

  it('create model', function () {
    expect(createModel('users')
      .get('name,role,baby')
      .build())
      .to
      .be
      .equal('SELECT `name`, `role`, `baby` FROM `users`');
  });
});
