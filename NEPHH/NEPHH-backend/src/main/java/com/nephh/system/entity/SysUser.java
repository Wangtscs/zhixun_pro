package com.nephh.system.entity;
import lombok.Data;
import com.baomidou.mybatisplus.annotation.TableName;
@Data
@TableName("sys_user")
public class SysUser { private Long id; private String username; @com.fasterxml.jackson.annotation.JsonIgnore private String passwordHash; private Boolean enabled; private String roleCode; private String displayName; private java.time.LocalDateTime createdAt; }
