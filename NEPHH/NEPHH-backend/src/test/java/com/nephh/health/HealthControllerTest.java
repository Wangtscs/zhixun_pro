package com.nephh.health;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class HealthControllerTest {
 private DataSource h2() {
  return new DriverManagerDataSource("jdbc:h2:mem:health_verification;DB_CLOSE_DELAY=-1","sa","");
 }

 @Test void markerIsOffByDefaultWithoutConnectingToDatabase() {
  var dataSource=mock(DataSource.class);
  var environment=new MockEnvironment();environment.setActiveProfiles("local");
  var response=new HealthController(dataSource,environment,false).health();
  assertEquals(0,response.code());
  assertEquals("UP",response.data().get("status"));
  assertEquals("nephh-backend",response.data().get("application"));
  assertEquals(false,response.data().get("isolatedVerification"));
  verifyNoInteractions(dataSource);
 }

 @Test void explicitLocalH2MayAdvertiseIsolatedVerification() {
  var environment=new MockEnvironment();environment.setActiveProfiles("local");
  var response=new HealthController(h2(),environment,true).health();
  assertEquals(true,response.data().get("isolatedVerification"));
  assertEquals(3,response.data().size());
 }

 @Test void defaultLocalH2MayAdvertiseIsolatedVerification() {
  var environment=new MockEnvironment();environment.setDefaultProfiles("local");
  assertEquals(true,new HealthController(h2(),environment,true).health().data().get("isolatedVerification"));
 }

 @Test void nonLocalAndMixedProfilesNeverAdvertiseIsolation() {
  var dataSource=mock(DataSource.class);
  for(String[] profiles:new String[][]{{"prod"},{"mysql"},{"local","prod"}}) {
   var environment=new MockEnvironment();environment.setDefaultProfiles("local");environment.setActiveProfiles(profiles);
   assertEquals(false,new HealthController(dataSource,environment,true).health().data().get("isolatedVerification"));
  }
  verifyNoInteractions(dataSource);
 }

 @Test void databaseProductMustActuallyBeH2() throws Exception {
  var environment=new MockEnvironment();environment.setActiveProfiles("local");
  var dataSource=mock(DataSource.class);var connection=mock(Connection.class);var metadata=mock(DatabaseMetaData.class);
  when(dataSource.getConnection()).thenReturn(connection);when(connection.getMetaData()).thenReturn(metadata);
  when(metadata.getDatabaseProductName()).thenReturn("MySQL");
  assertEquals(false,new HealthController(dataSource,environment,true).health().data().get("isolatedVerification"));
  verify(connection).close();verify(metadata,never()).getURL();
 }

 @Test void unavailableDatabaseCannotAdvertiseIsolation() throws Exception {
  var environment=new MockEnvironment();environment.setActiveProfiles("local");
  var dataSource=mock(DataSource.class);when(dataSource.getConnection()).thenThrow(new SQLException("unavailable"));
  var response=new HealthController(dataSource,environment,true).health();
  assertEquals(false,response.data().get("isolatedVerification"));
  assertEquals("UP",response.data().get("status"));
 }
}
