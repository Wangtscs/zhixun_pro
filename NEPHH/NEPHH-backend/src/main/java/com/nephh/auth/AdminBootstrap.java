package com.nephh.auth;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.nephh.system.entity.SysUser;
import com.nephh.system.mapper.SysUserMapper;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
@Configuration
public class AdminBootstrap {
 @Bean ApplicationRunner initialAdmin(SysUserMapper users,PasswordEncoder passwords,
   @Value("${ADMIN_USERNAME:}") String username,@Value("${ADMIN_PASSWORD:}") String password) {
  return args -> {
   if(username.isBlank() && password.isBlank())return;
   if(username.isBlank() || username.length()>64 || password.length()<12 || password.length()>72)
    throw new IllegalArgumentException("ADMIN_USERNAME is required and ADMIN_PASSWORD must contain 12-72 characters");
   if(users.selectCount(new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername,username))==0) {
    var user=new SysUser();user.setRoleCode("ADMIN");user.setUsername(username);user.setPasswordHash(passwords.encode(password));user.setEnabled(true);users.insert(user);
   }
  };
 }
}
