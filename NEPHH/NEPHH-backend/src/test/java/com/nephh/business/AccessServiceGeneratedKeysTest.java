package com.nephh.business;

import java.math.BigInteger;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Generated-key behavior covered by Surefire, including H2 timestamp defaults. */
class AccessServiceGeneratedKeysTest {
  private AccessService service(Map<String, Object> returnedKeys) {
    JdbcTemplate db = new JdbcTemplate() {
      @Override public int update(PreparedStatementCreator statement, KeyHolder keys) {
        if (returnedKeys != null) keys.getKeyList().add(new LinkedHashMap<>(returnedKeys));
        return 1;
      }
    };
    return new AccessService(db, null);
  }

  @Test void acceptsNumericKeysWithDriverSpecificLabels() {
    for (String label : new String[]{"id", "ID", "GENERATED_KEY"}) {
      assertEquals(42, service(Map.of(label, 42L)).insert("unused"), label);
    }
  }

  @Test void acceptsMysqlUnsignedNumericKey() {
    assertEquals(314, service(Map.of("GENERATED_KEY", BigInteger.valueOf(314))).insert("unused"));
  }

  @Test void rejectsMissingKey() {
    var error = assertThrows(IllegalStateException.class, () -> service(null).insert("unused"));
    assertEquals("Insert did not return an id", error.getMessage());
  }

  @Test void rejectsAmbiguousKeysInsteadOfGuessing() {
    assertThrows(InvalidDataAccessApiUsageException.class,
        () -> service(Map.of("id", 42L, "other", 43L)).insert("unused"));
  }

  @Test void insertsRowWithTimestampDefaultAndPreservesTransactionalAssociation() {
    var source = new DriverManagerDataSource(
        "jdbc:h2:mem:generated_keys_junit;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
    var db = new JdbcTemplate(source);
    db.execute("create table work_order (id bigint auto_increment primary key,"
        + "title varchar(200) not null,created_at timestamp default current_timestamp)");
    db.execute("create table order_event (id bigint auto_increment primary key,"
        + "order_id bigint references work_order(id),action varchar(30))");
    var access = new AccessService(db, null);
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    transaction.executeWithoutResult(status -> {
      long id = access.insert("insert into work_order(title) values (?)", "generated-key regression");
      assertTrue(id > 0);
      db.update("insert into order_event(order_id,action) values (?,?)", id, "CREATE");
      assertEquals(1, db.queryForObject("select count(*) from order_event where order_id=?", Integer.class, id));
      status.setRollbackOnly();
    });
    assertEquals(0, db.queryForObject("select count(*) from work_order", Integer.class));
    assertEquals(0, db.queryForObject("select count(*) from order_event", Integer.class));
  }
}
