package com.nephh.business;

import java.math.BigInteger;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.support.TransactionTemplate;

/** Run with scripts/verify-generated-keys.ps1; uses only an isolated H2 database. */
public class AccessServiceGeneratedKeysRegression {
  private static int passed, failed;
  static void check(String name, Runnable test) {
    try { test.run(); passed++; System.out.println("PASS " + name); }
    catch (Throwable error) { failed++; System.out.println("FAIL " + name + ": " + error); }
  }
  static void expect(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }
  static AccessService service(Map<String,Object> returnedKeys) {
    JdbcTemplate db = new JdbcTemplate() {
      @Override public int update(PreparedStatementCreator statement, KeyHolder keys) {
        if (returnedKeys != null) keys.getKeyList().add(new LinkedHashMap<>(returnedKeys));
        return 1;
      }
    };
    return new AccessService(db, null);
  }
  public static void main(String[] args) {
    for (String label : new String[]{"id", "ID", "GENERATED_KEY"}) {
      check("numeric key labelled " + label, () ->
          expect(service(Map.of(label, 42L)).insert("insert into fixture values (?)", "value") == 42,
              "returned id must not depend on the driver column label"));
    }
    check("MySQL unsigned numeric key", () ->
        expect(service(Map.of("GENERATED_KEY", BigInteger.valueOf(314))).insert("unused") == 314,
            "numeric driver values must be accepted"));
    check("missing key fails explicitly", () -> {
      try { service(null).insert("unused"); throw new AssertionError("missing key was accepted"); }
      catch (IllegalStateException expected) {
        expect(expected.getMessage().equals("Insert did not return an id"), "unexpected failure");
      }
    });
    check("ambiguous keys are rejected", () -> {
      try { service(Map.of("id", 42L, "other", 43L)).insert("unused"); throw new AssertionError("ambiguous keys accepted"); }
      catch (InvalidDataAccessApiUsageException expected) { /* do not guess a key */ }
    });
    check("H2 real insert, event association and transaction rollback", () -> {
      var source = new DriverManagerDataSource("jdbc:h2:mem:generated_key_regression;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
      var db = new JdbcTemplate(source);
      db.execute("create table work_order (id bigint auto_increment primary key,title varchar(200) not null)");
      db.execute("create table order_event (id bigint auto_increment primary key,order_id bigint references work_order(id),action varchar(30))");
      var access = new AccessService(db, null);
      var transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
      transaction.executeWithoutResult(status -> {
        long id = access.insert("insert into work_order(title) values (?)", "generated-key regression");
        expect(id > 0, "actual generated id unavailable");
        db.update("insert into order_event(order_id,action) values (?,?)", id, "CREATE");
        expect(db.queryForObject("select count(*) from order_event where order_id=?", Integer.class, id) == 1,
            "event must refer to the newly created order");
        status.setRollbackOnly();
      });
      expect(db.queryForObject("select count(*) from work_order", Integer.class) == 0, "order was not rolled back");
      expect(db.queryForObject("select count(*) from order_event", Integer.class) == 0, "event was not rolled back");
    });
    System.out.println("Generated key regression: " + passed + " passed, " + failed + " failed");
    if (failed != 0) System.exit(1);
  }
}
