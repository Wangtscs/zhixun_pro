package com.nephh.config;
import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.*;
@Configuration
@MapperScan("com.nephh.system.mapper")
public class MybatisPlusConfig {
 @Bean MybatisPlusInterceptor mybatisPlusInterceptor() {
  var interceptor=new MybatisPlusInterceptor();
  var pagination=new PaginationInnerInterceptor(DbType.MYSQL); pagination.setMaxLimit(200L);
  interceptor.addInnerInterceptor(pagination); return interceptor;
 }
}
